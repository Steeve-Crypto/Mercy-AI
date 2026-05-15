from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from evals.ragas_harness import DEFAULT_GOLDEN_PATH, MINIMUM_GOLDEN_CASES, RegressionGoldenCase, load_golden_dataset
from observability import trace_event, trace_span
from prompts.dc_legal_prompts import MANDATORY_REVIEW_DISCLAIMER
from prompts.registry import get_prompt_registry


FINETUNE_DATASET_VERSION = "dc-lora-qlora-dataset-1.0"
DEFAULT_OUTPUT_DIR = Path("finetune/data")
DEFAULT_TRAIN_PATH = DEFAULT_OUTPUT_DIR / "dc_lora_train.jsonl"
DEFAULT_VALIDATION_PATH = DEFAULT_OUTPUT_DIR / "dc_lora_validation.jsonl"
DEFAULT_MANIFEST_PATH = DEFAULT_OUTPUT_DIR / "dataset_manifest.json"
GOLDEN_ALIASES = {
    "dc_regression_golden": DEFAULT_GOLDEN_PATH,
    "dc_regression_golden.jsonl": DEFAULT_GOLDEN_PATH,
}


@dataclass(frozen=True)
class PreparedDatasetSummary:
    version: str
    train_path: str
    validation_path: str
    manifest_path: str
    source_golden_path: str
    total_records: int
    train_records: int
    validation_records: int
    langsmith_trace_records: int
    practice_area_counts: dict[str, int]
    sha256: str
    generated_at: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def prepare_lora_dataset(
    *,
    golden: str | Path = "dc_regression_golden",
    output: str | Path = DEFAULT_OUTPUT_DIR,
    validation_ratio: float = 0.1,
    min_cases: int = MINIMUM_GOLDEN_CASES,
) -> PreparedDatasetSummary:
    output_dir = Path(output)
    output_dir.mkdir(parents=True, exist_ok=True)
    golden_path = _resolve_golden_path(golden)
    cases = load_golden_dataset(golden_path)
    if len(cases) < min_cases:
        raise ValueError(f"Expected at least {min_cases} golden cases for LoRA preparation; found {len(cases)}.")
    report = _load_best_regression_report()
    traces_by_case = _trace_rows_by_case(report)
    with trace_span(
        "lora_dataset_preparation",
        "fine_tune_dataset_builder",
        "fine_tuning",
        metadata={"golden_path": str(golden_path), "case_count": len(cases), "dataset_version": FINETUNE_DATASET_VERSION},
    ) as span:
        records = [_training_record(case, traces_by_case.get(case.id)) for case in cases]
        validation_count = max(1, round(len(records) * max(0.0, min(validation_ratio, 0.5))))
        validation_records = records[-validation_count:]
        train_records = records[:-validation_count]
        train_path = output_dir / "dc_lora_train.jsonl"
        validation_path = output_dir / "dc_lora_validation.jsonl"
        _write_jsonl(train_path, train_records)
        _write_jsonl(validation_path, validation_records)
        digest = _file_sha256(train_path, validation_path)
        practice_counts: dict[str, int] = {}
        for record in records:
            area = str(record["metadata"].get("practice_area") or "unknown")
            practice_counts[area] = practice_counts.get(area, 0) + 1
        summary = PreparedDatasetSummary(
            version=FINETUNE_DATASET_VERSION,
            train_path=str(train_path),
            validation_path=str(validation_path),
            manifest_path=str(output_dir / "dataset_manifest.json"),
            source_golden_path=str(golden_path),
            total_records=len(records),
            train_records=len(train_records),
            validation_records=len(validation_records),
            langsmith_trace_records=len([record for record in records if record["metadata"].get("langsmith_run_url")]),
            practice_area_counts=dict(sorted(practice_counts.items())),
            sha256=digest,
            generated_at=datetime.now(UTC).isoformat(),
        )
        manifest = {
            **summary.to_dict(),
            "training_contract": {
                "format": "chat_messages_jsonl",
                "default_training_mode": "qlora_4bit",
                "base_prompt_source": "PD039 PromptRegistry",
                "golden_source": "PD044 DC RAGAS regression golden set",
                "attorney_review_required": True,
                "official_dc_grounding_required": True,
                "source_id_required": True,
            },
            "regression_report": _safe_report_metadata(report),
        }
        Path(summary.manifest_path).write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
        span["metadata"] = {**span.get("metadata", {}), **summary.to_dict()}
    trace_event(
        name="lora_dataset_prepared",
        surface_context="fine_tuning",
        category="fine_tuning",
        metadata=summary.to_dict(),
    )
    return summary


def dataset_manifest(path: str | Path = DEFAULT_MANIFEST_PATH) -> dict[str, Any]:
    manifest_path = Path(path)
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _training_record(case: RegressionGoldenCase, trace_row: dict[str, Any] | None) -> dict[str, Any]:
    registry = get_prompt_registry()
    source = {
        "source_id": case.expected_source_id,
        "citation_label": case.expected_citation,
        "authority_type": case.authority_type,
        "jurisdiction": "District of Columbia",
        "verification_status": "official_verified",
    }
    matter_context = {
        **case.matter_context,
        "practice_area": case.practice_area,
        "authority_type": case.authority_type,
        "jurisdiction": "District of Columbia",
        "surface_context": "fine_tune_dataset_builder",
    }
    rendered = registry.render(task=case.question, matter_context=matter_context, retrieved_sources=[source], route_expert="research")
    assistant_payload = {
        "answer": _trace_answer(case, trace_row),
        "official_dc_grounding_status": "grounded_in_verified_official_dc_sources",
        "citations": [{"label": case.expected_citation, "source_id": case.expected_source_id, "requires_verification": True}],
        "source_ids": [case.expected_source_id],
        "attorney_review_disclaimer": MANDATORY_REVIEW_DISCLAIMER,
        "verification_checklist": [
            "Verify the citation and pinpoint support in the official D.C. source.",
            "Confirm the source is current before filing or sending work product.",
            "Apply professional judgment and D.C. Rules of Professional Conduct duties.",
        ],
    }
    messages = [
        {"role": "system", "content": rendered.system_prompt},
        {"role": "user", "content": rendered.user_prompt},
        {"role": "assistant", "content": json.dumps(assistant_payload, sort_keys=True)},
    ]
    metrics = trace_row.get("metrics") if isinstance(trace_row, dict) and isinstance(trace_row.get("metrics"), dict) else {}
    return {
        "id": case.id,
        "messages": messages,
        "instruction": rendered.user_prompt,
        "response": assistant_payload,
        "metadata": {
            "dataset_version": FINETUNE_DATASET_VERSION,
            "prompt_template_id": rendered.template.template_id,
            "prompt_version": rendered.template.version,
            "practice_area": case.practice_area,
            "difficulty": _difficulty_for_case(case),
            "authority_type": case.authority_type,
            "source_ids": [case.expected_source_id],
            "expected_chunk_id": case.expected_chunk_id,
            "expected_citation": case.expected_citation,
            "tags": sorted(set(case.tags + ["fine_tune_ready", "official_dc_grounded", "attorney_review_required"])),
            "langsmith_trace_id": trace_row.get("trace_id") if isinstance(trace_row, dict) else None,
            "langsmith_run_url": trace_row.get("langsmith_run_url") if isinstance(trace_row, dict) else None,
            "ragas_metrics": metrics,
            "structured_output": True,
            "jurisdiction": "District of Columbia",
        },
    }


def _trace_answer(case: RegressionGoldenCase, trace_row: dict[str, Any] | None) -> str:
    if isinstance(trace_row, dict) and trace_row.get("answer"):
        return str(trace_row["answer"])
    return case.ground_truth


def _difficulty_for_case(case: RegressionGoldenCase) -> str:
    advanced = {"administrative", "zoning", "probate", "evidence", "appellate", "regulation"}
    signals = " ".join([case.practice_area, case.authority_type, *case.tags]).lower()
    if any(item in signals for item in advanced):
        return "advanced"
    if any(item in signals for item in {"family", "criminal", "civil", "housing"}):
        return "intermediate"
    return "foundational"


def _resolve_golden_path(golden: str | Path) -> Path:
    value = Path(str(golden))
    if str(golden) in GOLDEN_ALIASES:
        return GOLDEN_ALIASES[str(golden)]
    return value


def _load_best_regression_report(report_dir: str | Path = "evals/reports") -> dict[str, Any]:
    candidates = sorted(Path(report_dir).glob("*.json"))
    best: tuple[int, float, dict[str, Any]] | None = None
    for path in candidates:
        try:
            report = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        dataset_size = int(report.get("dataset_size") or 0)
        generated = str(report.get("generated_at") or "")
        score = float((report.get("aggregate") or {}).get("overall_score") or 0.0) if isinstance(report.get("aggregate"), dict) else 0.0
        rank = 2 if dataset_size >= MINIMUM_GOLDEN_CASES else 1
        current = (rank, score, {**report, "_report_path": str(path), "_generated_sort": generated})
        if best is None or (current[0], current[1], generated) > (best[0], best[1], str(best[2].get("_generated_sort") or "")):
            best = current
    return best[2] if best else {}


def _trace_rows_by_case(report: dict[str, Any]) -> dict[str, dict[str, Any]]:
    rows = report.get("rows") if isinstance(report.get("rows"), list) else []
    return {str(row.get("id")): row for row in rows if isinstance(row, dict) and row.get("id")}


def _safe_report_metadata(report: dict[str, Any]) -> dict[str, Any]:
    aggregate = report.get("aggregate") if isinstance(report.get("aggregate"), dict) else {}
    return {
        "available": bool(report),
        "report_path": report.get("_report_path") or report.get("report_path"),
        "generated_at": report.get("generated_at"),
        "dataset_size": report.get("dataset_size"),
        "overall_score": aggregate.get("overall_score"),
        "pass_rate": aggregate.get("pass_rate"),
        "passed": report.get("passed"),
    }


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.write_text("\n".join(json.dumps(row, sort_keys=True) for row in rows) + "\n", encoding="utf-8")


def _file_sha256(*paths: Path) -> str:
    digest = hashlib.sha256()
    for path in paths:
        digest.update(path.read_bytes())
    return digest.hexdigest()


__all__ = ["FINETUNE_DATASET_VERSION", "PreparedDatasetSummary", "dataset_manifest", "prepare_lora_dataset"]
