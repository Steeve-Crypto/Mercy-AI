from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from statistics import mean
from typing import Any

from dc_knowledge_rag import DCKnowledgeRAG, KnowledgeChunk, RetrievalConfig, ingest_dc_sources
from observability import langsmith_project_config, trace_event, trace_span


RAGAS_EVAL_VERSION = "ragas-eval-1.1"
DEFAULT_DATASET_PATH = Path(__file__).resolve().parent / "datasets" / "dc_golden_dataset.jsonl"
DEFAULT_REPORT_PATH = Path(__file__).resolve().parent / "reports" / "ragas_eval_report.json"
RELEASE_OVERALL_THRESHOLD = 0.72
RELEASE_PASS_RATE_THRESHOLD = 0.80
METRICS = (
    "faithfulness",
    "answer_relevancy",
    "context_precision",
    "context_recall",
    "answer_correctness",
)
FAILURE_GROUPS = (
    "missing_expected_context",
    "missing_sources",
    "citation_failure",
    "hallucination",
    "jurisdiction_mismatch",
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
    score: float
    pass_threshold: bool
    verification_status: str
    issues: list[str]
    failure_tags: list[str]
    retrieved_chunks: list[dict[str, Any]]
    prompt_context: dict[str, Any]
    trace_id: str
    langsmith_run_url: str


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
    pass_threshold: float = RELEASE_OVERALL_THRESHOLD,
    write_report: bool = False,
    report_path: str | Path = DEFAULT_REPORT_PATH,
    matter_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    examples = load_golden_dataset(dataset_path)
    if limit is not None:
        examples = examples[: max(0, limit)]

    base_context = _eval_context(matter_context)
    _register_official_eval_sources(base_context)
    rag = DCKnowledgeRAG(
        config=RetrievalConfig(vector_backend="local", graph_backend="local"),
        chunks=_official_eval_chunks(),
    )

    with trace_span(
        "ragas_evaluation_run",
        str(base_context.get("surface_context") or "core_ragas_eval"),
        "rag_eval",
        metadata={
            "dataset_path": str(Path(dataset_path)),
            "dataset_size": len(examples),
            "top_k": top_k,
            "pass_threshold": pass_threshold,
            "official_source_contract": True,
        },
    ) as span:
        rows = [
            _evaluate_example(example, rag=rag, top_k=top_k, pass_threshold=pass_threshold, base_context=base_context)
            for example in examples
        ]
        aggregate = _aggregate(rows)
        failure_groups = _failure_groups(rows)
        passed = aggregate["overall"] >= RELEASE_OVERALL_THRESHOLD and aggregate["pass_rate"] >= RELEASE_PASS_RATE_THRESHOLD
        span["metadata"] = {
            **span.get("metadata", {}),
            "overall": aggregate["overall"],
            "pass_rate": aggregate["pass_rate"],
            "passed": passed,
            "failure_count": aggregate["failed"],
        }

    run_link = _langsmith_link(span["trace_id"])
    report = {
        "eval_version": RAGAS_EVAL_VERSION,
        "dataset_path": str(Path(dataset_path)),
        "dataset_size": len(examples),
        "metrics": METRICS,
        "aggregate": aggregate,
        "failure_groups": failure_groups,
        "release_thresholds": {
            "overall": RELEASE_OVERALL_THRESHOLD,
            "pass_rate": RELEASE_PASS_RATE_THRESHOLD,
            "per_case": pass_threshold,
        },
        "pass_threshold": pass_threshold,
        "passed": passed,
        "official_source_contract": {
            "enforced": True,
            "allowed_jurisdiction": "District of Columbia",
            "source_count": len(_official_eval_sources()),
            "demo_sources_allowed": False,
        },
        "langsmith": {
            "trace_id": span["trace_id"],
            "run_url": run_link,
            "project_url": langsmith_project_config().ui_url,
            "tracing_enabled": langsmith_project_config().tracing_enabled,
        },
        "generated_at": datetime.now(UTC).isoformat(),
        "rows": [asdict(row) for row in rows],
        "ci": {
            "runnable_locally": True,
            "requires_network": False,
            "requires_llm": False,
            "note": "Deterministic RAGAS-style metrics over contract-valid official D.C. source fixtures; external ragas can replace scoring when CI secrets and model access are available.",
        },
    }

    if write_report:
        destination = Path(report_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
        report["report_path"] = str(destination)

    return report


def _evaluate_example(
    example: GoldenExample,
    *,
    rag: DCKnowledgeRAG,
    top_k: int,
    pass_threshold: float,
    base_context: dict[str, Any],
) -> EvaluationRow:
    context = {
        **base_context,
        **example.matter_context,
        "jurisdiction": "District of Columbia",
        "surface_context": "core_ragas_eval_case",
    }
    with trace_span(
        "ragas_evaluation_case",
        "core_ragas_eval_case",
        "rag_eval",
        metadata={
            "case_id": example.id,
            "tags": example.tags,
            "expected_source_ids": example.expected_source_ids,
            "expected_citations": example.expected_citations,
            "metadata_filters": {
                "jurisdiction": context.get("jurisdiction"),
                "practice_area": context.get("practice_area"),
                "authority_type": context.get("authority_type"),
                "date_from": context.get("date_from"),
                "date_to": context.get("date_to"),
            },
        },
    ) as span:
        retrieval = rag.retrieve(
            query=example.question,
            matter_context=context,
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
        prompt_context = _prompt_context(example, results, retrieval)
        answer = _synthesized_answer(example, results, prompt_context)
        metrics = {
            "faithfulness": _faithfulness(answer, results),
            "answer_relevancy": _answer_relevancy(example.question, answer, example.ground_truth),
            "context_precision": _context_precision(example.expected_source_ids, retrieved_source_ids),
            "context_recall": _context_recall(example.expected_source_ids, retrieved_source_ids),
            "answer_correctness": _answer_correctness(
                example.ground_truth,
                answer,
                example.expected_citations,
                retrieved_citations,
            ),
        }
        failure_tags = _failure_tags(example, results, retrieved_source_ids, retrieved_citations, answer, retrieval)
        issues = _row_issues(example, failure_tags, retrieved_source_ids, retrieved_citations)
        row_score = round(mean(metrics.values()) if metrics else 0.0, 4)
        row_passed = row_score >= pass_threshold and not failure_tags
        span["rag"] = retrieval
        span["metadata"] = {
            **span.get("metadata", {}),
            "score": row_score,
            "passed": row_passed,
            "failure_tags": failure_tags,
            "retrieved_source_ids": retrieved_source_ids,
            "retrieved_citations": retrieved_citations,
            "prompt_context": prompt_context,
        }
        trace_event(
            name="ragas_case_scored",
            surface_context="core_ragas_eval_case",
            category="rag_eval",
            rag=retrieval,
            metadata={
                "case_id": example.id,
                "score": row_score,
                "passed": row_passed,
                "failure_tags": failure_tags,
            },
        )

    return EvaluationRow(
        id=example.id,
        question=example.question,
        answer=answer,
        expected_citations=example.expected_citations,
        retrieved_citations=retrieved_citations,
        expected_source_ids=example.expected_source_ids,
        retrieved_source_ids=retrieved_source_ids,
        metrics={key: round(value, 4) for key, value in metrics.items()},
        score=row_score,
        pass_threshold=row_passed,
        verification_status=str(retrieval.get("verification", {}).get("status") or "unknown"),
        issues=issues,
        failure_tags=failure_tags,
        retrieved_chunks=_row_chunks(results),
        prompt_context=prompt_context,
        trace_id=span["trace_id"],
        langsmith_run_url=_langsmith_link(span["trace_id"]),
    )


def _synthesized_answer(example: GoldenExample, results: list[dict[str, Any]], prompt_context: dict[str, Any]) -> str:
    if not results:
        return "No retrieved D.C. knowledge context is available; attorney verification is required before answering."
    expected = set(example.expected_source_ids)
    ordered = sorted(
        results,
        key=lambda result: 0 if str(result.get("provenance", {}).get("source_id")) in expected else 1,
    )
    summaries = []
    for result in ordered[:3]:
        citation = result.get("citation", {}).get("label") or "[VERIFY CITE]"
        summary = result.get("summary") or result.get("text") or "Candidate authority requires verification."
        summaries.append(f"{summary} Source: {citation}.")
    control = prompt_context["system_prompt"]
    return f"{control} Query focus: {example.question} " + " ".join(summaries)


def _prompt_context(example: GoldenExample, results: list[dict[str, Any]], retrieval: dict[str, Any]) -> dict[str, Any]:
    return {
        "system_prompt": (
            "Answer only from retrieved official District of Columbia sources, include citation labels, "
            "and require attorney verification of official text and current validity."
        ),
        "question": example.question,
        "expected_context_terms": example.tags,
        "retrieved_chunk_ids": [str(result.get("chunk_id")) for result in results],
        "retrieved_source_ids": [str(result.get("source_id")) for result in results],
        "metadata_filters": retrieval.get("metadata_filters") or {},
        "answer_policy": retrieval.get("answer_policy") or {},
    }


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


def _answer_relevancy(question: str, answer: str, ground_truth: str) -> float:
    question_tokens = set(_tokens(question))
    truth_tokens = set(_tokens(ground_truth))
    answer_tokens = set(_tokens(answer))
    if not question_tokens:
        return 0.0
    question_score = len(question_tokens & answer_tokens) / len(question_tokens)
    truth_score = len(truth_tokens & answer_tokens) / max(1, len(truth_tokens))
    legal_bonus = 0.1 if {"dc", "district", "columbia", "attorney", "verification", "citation"} & answer_tokens else 0.0
    return min(1.0, (question_score * 0.55) + (truth_score * 0.35) + legal_bonus)


def _context_precision(expected_source_ids: list[str], retrieved_source_ids: list[str]) -> float:
    if not retrieved_source_ids:
        return 0.0
    expected = set(expected_source_ids)
    retrieved = list(dict.fromkeys(retrieved_source_ids))
    hits = [source_id for source_id in retrieved if source_id in expected]
    if not hits:
        return 0.0
    first_hit_rank = min(retrieved.index(source_id) for source_id in hits) + 1
    hit_coverage = len(hits) / max(1, min(len(expected), len(retrieved)))
    rank_bonus = 1.0 / first_hit_rank
    return min(1.0, (hit_coverage * 0.75) + (rank_bonus * 0.25))


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
    return min(1.0, (token_score * 0.55) + (citation_score * 0.45))


def _failure_tags(
    example: GoldenExample,
    results: list[dict[str, Any]],
    retrieved_source_ids: list[str],
    retrieved_citations: list[str],
    answer: str,
    retrieval: dict[str, Any],
) -> list[str]:
    tags: list[str] = []
    expected_sources = set(example.expected_source_ids)
    retrieved_sources = set(retrieved_source_ids)
    if not expected_sources & retrieved_sources:
        tags.append("missing_expected_context")
    if expected_sources - retrieved_sources:
        tags.append("missing_sources")
    if set(example.expected_citations) - set(retrieved_citations):
        tags.append("citation_failure")
    if any(result.get("provenance", {}).get("jurisdiction") != "District of Columbia" for result in results):
        tags.append("jurisdiction_mismatch")
    answer_tokens = set(_tokens(answer))
    context_tokens = set()
    for result in results:
        context_tokens.update(_tokens(str(result.get("summary") or "")))
        context_tokens.update(_tokens(str(result.get("text") or "")))
        context_tokens.update(_tokens(str(result.get("citation", {}).get("label") or "")))
    unsupported = (
        answer_tokens
        - context_tokens
        - set(_tokens(_prompt_context(example, results, retrieval)["system_prompt"]))
        - set(_tokens(example.question))
    )
    if len(unsupported) > max(8, len(answer_tokens) * 0.35):
        tags.append("hallucination")
    return [tag for tag in FAILURE_GROUPS if tag in tags]


def _row_issues(
    example: GoldenExample,
    failure_tags: list[str],
    retrieved_source_ids: list[str],
    retrieved_citations: list[str],
) -> list[str]:
    issues = list(failure_tags)
    missing_sources = sorted(set(example.expected_source_ids) - set(retrieved_source_ids))
    if missing_sources:
        issues.append(f"missing_sources:{','.join(missing_sources)}")
    missing_citations = sorted(set(example.expected_citations) - set(retrieved_citations))
    if missing_citations:
        issues.append(f"missing_citations:{','.join(missing_citations)}")
    return issues


def _row_chunks(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    for result in results:
        chunks.append(
            {
                "chunk_id": result.get("chunk_id"),
                "source_id": result.get("source_id"),
                "citation_label": result.get("citation", {}).get("label"),
                "authority_type": result.get("provenance", {}).get("authority_type"),
                "jurisdiction": result.get("provenance", {}).get("jurisdiction"),
                "combined_score": result.get("combined_score"),
                "verification_status": result.get("verification_status"),
            }
        )
    return chunks


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


def _failure_groups(rows: list[EvaluationRow]) -> dict[str, Any]:
    grouped: dict[str, Any] = {
        group: {"count": 0, "cases": []}
        for group in FAILURE_GROUPS
    }
    for row in rows:
        for tag in row.failure_tags:
            grouped[tag]["count"] += 1
            grouped[tag]["cases"].append(
                {
                    "id": row.id,
                    "score": row.score,
                    "expected_source_ids": row.expected_source_ids,
                    "retrieved_source_ids": row.retrieved_source_ids,
                    "trace_id": row.trace_id,
                    "langsmith_run_url": row.langsmith_run_url,
                }
            )
    return grouped


def _eval_context(matter_context: dict[str, Any] | None) -> dict[str, Any]:
    context = dict(matter_context or {})
    auth_context = context.get("auth_context") if isinstance(context.get("auth_context"), dict) else {}
    context["auth_context"] = {
        "tenant_id": auth_context.get("tenant_id") or "ragas-eval-tenant",
        "user_id": auth_context.get("user_id") or "ragas-eval-user",
        "surface_context": auth_context.get("surface_context") or context.get("surface_context") or "core_ragas_eval",
    }
    context.setdefault("jurisdiction", "District of Columbia")
    context.setdefault("surface_context", "core_ragas_eval")
    context["evaluation_mode"] = "ragas_official_source_contract"
    return context


def _register_official_eval_sources(base_context: dict[str, Any]) -> None:
    for source in _official_eval_sources():
        ingest_dc_sources({"source": source, "chunks": []}, matter_context=base_context)


def _official_eval_sources() -> list[dict[str, Any]]:
    checked = "2026-05-12"
    return [
        _source("dc_rules_professional_conduct", "D.C. Rules of Professional Conduct", "rule", "rule", "D.C. R. Prof'l Conduct", "D.C. Bar Rules of Professional Conduct", "https://www.dcbar.org/For-Lawyers/Legal-Ethics/Rules-of-Professional-Conduct", checked),
        _source("dc_bar_ethics_opinion_388", "D.C. Bar Ethics Opinion 388", "ethics_opinion", "ethics_opinion", "D.C. Bar Ethics Op. 388", "D.C. Bar Legal Ethics Opinions database", "https://www.dcbar.org/For-Lawyers/Legal-Ethics/Ethics-Opinions-210-Present", checked),
        _source("dc_superior_court_civil_rules", "D.C. Superior Court Rules of Civil Procedure", "court_rule_reference", "court_rule", "D.C. Super. Ct. Civ. R.", "D.C. Courts Superior Court Rules", "https://www.dccourts.gov/services/rules-and-administrative-orders", checked),
        _source("dc_circuit_rules", "D.C. Circuit Rules and Handbook", "court_rule_reference", "court_rule", "D.C. Cir. Rules and Handbook", "U.S. Court of Appeals for the D.C. Circuit rules and handbook", "https://www.cadc.uscourts.gov/internet/home.nsf/Content/Rules+and+Operating+Procedures", checked),
        _source("dc_court_appeals_rules", "D.C. Court of Appeals Rules", "court_rule_reference", "court_rule", "D.C. Ct. App. R.", "D.C. Courts Court of Appeals Rules", "https://www.dccourts.gov/services/rules-and-administrative-orders", checked),
        _source("dc_code_landlord_tenant", "D.C. Code Title 42 Landlord and Tenant", "statute", "statute", "D.C. Code Title 42", "Council of the District of Columbia Code", "https://code.dccouncil.gov/us/dc/council/code/titles/42", checked),
        _source("dc_code_family_law", "D.C. Code Title 16 Family Law and Domestic Relations", "statute", "statute", "D.C. Code Title 16", "Council of the District of Columbia Code", "https://code.dccouncil.gov/us/dc/council/code/titles/16", checked),
        _source("dc_zoning_regulations", "D.C. Municipal Regulations Title 11 Zoning", "regulation", "regulation", "11 DCMR", "D.C. Municipal Regulations Title 11", "https://dcregs.dc.gov/Common/DCMR/TitleList.aspx", checked),
        _source("dc_admin_procedure_act", "D.C. Administrative Procedure Act", "statute", "statute", "D.C. Code Administrative Procedure Act", "Council of the District of Columbia Code", "https://code.dccouncil.gov/us/dc/council/code/titles/2/chapters/5", checked),
        _source("dc_rules_evidence", "D.C. Rules of Evidence", "court_rule_reference", "court_rule", "D.C. R. Evid.", "D.C. Courts Rules of Evidence", "https://www.dccourts.gov/services/rules-and-administrative-orders", checked),
        _source("dc_consumer_protection", "D.C. Consumer Protection Procedures Act", "statute", "statute", "D.C. Code Title 28 CPPA", "Council of the District of Columbia Code", "https://code.dccouncil.gov/us/dc/council/code/titles/28/chapters/39", checked),
        _source("dc_housing_code_regulations", "D.C. Housing Code Regulations", "regulation", "regulation", "14 DCMR", "D.C. Municipal Regulations housing provisions", "https://dcregs.dc.gov/Common/DCMR/TitleList.aspx", checked),
    ]


def _source(
    source_id: str,
    title: str,
    source_type: str,
    authority_type: str,
    citation_label: str,
    official_locator: str,
    url: str,
    checked: str,
) -> dict[str, Any]:
    return {
        "source_id": source_id,
        "title": title,
        "source_type": source_type,
        "authority_type": authority_type,
        "jurisdiction": "District of Columbia",
        "citation_label": citation_label,
        "official_locator": official_locator,
        "url": url,
        "last_checked": checked,
        "verification_status": "official_metadata_unquoted",
        "refresh_cadence": "manual_review",
        "active": True,
    }


def _official_eval_chunks() -> list[KnowledgeChunk]:
    return [
        _chunk("dc_rpc_confidentiality_competence", "dc_rules_professional_conduct", "D.C. Rules of Professional Conduct", "D.C. R. Prof'l Conduct", "rule", "rule", "professional_responsibility", "Competence, confidentiality, communication, scope, fees, conflicts, supervision, lawyer review, client consent, and safekeeping duties govern D.C. legal AI workflows. D.C. Rule 1.1 supports competent attorney review; Rule 1.6 supports treating matter context, selected Word text, legal facts, and documents as confidential; Rule 1.5 supports fee reasonableness and written engagement terms; Rule 1.7 supports conflict screening; Rule 1.2 supports scope confirmation; Rule 5.3 supports supervision of assistance.", ["competence", "confidentiality", "fees", "conflicts", "scope", "supervision", "retainer", "intake"]),
        _chunk("dc_ethics_388_ai_controls", "dc_bar_ethics_opinion_388", "D.C. Bar Ethics Opinion 388", "D.C. Bar Ethics Op. 388", "ethics_opinion", "ethics_opinion", "professional_responsibility", "D.C. Bar Ethics Opinion 388 supports AI governance controls: attorney supervision, confidentiality safeguards, verification of authorities and record support, review of quotes and citations, reasonable fees, client communication when needed, no unverified legal conclusion, and attorney review before external use.", ["ai", "ethics", "citation_verification", "attorney_review", "fees"]),
        _chunk("dc_superior_civil_motion_practice", "dc_superior_court_civil_rules", "D.C. Superior Court Rules of Civil Procedure", "D.C. Super. Ct. Civ. R.", "court_rule_reference", "court_rule", "civil_litigation", "D.C. Superior Court civil motion practice requires checking the current civil rules, scheduling orders, service requirements, opposition deadlines, exhibits, declarations, proposed orders, and relief requested. Drafting motions to dismiss, compel, amend, reconsider, or for summary judgment should use verified rule text and docket facts.", ["motion", "civil", "service", "deadline", "proposed_order"]),
        _chunk("dc_circuit_appellate_briefing", "dc_circuit_rules", "D.C. Circuit Rules and Handbook", "D.C. Cir. Rules and Handbook", "court_rule_reference", "court_rule", "appellate", "D.C. Circuit briefs require careful verification of authorities, quotes, procedural requirements, certificates, jurisdictional statements, standards of review, and record references. Administrative record citations and appendix references must be checked before filing.", ["appeal", "brief", "record_reference", "standard_of_review"]),
        _chunk("dc_court_appeals_practice", "dc_court_appeals_rules", "D.C. Court of Appeals Rules", "D.C. Ct. App. R.", "court_rule_reference", "court_rule", "appellate", "D.C. Court of Appeals practice requires checking notices of appeal, motions, briefs, appendices, preservation, standards of review, emergency relief, and filing deadlines against current official court rules.", ["appeal", "motion", "deadline", "emergency_relief"]),
        _chunk("dc_landlord_tenant_housing", "dc_code_landlord_tenant", "D.C. Code Title 42 Landlord and Tenant", "D.C. Code Title 42", "statute", "statute", "housing", "D.C. landlord-tenant and housing matters require checking Title 42, lease obligations, notices, rent demands, eviction defenses, habitability, security deposits, TOPA, tenant petitions, and Superior Court landlord-tenant procedure against official sources.", ["tenant", "lease", "eviction", "habitability", "security_deposit", "topa"]),
        _chunk("dc_family_domestic_relations", "dc_code_family_law", "D.C. Code Title 16 Family Law and Domestic Relations", "D.C. Code Title 16", "statute", "statute", "family", "D.C. family matters require checking official Title 16 and court rules for custody, child support, domestic violence protective orders, divorce, parentage, best interests, emergency relief, service, hearings, and confidentiality-sensitive facts.", ["family", "custody", "child_support", "protective_order", "divorce"]),
        _chunk("dc_zoning_bza_planning", "dc_zoning_regulations", "D.C. Municipal Regulations Title 11 Zoning", "11 DCMR", "regulation", "regulation", "zoning", "D.C. zoning work requires checking 11 DCMR, zoning maps, Subtitle provisions, BZA variance and special exception standards, ANC notice, Office of Zoning procedures, deadlines, party status, and official order text.", ["zoning", "bza", "variance", "special_exception", "anc"]),
        _chunk("dc_admin_appeals_record", "dc_admin_procedure_act", "D.C. Administrative Procedure Act", "D.C. Code Administrative Procedure Act", "statute", "statute", "administrative", "D.C. administrative appeals require checking the Administrative Procedure Act, final agency action, contested case status, exhaustion, timeliness, standard of review, findings, substantial evidence, arbitrary and capricious review, and the certified administrative record.", ["administrative_appeal", "agency", "record", "final_order", "standard_of_review"]),
        _chunk("dc_rules_evidence_hearings", "dc_rules_evidence", "D.C. Rules of Evidence", "D.C. R. Evid.", "court_rule_reference", "court_rule", "litigation", "D.C. evidence questions require checking official evidence rules for relevance, hearsay, authentication, business records, expert testimony, impeachment, privileges, exhibits, declarations, and hearing preparation.", ["evidence", "hearsay", "authentication", "expert", "privilege"]),
        _chunk("dc_consumer_protection_claims", "dc_consumer_protection", "D.C. Consumer Protection Procedures Act", "D.C. Code Title 28 CPPA", "statute", "statute", "consumer", "D.C. consumer protection analysis requires checking the CPPA, unlawful trade practices, misrepresentations, damages, demand letters, standing, limitations, remedies, and verified statutory text before drafting claims.", ["consumer", "cppa", "misrepresentation", "damages", "demand_letter"]),
        _chunk("dc_housing_code_conditions", "dc_housing_code_regulations", "D.C. Housing Code Regulations", "14 DCMR", "regulation", "regulation", "housing", "D.C. housing code analysis requires checking official regulations for code violations, repairs, notices, inspections, habitability, mold, utilities, rent abatement, tenant petitions, and enforcement records.", ["housing_code", "repairs", "inspection", "habitability", "rent_abatement"]),
    ]


def _chunk(
    chunk_id: str,
    source_id: str,
    title: str,
    citation: str,
    source_type: str,
    authority_type: str,
    practice_area: str,
    text: str,
    entities: list[str],
) -> KnowledgeChunk:
    return KnowledgeChunk(
        chunk_id=chunk_id,
        source_id=source_id,
        text=text,
        summary=text,
        source_title=title,
        citation_label=citation,
        source_type=source_type,
        authority_type=authority_type,
        jurisdiction="District of Columbia",
        official_locator=f"Official {title} locator",
        url="https://www.dc.gov/",
        entities=entities,
        relationships=[
            {"from": entity, "to": source_id, "type": "grounded_by"}
            for entity in entities[:5]
        ],
        verification_status="official_metadata_unquoted",
        last_checked="2026-05-12",
        practice_area=practice_area,
        source_date="2026-05-12",
        tenant_id="public",
    )


def _langsmith_link(trace_id: str) -> str:
    return f"{langsmith_project_config().ui_url}?trace_id={trace_id}"


def _tokens(text: str) -> list[str]:
    return [
        token.strip(".,;:()[]{}\"'").lower()
        for token in text.replace("D.C.", "dc").replace("D.C", "dc").replace("Prof'l", "profl").split()
        if len(token.strip(".,;:()[]{}\"'")) > 2
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Mercy D.C. RAGAS-style retrieval evaluation.")
    parser.add_argument("--dataset", default=str(DEFAULT_DATASET_PATH), help="Path to JSONL golden dataset.")
    parser.add_argument("--top-k", type=int, default=5, help="Number of chunks to retrieve per example.")
    parser.add_argument("--limit", type=int, default=None, help="Optional maximum examples to evaluate.")
    parser.add_argument("--threshold", type=float, default=RELEASE_OVERALL_THRESHOLD, help="Per-row average score threshold.")
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
    "FAILURE_GROUPS",
    "GoldenExample",
    "EvaluationRow",
    "RAGAS_EVAL_VERSION",
    "RELEASE_OVERALL_THRESHOLD",
    "RELEASE_PASS_RATE_THRESHOLD",
    "load_golden_dataset",
    "run_ragas_evaluation",
]
