from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from statistics import mean
from typing import Any

from dc_knowledge_rag import retrieve_dc_knowledge


RAGAS_EVAL_VERSION = "ragas-eval-1.0"
DEFAULT_DATASET_PATH = Path(__file__).resolve().parent / "datasets" / "dc_golden_dataset.jsonl"
DEFAULT_REPORT_PATH = Path(__file__).resolve().parent / "reports" / "ragas_eval_report.json"
METRICS = (
    "faithfulness",
    "answer_relevancy",
    "context_precision",
    "context_recall",
    "answer_correctness",
)


@dataclass
class GoldenExample:
    id: str
    question: str
    ground_truth: str
    expected_citations: list[str]
    expected_source_ids: list[str]
    matter_context: dict[str, Any] = field(default_factory=dict)
    tags: list[str] = field(default_factory=list)


@dataclass
class EvaluationRow:
    id: str
    question: str
    answer: str
    expected_citations: list[str]
    retrieved_citations: list[str]
    expected_source_ids: list[str]
    retrieved_source_ids: list[str]
    metrics: dict[str, float]
    pass_threshold: bool
    verification_status: str
    issues: list[str]


def load_golden_dataset(path: str | Path = DEFAULT_DATASET_PATH) -> list[GoldenExample]:
    dataset_path = Path(path)
    examples: list[GoldenExample] = []
    with dataset_path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            data = json.loads(line)
            examples.append(
                GoldenExample(
                    id=str(data.get("id") or f"row-{line_number}"),
                    question=str(data["question"]),
                    ground_truth=str(data["ground_truth"]),
                    expected_citations=[str(item) for item in data.get("expected_citations", [])],
                    expected_source_ids=[str(item) for item in data.get("expected_source_ids", [])],
                    matter_context=data.get("matter_context") if isinstance(data.get("matter_context"), dict) else {},
                    tags=[str(item) for item in data.get("tags", [])],
                )
            )
    return examples


def run_ragas_evaluation(
    dataset_path: str | Path = DEFAULT_DATASET_PATH,
    top_k: int = 5,
    limit: int | None = None,
    pass_threshold: float = 0.72,
    write_report: bool = False,
    report_path: str | Path = DEFAULT_REPORT_PATH,
) -> dict[str, Any]:
    examples = load_golden_dataset(dataset_path)
    if limit is not None:
        examples = examples[: max(0, limit)]

    rows = [_evaluate_example(example, top_k=top_k, pass_threshold=pass_threshold) for example in examples]
    aggregate = _aggregate(rows)
    report = {
        "eval_version": RAGAS_EVAL_VERSION,
        "dataset_path": str(Path(dataset_path)),
        "dataset_size": len(examples),
        "metrics": METRICS,
        "aggregate": aggregate,
        "pass_threshold": pass_threshold,
        "passed": all(row.pass_threshold for row in rows) if rows else False,
        "generated_at": datetime.now(UTC).isoformat(),
        "rows": [asdict(row) for row in rows],
        "ci": {
            "runnable_locally": True,
            "requires_network": False,
            "requires_llm": False,
            "note": "Deterministic RAGAS-style metrics; can be replaced by the external ragas package when CI secrets and model access are configured.",
        },
    }

    if write_report:
        destination = Path(report_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
        report["report_path"] = str(destination)

    return report


def _evaluate_example(example: GoldenExample, top_k: int, pass_threshold: float) -> EvaluationRow:
    retrieval = retrieve_dc_knowledge(
        query=example.question,
        matter_context=example.matter_context,
        top_k=top_k,
        route={"expert": "research", "route_mode": "ragas_eval"},
        agentic=True,
    )
    results = retrieval.get("results") or []
    retrieved_source_ids = [
        str(result.get("provenance", {}).get("source_id"))
        for result in results
        if result.get("provenance", {}).get("source_id")
    ]
    retrieved_citations = [
        str(result.get("citation", {}).get("label"))
        for result in results
        if result.get("citation", {}).get("label")
    ]
    answer = _synthesized_answer(results)
    metrics = {
        "faithfulness": _faithfulness(answer, results),
        "answer_relevancy": _answer_relevancy(example.question, answer),
        "context_precision": _context_precision(example.expected_source_ids, retrieved_source_ids),
        "context_recall": _context_recall(example.expected_source_ids, retrieved_source_ids),
        "answer_correctness": _answer_correctness(example.ground_truth, answer, example.expected_citations, retrieved_citations),
    }
    issues = _row_issues(example, retrieved_source_ids, retrieved_citations, retrieval)
    row_score = mean(metrics.values()) if metrics else 0.0
    return EvaluationRow(
        id=example.id,
        question=example.question,
        answer=answer,
        expected_citations=example.expected_citations,
        retrieved_citations=retrieved_citations,
        expected_source_ids=example.expected_source_ids,
        retrieved_source_ids=retrieved_source_ids,
        metrics={key: round(value, 4) for key, value in metrics.items()},
        pass_threshold=row_score >= pass_threshold and not any(issue == "missing_expected_context" for issue in issues),
        verification_status=str(retrieval.get("verification", {}).get("status") or "unknown"),
        issues=issues,
    )


def _synthesized_answer(results: list[dict[str, Any]]) -> str:
    if not results:
        return "No retrieved D.C. knowledge context is available; attorney verification is required before answering."
    summaries = []
    for result in results[:3]:
        citation = result.get("citation", {}).get("label") or "[VERIFY CITE]"
        summary = result.get("summary") or result.get("text") or "Candidate authority requires verification."
        summaries.append(f"{summary} Source: {citation}.")
    return " ".join(summaries)


def _faithfulness(answer: str, results: list[dict[str, Any]]) -> float:
    answer_tokens = set(_tokens(answer))
    context_tokens = set()
    for result in results:
        context_tokens.update(_tokens(str(result.get("summary") or "")))
        context_tokens.update(_tokens(str(result.get("text") or "")))
        context_tokens.update(_tokens(str(result.get("citation", {}).get("label") or "")))
    if not answer_tokens:
        return 0.0
    return len(answer_tokens & context_tokens) / len(answer_tokens)


def _answer_relevancy(question: str, answer: str) -> float:
    question_tokens = set(_tokens(question))
    answer_tokens = set(_tokens(answer))
    if not question_tokens:
        return 0.0
    legal_bonus = 0.12 if {"d.c", "dc", "attorney", "verification", "confidentiality", "record"} & answer_tokens else 0.0
    return min(1.0, (len(question_tokens & answer_tokens) / len(question_tokens)) + legal_bonus)


def _context_precision(expected_source_ids: list[str], retrieved_source_ids: list[str]) -> float:
    if not retrieved_source_ids:
        return 0.0
    expected = set(expected_source_ids)
    hits = [source_id for source_id in retrieved_source_ids if source_id in expected]
    return len(hits) / len(retrieved_source_ids)


def _context_recall(expected_source_ids: list[str], retrieved_source_ids: list[str]) -> float:
    if not expected_source_ids:
        return 1.0
    expected = set(expected_source_ids)
    retrieved = set(retrieved_source_ids)
    return len(expected & retrieved) / len(expected)


def _answer_correctness(
    ground_truth: str,
    answer: str,
    expected_citations: list[str],
    retrieved_citations: list[str],
) -> float:
    truth_tokens = set(_tokens(ground_truth))
    answer_tokens = set(_tokens(answer))
    token_score = len(truth_tokens & answer_tokens) / len(truth_tokens) if truth_tokens else 0.0
    citation_score = _context_recall(expected_citations, retrieved_citations)
    return (token_score * 0.6) + (citation_score * 0.4)


def _row_issues(
    example: GoldenExample,
    retrieved_source_ids: list[str],
    retrieved_citations: list[str],
    retrieval: dict[str, Any],
) -> list[str]:
    issues: list[str] = []
    if not set(example.expected_source_ids) & set(retrieved_source_ids):
        issues.append("missing_expected_context")
    missing_sources = sorted(set(example.expected_source_ids) - set(retrieved_source_ids))
    if missing_sources:
        issues.append(f"missing_sources:{','.join(missing_sources)}")
    missing_citations = sorted(set(example.expected_citations) - set(retrieved_citations))
    if missing_citations:
        issues.append(f"missing_citations:{','.join(missing_citations)}")
    verification = retrieval.get("verification") if isinstance(retrieval.get("verification"), dict) else {}
    if verification.get("status") == "block":
        issues.append("retrieval_blocked")
    return issues


def _aggregate(rows: list[EvaluationRow]) -> dict[str, Any]:
    if not rows:
        return {
            **{metric: 0.0 for metric in METRICS},
            "overall": 0.0,
            "pass_rate": 0.0,
            "failed": 0,
        }
    metric_scores = {
        metric: round(mean(row.metrics.get(metric, 0.0) for row in rows), 4)
        for metric in METRICS
    }
    overall = round(mean(metric_scores.values()), 4)
    failed = len([row for row in rows if not row.pass_threshold])
    return {
        **metric_scores,
        "overall": overall,
        "pass_rate": round((len(rows) - failed) / len(rows), 4),
        "failed": failed,
    }


def _tokens(text: str) -> list[str]:
    return [
        token.strip(".,;:()[]{}").lower()
        for token in text.replace("D.C.", "dc").replace("D.C", "dc").split()
        if len(token.strip(".,;:()[]{}")) > 2
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Mercy D.C. RAGAS-style retrieval evaluation.")
    parser.add_argument("--dataset", default=str(DEFAULT_DATASET_PATH), help="Path to JSONL golden dataset.")
    parser.add_argument("--top-k", type=int, default=5, help="Number of chunks to retrieve per example.")
    parser.add_argument("--limit", type=int, default=None, help="Optional maximum examples to evaluate.")
    parser.add_argument("--threshold", type=float, default=0.72, help="Per-row average score threshold.")
    parser.add_argument("--report", default=str(DEFAULT_REPORT_PATH), help="Path to write JSON report.")
    parser.add_argument("--no-write", action="store_true", help="Print report without writing a file.")
    args = parser.parse_args()

    report = run_ragas_evaluation(
        dataset_path=args.dataset,
        top_k=args.top_k,
        limit=args.limit,
        pass_threshold=args.threshold,
        write_report=not args.no_write,
        report_path=args.report,
    )
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "DEFAULT_DATASET_PATH",
    "DEFAULT_REPORT_PATH",
    "GoldenExample",
    "EvaluationRow",
    "RAGAS_EVAL_VERSION",
    "load_golden_dataset",
    "run_ragas_evaluation",
]
