"""Structured legal branch evaluator for Mercy ALTS."""

from __future__ import annotations

from typing import Any

from lars.models import EvaluationScores, ResearchJob, TreeNode


WEIGHT_PROFILES: dict[str, dict[str, float]] = {
    "research_memorandum": {
        "controlling_authority_strength": 0.16,
        "jurisdiction_fit": 0.1,
        "adverse_authority_coverage": 0.12,
        "citation_completeness": 0.1,
        "citation_entailment": 0.1,
        "factual_record_support": 0.08,
        "contradiction_resolution": 0.08,
        "unsupported_claim_risk": 0.1,
        "missing_fact_risk": 0.08,
        "treatment_validity": 0.08,
    },
    "contract_review": {
        "matter_document_grounding": 0.18,
        "factual_record_support": 0.12,
        "legal_risk": 0.12,
        "citation_completeness": 0.08,
        "jurisdiction_fit": 0.08,
        "unsupported_claim_risk": 0.12,
        "missing_fact_risk": 0.1,
        "confidentiality_risk": 0.08,
        "contradiction_resolution": 0.06,
        "procedural_relevance": 0.06,
    },
    "motion": {
        "controlling_authority_strength": 0.16,
        "procedural_relevance": 0.14,
        "factual_record_support": 0.14,
        "jurisdiction_fit": 0.1,
        "citation_entailment": 0.1,
        "adverse_authority_coverage": 0.1,
        "unsupported_claim_risk": 0.1,
        "contradiction_resolution": 0.08,
        "missing_fact_risk": 0.08,
    },
}


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _invert_risk(value: float) -> float:
    return _clamp(1.0 - value)


def evaluate_node(job: ResearchJob, node: TreeNode) -> EvaluationScores:
    deliverable = job.assignment.deliverable_type
    weights = dict(WEIGHT_PROFILES.get(deliverable) or WEIGHT_PROFILES["research_memorandum"])

    authorities = node.authorities_found or []
    support = node.supporting_evidence or []
    contrary = node.contrary_evidence or []
    missing = node.missing_evidence or []
    contradictions = [cid for cid in node.contradictions if cid in job.contradictions]
    from lars.models import contradiction_is_open  # local to avoid import cycles

    unresolved = [
        job.contradictions[cid]
        for cid in contradictions
        if contradiction_is_open(job.contradictions[cid].resolution_status)
    ]

    official_hits = sum(
        1
        for item in authorities
        if str(item.get("validation_status") or item.get("source_authenticity_result") or "").lower()
        in {"official", "verified", "candidate_official"}
        or "d.c." in str(item.get("jurisdiction") or "").lower()
        or "district of columbia" in str(item.get("jurisdiction") or "").lower()
    )
    controlling_hits = sum(
        1
        for item in authorities
        if str(item.get("classification") or item.get("precedential_weight") or "").lower()
        in {"controlling", "binding", "high"}
    )

    jurisdiction_fit = 0.85 if "columbia" in (node.jurisdiction or "").lower() or "d.c" in (node.jurisdiction or "").lower() else 0.45
    if any("columbia" in str(item.get("jurisdiction") or "").lower() or "d.c" in str(item.get("jurisdiction") or "").lower() for item in authorities):
        jurisdiction_fit = max(jurisdiction_fit, 0.9)

    scores = EvaluationScores(
        controlling_authority_strength=_clamp(0.25 + 0.2 * controlling_hits + 0.1 * len(authorities)),
        jurisdiction_fit=_clamp(jurisdiction_fit),
        source_authenticity=_clamp(0.3 + 0.2 * official_hits),
        authority_hierarchy=_clamp(0.25 + 0.15 * controlling_hits + 0.05 * len(authorities)),
        factual_record_support=_clamp(0.2 + 0.15 * len(support) - 0.1 * len(missing)),
        matter_document_grounding=_clamp(0.2 + 0.2 * len(node.matter_documents_used) + 0.1 * len(support)),
        citation_entailment=_clamp(0.35 + 0.15 * len(authorities) - 0.15 * len(contrary)),
        citation_completeness=_clamp(0.25 + 0.15 * len(authorities) - 0.1 * len(missing)),
        treatment_validity=_clamp(0.55 if authorities else 0.2),
        procedural_relevance=_clamp(0.5 + (0.2 if "motion" in deliverable or "brief" in deliverable else 0.0)),
        temporal_validity=_clamp(0.7 if node.relevant_date or job.assignment.relevant_date else 0.55),
        adverse_authority_coverage=_clamp(0.3 + 0.2 * len(contrary) + (0.15 if job.assignment.require_adverse_authority_review and contrary else 0.0)),
        counterargument_coverage=_clamp(0.25 + 0.15 * len(contrary) + 0.1 * len(node.draft_conclusions)),
        contradiction_resolution=_clamp(0.85 if not unresolved else max(0.1, 0.7 - 0.2 * len(unresolved))),
        legal_risk=_clamp(0.3 + 0.1 * len(unresolved) + 0.05 * len(missing)),
        privilege_risk=_clamp(0.1 if "privilege" in " ".join(job.assignment.privilege_constraints).lower() else 0.2),
        confidentiality_risk=_clamp(0.1 if job.assignment.tenant_id else 0.4),
        unsupported_claim_risk=_clamp(0.7 if not authorities and node.draft_conclusions else 0.25 + 0.1 * len(missing)),
        outdated_law_risk=_clamp(0.25 if authorities else 0.45),
        missing_fact_risk=_clamp(0.2 + 0.15 * len(missing) + (0.2 if not support and not job.assignment.factual_assumptions else 0.0)),
        redundancy=_clamp(0.1 * max(0, len(node.draft_conclusions) - 1)),
        novelty=_clamp(0.55 if node.hypothesis else 0.35),
        expected_value_of_further_research=_clamp(
            0.7 if missing or unresolved or len(authorities) < 2 else 0.25
        ),
        weights=weights,
    )

    positive_keys = [
        "controlling_authority_strength",
        "jurisdiction_fit",
        "source_authenticity",
        "authority_hierarchy",
        "factual_record_support",
        "matter_document_grounding",
        "citation_entailment",
        "citation_completeness",
        "treatment_validity",
        "procedural_relevance",
        "temporal_validity",
        "adverse_authority_coverage",
        "counterargument_coverage",
        "contradiction_resolution",
        "novelty",
    ]
    risk_keys = [
        "legal_risk",
        "privilege_risk",
        "confidentiality_risk",
        "unsupported_claim_risk",
        "outdated_law_risk",
        "missing_fact_risk",
        "redundancy",
    ]

    weighted = 0.0
    total_weight = 0.0
    for key, weight in weights.items():
        value = getattr(scores, key, None)
        if value is None:
            continue
        score_value = _invert_risk(float(value)) if key in risk_keys else float(value)
        weighted += weight * score_value
        total_weight += weight
    if total_weight <= 0:
        for key in positive_keys:
            weighted += float(getattr(scores, key))
            total_weight += 1.0
    scores.overall = _clamp(weighted / total_weight if total_weight else 0.0)

    scores.explanation = (
        f"overall={scores.overall:.2f}; authorities={len(authorities)}; support={len(support)}; "
        f"contrary={len(contrary)}; missing={len(missing)}; unresolved_contradictions={len(unresolved)}; "
        f"jurisdiction_fit={scores.jurisdiction_fit:.2f}; unsupported_claim_risk={scores.unsupported_claim_risk:.2f}"
    )
    return scores


def branch_rank(job: ResearchJob, branch_id: str) -> float:
    nodes = [node for node in job.nodes.values() if node.branch_id == branch_id and node.status not in {"pruned"}]
    if not nodes:
        return 0.0
    return sum(node.evaluation.overall for node in nodes) / len(nodes)
