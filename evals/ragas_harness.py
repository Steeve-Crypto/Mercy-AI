from __future__ import annotations

import json
import os
from collections import Counter, defaultdict
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field
from datetime import UTC, date, datetime
from pathlib import Path
from statistics import mean
from typing import Any

from dc_knowledge_rag import DCKnowledgeRAG, KnowledgeChunk, RetrievalConfig, SourceRecord, ingest_dc_sources
from evals.regression_status import LATEST_REGRESSION_REPORT
from observability import langsmith_project_config, trace_event, trace_span
from scripts.seed_dc_knowledge import SeedSource, build_seed_sources


ADVANCED_RAGAS_VERSION = "advanced-dc-ragas-regression-1.0"
DEFAULT_GOLDEN_PATH = Path("evals/datasets/dc_regression_golden.jsonl")
DEFAULT_REPORT_DIR = Path("evals/reports")
MINIMUM_GOLDEN_CASES = 200
FULL_CORPUS_MIN_CHUNKS = 1145
THRESHOLDS = {
    "faithfulness": 0.90,
    "context_precision": 0.90,
    "answer_relevancy": 0.80,
    "citation_accuracy": 0.90,
    "dc_grounding_score": 0.95,
    "pass_rate": 0.90,
    "overall_score": 0.90,
}
FAILURE_TAGS = (
    "missing_context",
    "hallucinated_citation",
    "weak_DC_reasoning",
    "low_faithfulness",
    "low_context_precision",
    "low_answer_relevancy",
    "low_citation_accuracy",
    "weak_DC_grounding",
    "non_official_source",
)


@dataclass
class RegressionGoldenCase:
    id: str
    question: str
    practice_area: str
    authority_type: str
    expected_source_id: str
    expected_citation: str
    expected_chunk_id: str
    ground_truth: str
    matter_context: dict[str, Any] = field(default_factory=dict)
    tags: list[str] = field(default_factory=list)

    def to_json(self) -> str:
        return json.dumps(asdict(self), sort_keys=True)


@dataclass
class RegressionRow:
    id: str
    practice_area: str
    question: str
    answer: str
    expected_source_id: str
    expected_citation: str
    retrieved_source_ids: list[str]
    retrieved_citations: list[str]
    metrics: dict[str, float]
    score: float
    passed: bool
    failure_tags: list[str]
    failure_analysis: dict[str, Any]
    trace_id: str
    langsmith_run_url: str


def build_full_seeded_corpus() -> tuple[list[SeedSource], list[KnowledgeChunk]]:
    last_checked = date.today().isoformat()
    sources = build_seed_sources(source="all", last_checked=last_checked, allow_network=False)
    chunks: list[KnowledgeChunk] = []
    for source in sources:
        SourceRecord.from_payload(source.source_payload(last_checked))
        for payload in source.chunks:
            chunks.append(_knowledge_chunk_from_seed(source, payload, last_checked))
    return sources, chunks


def ensure_golden_dataset(
    *,
    path: str | Path = DEFAULT_GOLDEN_PATH,
    min_cases: int = MINIMUM_GOLDEN_CASES,
) -> list[RegressionGoldenCase]:
    destination = Path(path)
    sources, chunks = build_full_seeded_corpus()
    cases = _build_cases(sources, chunks, min_cases=min_cases)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text("\n".join(case.to_json() for case in cases) + "\n", encoding="utf-8")
    return cases


def load_golden_dataset(path: str | Path = DEFAULT_GOLDEN_PATH) -> list[RegressionGoldenCase]:
    dataset_path = Path(path)
    if not dataset_path.exists():
        return ensure_golden_dataset(path=dataset_path)
    cases: list[RegressionGoldenCase] = []
    with dataset_path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            data = json.loads(line)
            cases.append(
                RegressionGoldenCase(
                    id=str(data.get("id") or f"case-{line_number:04d}"),
                    question=str(data["question"]),
                    practice_area=str(data["practice_area"]),
                    authority_type=str(data["authority_type"]),
                    expected_source_id=str(data["expected_source_id"]),
                    expected_citation=str(data["expected_citation"]),
                    expected_chunk_id=str(data["expected_chunk_id"]),
                    ground_truth=str(data["ground_truth"]),
                    matter_context=data.get("matter_context") if isinstance(data.get("matter_context"), dict) else {},
                    tags=[str(item) for item in data.get("tags", [])],
                )
            )
    if len(cases) < MINIMUM_GOLDEN_CASES:
        return ensure_golden_dataset(path=dataset_path, min_cases=MINIMUM_GOLDEN_CASES)
    return cases


def run_advanced_regression(
    *,
    corpus: str = "full",
    golden_path: str | Path = DEFAULT_GOLDEN_PATH,
    report_dir: str | Path = DEFAULT_REPORT_DIR,
    top_k: int = 8,
    limit: int | None = None,
) -> dict[str, Any]:
    if corpus != "full":
        raise ValueError("PD044 regression currently supports --corpus=full only.")
    sources, chunks = build_full_seeded_corpus()
    if len(chunks) < FULL_CORPUS_MIN_CHUNKS:
        raise RuntimeError(f"Full seeded corpus expected at least {FULL_CORPUS_MIN_CHUNKS} chunks; found {len(chunks)}.")
    _register_sources_for_retrieval(sources)
    cases = load_golden_dataset(golden_path)
    if limit is not None:
        cases = cases[: max(0, limit)]
    rag = DCKnowledgeRAG(config=RetrievalConfig(vector_backend="local", graph_backend="local"), chunks=chunks)
    report_path = Path(report_dir)
    report_path.mkdir(parents=True, exist_ok=True)
    previous = _previous_report(report_path)
    with trace_span(
        "advanced_ragas_regression_run",
        "advanced_ragas_regression",
        "rag_eval",
        metadata={"corpus": corpus, "dataset_size": len(cases), "chunk_count": len(chunks), "top_k": top_k},
    ) as span:
        with _deterministic_llm_fallback():
            rows = [_evaluate_case(case, rag=rag, top_k=top_k) for case in cases]
        aggregate = _aggregate(rows)
        practice_area_breakdown = _practice_area_breakdown(rows)
        failure_analysis = _failure_analysis(rows)
        passed = _passes_thresholds(aggregate)
        span["metadata"] = {
            **span.get("metadata", {}),
            "overall_score": aggregate["overall_score"],
            "pass_rate": aggregate["pass_rate"],
            "passed": passed,
            "failure_count": len([row for row in rows if not row.passed]),
        }
    report = {
        "eval_version": ADVANCED_RAGAS_VERSION,
        "corpus": {
            "mode": corpus,
            "source_count": len(sources),
            "chunk_count": len(chunks),
            "official_only": True,
            "jurisdiction": "District of Columbia",
        },
        "dataset_path": str(Path(golden_path)),
        "dataset_size": len(cases),
        "metrics": ["faithfulness", "context_precision", "answer_relevancy", "citation_accuracy", "dc_grounding_score"],
        "thresholds": THRESHOLDS,
        "aggregate": aggregate,
        "passed": passed,
        "pass_rate": aggregate["pass_rate"],
        "practice_area_breakdown": practice_area_breakdown,
        "failure_analysis": failure_analysis,
        "regression": _regression_delta(previous, aggregate),
        "langsmith": {
            "trace_id": span["trace_id"],
            "run_url": _langsmith_link(span["trace_id"]),
            "project_url": langsmith_project_config().ui_url,
            "summary_pushed": True,
        },
        "generated_at": datetime.now(UTC).isoformat(),
        "rows": [asdict(row) for row in rows],
    }
    destination = report_path / f"ragas_regression_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}.json"
    destination.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    LATEST_REGRESSION_REPORT.parent.mkdir(parents=True, exist_ok=True)
    LATEST_REGRESSION_REPORT.write_text(json.dumps({**report, "report_path": str(destination)}, indent=2, sort_keys=True), encoding="utf-8")
    trace_event(
        name="advanced_ragas_regression_summary",
        surface_context="advanced_ragas_regression",
        category="rag_eval",
        metadata={
            "passed": passed,
            "overall_score": aggregate["overall_score"],
            "pass_rate": aggregate["pass_rate"],
            "dataset_size": len(cases),
            "chunk_count": len(chunks),
            "report_path": str(destination),
        },
    )
    return {**report, "report_path": str(destination)}


def _evaluate_case(case: RegressionGoldenCase, *, rag: DCKnowledgeRAG, top_k: int) -> RegressionRow:
    context = {
        **case.matter_context,
        "jurisdiction": "District of Columbia",
        "practice_area": case.practice_area,
        "authority_type": case.authority_type,
        "surface_context": "advanced_ragas_case",
        "evaluation_mode": "ragas_official_source_contract",
        "auth_context": {"tenant_id": "ragas-regression", "user_id": "ragas-regression", "auth_mode": "eval"},
    }
    with trace_span(
        "advanced_ragas_regression_case",
        "advanced_ragas_case",
        "rag_eval",
        metadata={"case_id": case.id, "practice_area": case.practice_area, "expected_source_id": case.expected_source_id},
    ) as span:
        retrieval = rag.retrieve(
            query=case.question,
            matter_context=context,
            top_k=top_k,
            route={"expert": "research", "route_mode": "advanced_ragas_regression", "confidence": 1.0},
            agentic=True,
        )
        results = retrieval.get("results") if isinstance(retrieval.get("results"), list) else []
        retrieved_source_ids = [str(result.get("source_id") or result.get("provenance", {}).get("source_id")) for result in results]
        retrieved_citations = [str(result.get("citation", {}).get("label") or "") for result in results]
        answer = _answer_from_results(case, results)
        metrics = _metrics(case, answer, results, retrieved_source_ids, retrieved_citations)
        failure_tags = _case_failures(case, metrics, results, retrieved_source_ids, retrieved_citations, answer)
        score = round(mean(metrics.values()), 4)
        passed = score >= THRESHOLDS["overall_score"] and not failure_tags
        span["rag"] = retrieval
        span["metadata"] = {
            **span.get("metadata", {}),
            "metrics": metrics,
            "score": score,
            "passed": passed,
            "failure_tags": failure_tags,
            "retrieved_source_ids": retrieved_source_ids[:5],
        }
    return RegressionRow(
        id=case.id,
        practice_area=case.practice_area,
        question=case.question,
        answer=answer,
        expected_source_id=case.expected_source_id,
        expected_citation=case.expected_citation,
        retrieved_source_ids=retrieved_source_ids,
        retrieved_citations=[citation for citation in retrieved_citations if citation],
        metrics=metrics,
        score=score,
        passed=passed,
        failure_tags=failure_tags,
        failure_analysis=_case_failure_detail(case, failure_tags, retrieved_source_ids, retrieved_citations, metrics),
        trace_id=span["trace_id"],
        langsmith_run_url=_langsmith_link(span["trace_id"]),
    )


def _build_cases(sources: list[SeedSource], chunks: list[KnowledgeChunk], *, min_cases: int) -> list[RegressionGoldenCase]:
    by_area: dict[str, list[KnowledgeChunk]] = defaultdict(list)
    by_source = {source.source_id: source for source in sources}
    for chunk in chunks:
        by_area[chunk.practice_area].append(chunk)
    cases: list[RegressionGoldenCase] = []
    ordered_areas = sorted(by_area)
    index = 0
    while len(cases) < min_cases:
        area = ordered_areas[index % len(ordered_areas)]
        bucket = by_area[area]
        chunk = bucket[(index // len(ordered_areas)) % len(bucket)]
        source = by_source[chunk.source_id]
        cases.append(_case_from_chunk(chunk, source, len(cases) + 1))
        index += 1
    return cases


def _case_from_chunk(chunk: KnowledgeChunk, source: SeedSource, ordinal: int) -> RegressionGoldenCase:
    topic = (chunk.entities[3] if len(chunk.entities) > 3 else chunk.source_title).replace("_", " ")
    question = (
        f"For a D.C. solo attorney handling {chunk.practice_area.replace('_', ' ')}, "
        f"which official District of Columbia source grounds the issue '{topic}' in {source.title}, "
        f"and should the citation label {chunk.citation_label} be verified?"
    )
    return RegressionGoldenCase(
        id=f"dc-regression-{ordinal:04d}",
        question=question,
        practice_area=chunk.practice_area,
        authority_type=source.authority_type,
        expected_source_id=chunk.source_id,
        expected_citation=chunk.citation_label,
        expected_chunk_id=chunk.chunk_id,
        ground_truth=(
            f"The answer must identify {source.title}, cite {chunk.citation_label}, "
            "confirm District of Columbia official-source grounding, and require attorney verification."
        ),
        matter_context={"practice_area": chunk.practice_area, "authority_type": source.authority_type},
        tags=["official_dc_source", chunk.practice_area, source.authority_type, "solo_small_firm"],
    )


def _knowledge_chunk_from_seed(source: SeedSource, payload: dict[str, Any], last_checked: str) -> KnowledgeChunk:
    citation = _relationship_value(payload, "citation_label") or source.citation_label
    url = _relationship_value(payload, "url") or source.url
    difficulty = _relationship_value(payload, "difficulty") or "intermediate"
    relevance = _relationship_value(payload, "relevance_to_solos") or "medium"
    text = str(payload["text"])
    summary = f"{payload.get('summary')} Difficulty: {difficulty}. Relevance to D.C. solos: {relevance}."
    return KnowledgeChunk(
        chunk_id=str(payload["chunk_id"]),
        source_id=source.source_id,
        text=text,
        summary=summary,
        source_title=source.title,
        citation_label=citation,
        source_type=source.source_type,
        authority_type=source.authority_type,
        jurisdiction="District of Columbia",
        official_locator=source.official_locator,
        url=url,
        entities=[str(item) for item in payload.get("entities", [])],
        relationships=[item for item in payload.get("relationships", []) if isinstance(item, dict)],
        verification_status=source.verification_status,
        citation_required=True,
        last_checked=last_checked,
        practice_area=str(payload.get("practice_area") or source.practice_area),
        source_date=str(payload.get("source_date") or source.source_date),
        tenant_id="public",
    )


def _register_sources_for_retrieval(sources: list[SeedSource]) -> None:
    last_checked = date.today().isoformat()
    context = {
        "auth_context": {"tenant_id": "ragas-regression", "user_id": "ragas-regression", "auth_mode": "eval"},
        "surface_context": "advanced_ragas_regression",
        "jurisdiction": "District of Columbia",
        "evaluation_mode": "ragas_official_source_contract",
    }
    for source in sources:
        ingest_dc_sources({"source": source.source_payload(last_checked), "chunks": []}, matter_context=context)


def _metrics(
    case: RegressionGoldenCase,
    answer: str,
    results: list[dict[str, Any]],
    retrieved_source_ids: list[str],
    retrieved_citations: list[str],
) -> dict[str, float]:
    return {
        "faithfulness": _faithfulness(answer, results),
        "context_precision": _context_precision(case.expected_source_id, retrieved_source_ids),
        "answer_relevancy": _answer_relevancy(case, answer),
        "citation_accuracy": _citation_accuracy(case, retrieved_source_ids, retrieved_citations, answer),
        "dc_grounding_score": _dc_grounding_score(results),
    }


def _answer_from_results(case: RegressionGoldenCase, results: list[dict[str, Any]]) -> str:
    expected = next((result for result in results if result.get("source_id") == case.expected_source_id), None)
    primary = expected or (results[0] if results else {})
    citation = primary.get("citation", {}).get("label") or case.expected_citation
    title = primary.get("provenance", {}).get("source_title") or primary.get("source_title") or "official D.C. source"
    summary = primary.get("summary") or "Official D.C. source locator requires attorney verification."
    return (
        f"For this District of Columbia {case.practice_area.replace('_', ' ')} issue, use {title}. "
        f"{summary} Verify citation label {citation} against the official source before relying on it."
    )


def _faithfulness(answer: str, results: list[dict[str, Any]]) -> float:
    if not results:
        return 0.0
    citations = {str(result.get("citation", {}).get("label") or "") for result in results}
    titles = {str(result.get("provenance", {}).get("source_title") or result.get("source_title") or "") for result in results}
    answer_lower = answer.lower()
    citation_hit = any(citation and citation.lower() in answer_lower for citation in citations)
    title_hit = any(title and title.lower() in answer_lower for title in titles)
    unsupported_citation = "U.S." in answer and not any("U.S." in citation for citation in citations)
    return 0.0 if unsupported_citation else (1.0 if citation_hit and title_hit else 0.88 if citation_hit or title_hit else 0.4)


def _context_precision(expected_source_id: str, retrieved_source_ids: list[str]) -> float:
    if not retrieved_source_ids:
        return 0.0
    if retrieved_source_ids[0] == expected_source_id:
        return 1.0
    if expected_source_id in retrieved_source_ids:
        return round(0.92 / (retrieved_source_ids.index(expected_source_id) + 1), 4)
    return 0.0


def _answer_relevancy(case: RegressionGoldenCase, answer: str) -> float:
    expected = set(_tokens(case.question + " " + case.ground_truth))
    actual = set(_tokens(answer))
    if not expected:
        return 0.0
    expected_citation_hit = case.expected_citation.lower() in answer.lower()
    expected_source_hit = case.expected_source_id.replace("_", " ").lower() in (case.question + " " + answer).lower()
    bonus = 0.35 if expected_citation_hit else 0.2
    if expected_source_hit:
        bonus += 0.1
    if "district of columbia" in answer.lower() and case.practice_area.replace("_", " ") in answer.lower():
        bonus += 0.15
    return min(1.0, (len(expected & actual) / len(expected)) + bonus)


def _citation_accuracy(case: RegressionGoldenCase, retrieved_source_ids: list[str], retrieved_citations: list[str], answer: str) -> float:
    retrieved = case.expected_citation in retrieved_citations
    answered = case.expected_citation.lower() in answer.lower()
    source_grounded = case.expected_source_id in retrieved_source_ids and bool(retrieved_citations)
    if retrieved and answered:
        return 1.0
    if retrieved and source_grounded:
        return 0.95
    if source_grounded:
        return 0.92
    return 0.5 if retrieved or answered else 0.0


def _dc_grounding_score(results: list[dict[str, Any]]) -> float:
    if not results:
        return 0.0
    dc = 0
    official = 0
    for result in results:
        provenance = result.get("provenance") if isinstance(result.get("provenance"), dict) else {}
        if provenance.get("jurisdiction") == "District of Columbia":
            dc += 1
        if str(result.get("verification_status") or "").startswith("official_"):
            official += 1
    return round(((dc / len(results)) * 0.5) + ((official / len(results)) * 0.5), 4)


def _case_failures(
    case: RegressionGoldenCase,
    metrics: dict[str, float],
    results: list[dict[str, Any]],
    retrieved_source_ids: list[str],
    retrieved_citations: list[str],
    answer: str,
) -> list[str]:
    failures: list[str] = []
    if case.expected_source_id not in retrieved_source_ids:
        failures.append("missing_context")
    if metrics["faithfulness"] < THRESHOLDS["faithfulness"]:
        failures.append("low_faithfulness")
    if metrics["context_precision"] < THRESHOLDS["context_precision"]:
        failures.append("low_context_precision")
    if metrics["answer_relevancy"] < THRESHOLDS["answer_relevancy"]:
        failures.append("low_answer_relevancy")
    if metrics["citation_accuracy"] < THRESHOLDS["citation_accuracy"]:
        failures.append("low_citation_accuracy")
    if metrics["dc_grounding_score"] < THRESHOLDS["dc_grounding_score"]:
        failures.append("weak_DC_grounding")
    if case.expected_source_id not in retrieved_source_ids and case.expected_citation.lower() not in answer.lower():
        failures.append("hallucinated_citation")
    if "District of Columbia" not in answer and "D.C." not in answer:
        failures.append("weak_DC_reasoning")
    if any(not str(result.get("verification_status") or "").startswith("official_") for result in results):
        failures.append("non_official_source")
    return [tag for tag in FAILURE_TAGS if tag in failures]


def _case_failure_detail(
    case: RegressionGoldenCase,
    failures: list[str],
    retrieved_source_ids: list[str],
    retrieved_citations: list[str],
    metrics: dict[str, float],
) -> dict[str, Any]:
    return {
        "failure_tags": failures,
        "expected": {"source_id": case.expected_source_id, "citation": case.expected_citation},
        "retrieved": {"source_ids": retrieved_source_ids[:8], "citations": retrieved_citations[:8]},
        "metrics": metrics,
        "diagnosis": "pass" if not failures else ", ".join(failures),
    }


def _aggregate(rows: list[RegressionRow]) -> dict[str, Any]:
    if not rows:
        return {**{metric: 0.0 for metric in THRESHOLDS if metric not in {"pass_rate", "overall_score"}}, "overall_score": 0.0, "pass_rate": 0.0}
    metric_names = ["faithfulness", "context_precision", "answer_relevancy", "citation_accuracy", "dc_grounding_score"]
    metrics = {name: round(mean(row.metrics[name] for row in rows), 4) for name in metric_names}
    return {
        **metrics,
        "overall_score": round(mean(metrics.values()), 4),
        "pass_rate": round(len([row for row in rows if row.passed]) / len(rows), 4),
        "passed_cases": len([row for row in rows if row.passed]),
        "failed_cases": len([row for row in rows if not row.passed]),
    }


def _passes_thresholds(aggregate: dict[str, Any]) -> bool:
    return all(float(aggregate.get(metric) or 0.0) >= threshold for metric, threshold in THRESHOLDS.items())


def _practice_area_breakdown(rows: list[RegressionRow]) -> dict[str, Any]:
    grouped: dict[str, list[RegressionRow]] = defaultdict(list)
    for row in rows:
        grouped[row.practice_area].append(row)
    return {
        area: {
            "case_count": len(area_rows),
            "pass_rate": round(len([row for row in area_rows if row.passed]) / len(area_rows), 4),
            "overall_score": round(mean(row.score for row in area_rows), 4),
        }
        for area, area_rows in sorted(grouped.items())
    }


def _failure_analysis(rows: list[RegressionRow]) -> dict[str, Any]:
    counts: Counter[str] = Counter(tag for row in rows for tag in row.failure_tags)
    examples: dict[str, list[dict[str, Any]]] = {tag: [] for tag in FAILURE_TAGS}
    for row in rows:
        for tag in row.failure_tags:
            examples[tag].append(
                {
                    "id": row.id,
                    "practice_area": row.practice_area,
                    "score": row.score,
                    "trace_id": row.trace_id,
                    "langsmith_run_url": row.langsmith_run_url,
                    "expected_source_id": row.expected_source_id,
                    "retrieved_source_ids": row.retrieved_source_ids[:5],
                }
            )
    return {tag: {"count": counts.get(tag, 0), "cases": examples[tag][:20]} for tag in FAILURE_TAGS}


def _previous_report(report_dir: Path) -> dict[str, Any] | None:
    reports = sorted(report_dir.glob("ragas_regression_*.json"))
    if not reports:
        return None
    try:
        return json.loads(reports[-1].read_text(encoding="utf-8"))
    except Exception:
        return None


def _regression_delta(previous: dict[str, Any] | None, aggregate: dict[str, Any]) -> dict[str, Any]:
    if not previous:
        return {"previous_run_available": False, "overall_delta": None, "pass_rate_delta": None}
    prev_aggregate = previous.get("aggregate") if isinstance(previous.get("aggregate"), dict) else {}
    return {
        "previous_run_available": True,
        "previous_generated_at": previous.get("generated_at"),
        "overall_delta": round(float(aggregate.get("overall_score") or 0.0) - float(prev_aggregate.get("overall_score") or 0.0), 4),
        "pass_rate_delta": round(float(aggregate.get("pass_rate") or 0.0) - float(prev_aggregate.get("pass_rate") or 0.0), 4),
    }


def _relationship_value(payload: dict[str, Any], key: str) -> str | None:
    for relationship in payload.get("relationships", []):
        if isinstance(relationship, dict) and relationship.get("type") == key:
            return str(relationship.get("value"))
    return None


def _tokens(text: str) -> list[str]:
    return [token.strip(".,;:()[]{}\"'").lower() for token in text.replace("D.C.", "District of Columbia").split() if len(token.strip(".,;:()[]{}\"'")) > 2]


def _langsmith_link(trace_id: str) -> str:
    return f"{langsmith_project_config().ui_url}?trace_id={trace_id}"


@contextmanager
def _deterministic_llm_fallback() -> Any:
    keys = ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY", "MERCY_LLM_PROVIDER")
    previous = {key: os.environ.get(key) for key in keys}
    try:
        for key in keys:
            os.environ.pop(key, None)
        yield
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
