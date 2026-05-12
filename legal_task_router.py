from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any

from dc_knowledge_rag import retrieve_dc_knowledge
from dc_guardrails import evaluate_dc_guardrails
from mercy_context import get_matter_context
from observability import record_guardrail_trace, record_route_trace
from response_envelope import normalize_guardrail_status


ROUTER_VERSION = "moe-router-1.0"
SAFE_CONFIDENCE_THRESHOLD = 0.85

EXPERTS = {
    "research": "Research",
    "drafting": "Drafting",
    "compliance_guardrails": "Compliance/Guardrails",
    "intake": "Intake",
    "citation_verifier": "Citation-Verifier",
}

ROUTE_CAPABILITIES = {
    "research": "dc_research_evidence_pack",
    "drafting": "workspace_draft",
    "compliance_guardrails": "dc_guardrail_review",
    "intake": "matter_intake",
    "citation_verifier": "citation_verification",
}

CITATION_PATTERN = re.compile(
    r"\b(?:\d+\s+(?:F\.(?:2d|3d|4th|Supp\.?\s?\d*)|U\.S\.|A\.3d|D\.C\.)\s*\d*|"
    r"D\.C\.\s+Cir\.|D\.C\.\s+Code|D\.C\.\s+Mun\.\s+Regs?\.|§)",
    re.IGNORECASE,
)


@dataclass
class RouteCandidate:
    expert: str
    route_mode: str
    confidence: float
    reasons: list[str] = field(default_factory=list)


@dataclass
class RouterDecision:
    router_version: str
    route_mode: str
    expert: str
    expert_label: str
    confidence: float
    selected_capability: str
    guardrail_status: str
    guardrail_profile: dict[str, Any]
    citations: list[dict[str, Any]]
    missing_inputs: list[str]
    alternate_routes: list[dict[str, Any]]
    fallback_path: str
    surface_context: str
    premium_gate: str
    next_action: str
    execute: bool
    user_type: str
    knowledge_context: dict[str, Any]
    safety_notes: list[str]
    confidentiality: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def is_citation_heavy(query: str) -> bool:
    lower = query.lower()
    citation_terms = (
        "citation",
        "cite check",
        "verify cite",
        "verify citation",
        "bluebook",
        "pin cite",
        "shepard",
        "keycite",
        "authority",
    )
    return bool(CITATION_PATTERN.search(query)) or any(term in lower for term in citation_terms)


def is_drafting_task(query: str) -> bool:
    lower = query.lower()
    drafting_terms = (
        "draft",
        "write",
        "revise",
        "redraft",
        "insert",
        "prepare",
        "generate",
        "clause",
        "brief",
        "motion",
        "letter",
        "memo",
        "statement of facts",
        "statement of the case",
        "argument section",
    )
    return any(term in lower for term in drafting_terms)


def is_intake_task(query: str) -> bool:
    lower = query.lower()
    intake_terms = (
        "intake",
        "new matter",
        "open a matter",
        "update matter",
        "matter context",
        "client intake",
        "fact gathering",
        "matter fact",
        "conflict check",
        "conflicts check",
        "scope confirmation",
        "engagement scope",
        "prospective client",
        "client id",
        "client role",
        "opposing parties",
    )
    return any(term in lower for term in intake_terms)


def _context_text(matter_context: dict[str, Any]) -> str:
    parts: list[str] = []
    for key in (
        "workflow",
        "draft_type",
        "requested_relief",
        "selected_text",
        "document_text",
        "document_path",
        "jurisdiction",
        "client_role",
        "client_name",
        "matter_type",
    ):
        value = matter_context.get(key)
        if isinstance(value, str):
            parts.append(value)
    facts = matter_context.get("facts")
    if isinstance(facts, dict):
        parts.extend(str(value) for value in facts.values() if isinstance(value, (str, int, float)))
    key_facts = matter_context.get("key_facts")
    if isinstance(key_facts, dict):
        parts.extend(str(value) for value in key_facts.values() if isinstance(value, (str, int, float)))
    return " ".join(parts)


def _merge_matter_context(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    merged = {**base, **overlay}
    for key in ("facts", "key_facts"):
        base_value = base.get(key) if isinstance(base.get(key), dict) else {}
        overlay_value = overlay.get(key) if isinstance(overlay.get(key), dict) else {}
        if base_value or overlay_value:
            merged[key] = {**base_value, **overlay_value}
    for key in ("documents", "deadlines", "opposing_parties", "sensitivity_flags", "missing_information"):
        if key in overlay and overlay[key]:
            continue
        if key in base:
            merged[key] = base[key]
    return merged


def inject_current_matter_context(matter_context: dict[str, Any] | None) -> dict[str, Any]:
    context = dict(matter_context or {})
    matter_id = context.get("matter_id")
    if not matter_id:
        return context
    stored = get_matter_context(str(matter_id))
    if not stored:
        return context
    return _merge_matter_context(stored, context)


def _score_keyword_hits(text: str, keywords: tuple[str, ...]) -> tuple[float, list[str]]:
    lower = text.lower()
    hits = [keyword for keyword in keywords if keyword in lower]
    score = min(0.35, len(hits) * 0.07)
    return score, hits[:5]


def small_llm_classify(query: str, matter_context: dict[str, Any], user_type: str) -> dict[str, Any]:
    """Lightweight deterministic classifier standing in for a small routing model.

    The function keeps routing local and inspectable for brownfield development.
    It can be replaced by a hosted small model later without changing the route
    envelope consumed by the dashboard or Word add-in.
    """

    text = f"{query} {_context_text(matter_context)}"
    selected_text = bool(matter_context.get("selected_text"))
    document_text = bool(matter_context.get("document_text") or matter_context.get("document_path"))

    expert_keywords: dict[str, tuple[str, ...]] = {
        "research": (
            "research",
            "what is the law",
            "requirements",
            "standard",
            "d.c. code",
            "dc code",
            "rule",
            "case law",
            "authority",
            "enforceable",
        ),
        "drafting": (
            "draft",
            "write",
            "revise",
            "prepare",
            "clause",
            "brief",
            "memo",
            "letter",
            "insert",
        ),
        "compliance_guardrails": (
            "ethics",
            "confidential",
            "privilege",
            "guardrail",
            "compliance",
            "fee",
            "supervision",
            "unsafe",
        ),
        "intake": (
            "new matter",
            "open a matter",
            "intake",
            "client",
            "prospective client",
            "deadline",
            "jurisdiction",
            "party",
            "parties",
            "conflict check",
            "scope confirmation",
            "engagement scope",
            "fact gathering",
        ),
        "citation_verifier": (
            "citation",
            "cite",
            "bluebook",
            "verify cite",
            "pinpoint",
            "authority",
            "quote",
        ),
    }

    scores: dict[str, float] = {
        "research": 0.42,
        "drafting": 0.42,
        "compliance_guardrails": 0.34,
        "intake": 0.32,
        "citation_verifier": 0.35,
    }
    reasons: dict[str, list[str]] = {expert: [] for expert in scores}

    for expert, keywords in expert_keywords.items():
        bonus, hits = _score_keyword_hits(text, keywords)
        scores[expert] += bonus
        reasons[expert].extend(f"keyword:{hit}" for hit in hits)

    if selected_text:
        scores["drafting"] += 0.08
        scores["research"] += 0.06
        reasons["drafting"].append("selected_text")
    if document_text:
        scores["research"] += 0.08
        scores["compliance_guardrails"] += 0.05
        reasons["research"].append("document_context")
    if user_type in {"solo", "small_firm"}:
        scores["intake"] += 0.03
        scores["compliance_guardrails"] += 0.03

    candidates: list[RouteCandidate] = []
    for expert, score in scores.items():
        candidates.append(
            RouteCandidate(
                expert=expert,
                route_mode=_route_mode_for_expert(expert, matter_context),
                confidence=round(min(score, 0.97), 2),
                reasons=reasons[expert],
            )
        )

    candidates.sort(key=lambda item: item.confidence, reverse=True)
    return {"candidates": candidates, "classifier": "rule_weighted_lightweight"}


def select_expert(classification: dict[str, Any], threshold: float = SAFE_CONFIDENCE_THRESHOLD) -> RouteCandidate:
    candidates = classification["candidates"]
    top = candidates[0]
    if top.confidence >= threshold:
        return top
    if top.expert in {"research", "drafting", "citation_verifier"} and top.confidence >= 0.72:
        return top
    return RouteCandidate(
        expert="intake",
        route_mode="intake",
        confidence=max(0.7, top.confidence),
        reasons=["low_confidence_intake_fallback", *top.reasons],
    )


def dc_guardrails_pass(query: str, expert: str) -> bool:
    lower = query.lower()
    unsafe_terms = (
        "no attorney review",
        "without attorney review",
        "hide this from",
        "ignore confidentiality",
        "guarantee outcome",
        "bill the client automatically",
        "final legal advice",
    )
    if any(term in lower for term in unsafe_terms):
        return False
    if expert in {"research", "drafting", "citation_verifier"}:
        return True
    return True


def fallback_to_compliance_expert(
    query: str,
    matter_context: dict[str, Any],
    user_type: str,
    surface_context: str,
    reason: str = "pre_compliance_guardrail_failed",
) -> RouterDecision:
    candidate = RouteCandidate(
        expert="compliance_guardrails",
        route_mode="compliance_check",
        confidence=0.96,
        reasons=[reason],
    )
    decision = _build_decision(
        query=query,
        matter_context=matter_context,
        user_type=user_type,
        surface_context=surface_context,
        top=candidate,
        candidates=[candidate],
        execute=False,
        next_action="Review confidentiality, attorney supervision, citation verification, and fee-safety requirements before continuing.",
    )
    route = decision.to_dict()
    record_route_trace(route, surface_context=surface_context, matter_reference=matter_context.get("matter_id"))
    record_guardrail_trace(route, surface_context=surface_context, matter_reference=matter_context.get("matter_id"))
    return decision


def delegate_to_agent_network(
    query: str,
    matter_context: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
    user_type: str = "solo",
) -> dict[str, Any]:
    """Route a task, then delegate it to the matching LangGraph agent network."""

    decision = moe_route(query, matter_context, user_type=user_type)
    from agent_network import execute_agent_task

    return execute_agent_task(
        task=query,
        params=params or {},
        matter_context=matter_context or {},
        route=decision.to_dict(),
        user_type=user_type,
    )


def moe_route(query: str, matter_context: dict[str, Any] | None, user_type: str = "solo") -> RouterDecision:
    matter_context = inject_current_matter_context(matter_context)
    surface_context = str(matter_context.get("surface_context") or "core")

    if is_citation_heavy(query):
        classification = {
            "candidates": [
                RouteCandidate("citation_verifier", "source_verification", 0.94, ["fast_filter:citation_heavy"]),
                RouteCandidate("research", "dc_research", 0.78, ["alternate:authority_research"]),
            ]
        }
    elif is_intake_task(query):
        classification = {
            "candidates": [
                RouteCandidate("intake", "intake", 0.91, ["fast_filter:matter_intake"]),
                RouteCandidate("compliance_guardrails", "compliance_check", 0.74, ["alternate:confidentiality_review"]),
            ]
        }
    elif is_drafting_task(query):
        classification = {
            "candidates": [
                RouteCandidate("drafting", _route_mode_for_expert("drafting", matter_context), 0.93, ["fast_filter:drafting_task"]),
                RouteCandidate("compliance_guardrails", "compliance_check", 0.74, ["alternate:review_before_use"]),
            ]
        }
    else:
        classification = small_llm_classify(query, matter_context, user_type)

    candidates = classification["candidates"]
    top = select_expert(classification, threshold=SAFE_CONFIDENCE_THRESHOLD)

    if not dc_guardrails_pass(query, top.expert):
        return fallback_to_compliance_expert(query, matter_context, user_type, surface_context)

    matter_context = _inject_dc_knowledge(query, matter_context, top)
    missing_inputs = detect_missing_inputs(top.expert, query, matter_context)
    execute = top.confidence >= SAFE_CONFIDENCE_THRESHOLD and not _has_required_missing_inputs(top.expert, missing_inputs)
    next_action = (
        "Route is ready for the selected expert with D.C. ethics guardrails attached."
        if execute
        else _minimum_question(top.expert, missing_inputs)
    )

    decision = _build_decision(
        query=query,
        matter_context=matter_context,
        user_type=user_type,
        surface_context=surface_context,
        top=top,
        candidates=candidates,
        execute=execute,
        next_action=next_action,
    )
    route = decision.to_dict()
    record_route_trace(route, surface_context=surface_context, matter_reference=matter_context.get("matter_id"))
    record_guardrail_trace(route, surface_context=surface_context, matter_reference=matter_context.get("matter_id"))
    return decision


def detect_missing_inputs(expert: str, query: str, matter_context: dict[str, Any]) -> list[str]:
    missing: list[str] = []
    has_context = any(
        matter_context.get(key)
        for key in ("facts", "key_facts", "selected_text", "document_text", "document_path", "documents", "case_summary")
    )

    if not query.strip():
        missing.append("query")
    if expert == "intake":
        for key in ("jurisdiction", "client_role", "requested_relief", "deadlines", "documents", "conflict_check", "scope_confirmation"):
            if not matter_context.get(key):
                missing.append(key)
    if expert == "drafting":
        if not has_context:
            missing.append("facts_or_document_context")
        if "d.c." not in query.lower() and "dc" not in query.lower() and not matter_context.get("jurisdiction"):
            missing.append("jurisdiction")
    if expert == "research":
        if not matter_context.get("jurisdiction") and "d.c." not in query.lower() and "dc" not in query.lower():
            missing.append("jurisdiction")
        if "under" in query.lower() and not has_context:
            missing.append("applicable_facts")
    if expert == "citation_verifier":
        if not (is_citation_heavy(query) or matter_context.get("citations")):
            missing.append("citation_text")
    return missing


def _inject_dc_knowledge(query: str, matter_context: dict[str, Any], top: RouteCandidate) -> dict[str, Any]:
    if top.expert not in {"research", "drafting"}:
        return matter_context
    if matter_context.get("dc_knowledge"):
        return matter_context
    knowledge = retrieve_dc_knowledge(
        query=query,
        matter_context=matter_context,
        top_k=4,
        route={"expert": top.expert, "route_mode": top.route_mode, "confidence": top.confidence},
        agentic=False,
    )
    citations = [*(matter_context.get("citations") or []), *(knowledge.get("citations") or [])]
    return {
        **matter_context,
        "dc_knowledge": {
            "rag_version": knowledge.get("rag_version"),
            "results": knowledge.get("results", []),
            "verification": knowledge.get("verification"),
            "backend_status": knowledge.get("backend_status"),
            "graph_context": knowledge.get("graph_context"),
        },
        "citations": citations,
    }


def _has_required_missing_inputs(expert: str, missing_inputs: list[str]) -> bool:
    if not missing_inputs:
        return False
    if expert == "drafting":
        return "facts_or_document_context" in missing_inputs
    if expert in {"research", "citation_verifier", "intake"}:
        return True
    return False


def _minimum_question(expert: str, missing_inputs: list[str]) -> str:
    if missing_inputs:
        return f"Collect missing input before execution: {', '.join(missing_inputs)}."
    if expert == "intake":
        return "Start the full matter intake flow and collect jurisdiction, parties, conflicts, scope, deadlines, documents, and requested relief."
    return "Confirm the task scope before executing the selected expert."


def _route_mode_for_expert(expert: str, matter_context: dict[str, Any]) -> str:
    workflow = str(matter_context.get("workflow") or matter_context.get("draft_type") or "").lower()
    if expert == "drafting":
        if "clause" in workflow:
            return "clause_explanation" if "explanation" in workflow else "drafting"
        if "contract" in workflow:
            return "contract_review"
        return "drafting"
    if expert == "research":
        return "document_review" if matter_context.get("document_text") else "dc_research"
    if expert == "citation_verifier":
        return "source_verification"
    if expert == "compliance_guardrails":
        return "compliance_check"
    return "intake"


def _guardrail_profile(query: str, top: RouteCandidate, matter_context: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "draft": query,
        "draft_type": matter_context.get("draft_type") or top.route_mode,
        "human_review_required": True,
    }
    evaluated = evaluate_dc_guardrails(payload)
    required_checks = [
        "confidentiality",
        "human_attorney_review",
        "citation_verification",
        "record_verification",
        "no_model_training_by_mercy",
    ]
    if top.expert == "drafting":
        required_checks.extend(["word_ready_output", "bracket_missing_record_support"])
    if top.expert == "citation_verifier":
        required_checks.extend(["source_status", "pinpoint_review"])
    if top.route_mode in {"billing_report", "compliance_check"}:
        required_checks.append("fee_reasonableness")

    return {
        "status": evaluated["status"],
        "schema": evaluated["schema"],
        "required_checks": required_checks,
        "review_flags": evaluated["review_flags"],
        "ethics_388": evaluated["ethics_388"],
        "rule_28": evaluated["rule_28"],
        "rule_32": evaluated["rule_32"],
    }


def _citations(query: str, matter_context: dict[str, Any]) -> list[dict[str, Any]]:
    citations: list[dict[str, Any]] = []
    seen: set[str] = set()
    for match in CITATION_PATTERN.finditer(query):
        citation = match.group(0)
        if citation not in seen:
            citations.append(
                {
                    "label": citation,
                    "source_type": "legal_authority",
                    "verification_status": "candidate_unverified",
                    "note": "Attorney must verify citation, pinpoint support, and current validity.",
                    "provenance": {"source": "query", "match": citation},
                }
            )
            seen.add(citation)

    for source in matter_context.get("citations") or []:
        if isinstance(source, dict):
            citations.append(
                {
                    "label": str(source.get("label") or source.get("citation") or "Matter citation"),
                    "source_type": str(source.get("source_type") or "matter_source"),
                    "verification_status": str(source.get("verification_status") or "candidate_unverified"),
                    "note": str(source.get("note") or "Matter-supplied citation requires attorney verification."),
                    "provenance": source.get("provenance") if isinstance(source.get("provenance"), dict) else {"source": "matter_context"},
                }
            )

    if not citations:
        citations.append(
            {
                "label": "[VERIFY CITE]",
                "source_type": "placeholder",
                "verification_status": "missing_required",
                "note": "No verified authority supplied; use official D.C. sources before relying on the output.",
                "provenance": {"source": "router_placeholder"},
            }
        )
    return citations


def _fallback_path(top: RouteCandidate, execute: bool) -> str:
    if not execute:
        return "intake_or_clarifying_question"
    if top.expert == "drafting":
        return "workspace_draft_with_safe_template_fallback"
    if top.expert == "research":
        return "source_placeholder_research_summary"
    if top.expert == "citation_verifier":
        return "candidate_citation_report_with_verify_placeholders"
    if top.expert == "compliance_guardrails":
        return "dc_guardrail_review_only"
    return "matter_intake_prompt"


def _premium_gate(top: RouteCandidate, matter_context: dict[str, Any]) -> str:
    if matter_context.get("tier") == "premium":
        return "premium_enabled"
    if top.expert == "citation_verifier":
        return "premium_candidate_limited_to_placeholders"
    return "free_allowed"


def _build_decision(
    query: str,
    matter_context: dict[str, Any],
    user_type: str,
    surface_context: str,
    top: RouteCandidate,
    candidates: list[RouteCandidate],
    execute: bool,
    next_action: str,
) -> RouterDecision:
    guardrails = _guardrail_profile(query, top, matter_context)
    guardrail_status = normalize_guardrail_status(guardrails["status"], execute=execute)
    guardrails["status"] = guardrail_status
    citations = _citations(query, matter_context)
    return RouterDecision(
        router_version=ROUTER_VERSION,
        route_mode=top.route_mode,
        expert=top.expert,
        expert_label=EXPERTS[top.expert],
        confidence=top.confidence,
        selected_capability=ROUTE_CAPABILITIES[top.expert],
        guardrail_status=guardrail_status,
        guardrail_profile=guardrails,
        citations=citations,
        missing_inputs=detect_missing_inputs(top.expert, query, matter_context),
        alternate_routes=[asdict(candidate) for candidate in candidates if candidate.expert != top.expert][:3],
        fallback_path=_fallback_path(top, execute),
        surface_context=surface_context,
        premium_gate=_premium_gate(top, matter_context),
        next_action=next_action,
        execute=execute,
        user_type=user_type,
        knowledge_context=_knowledge_context_for_route(matter_context),
        safety_notes=[
            "D.C. legal output requires attorney supervision.",
            "Confidentiality and privilege must be preserved.",
            "Citations, quotations, and record references remain unverified until attorney review.",
        ],
        confidentiality={
            "mode": "local_nonpersistent_by_default",
            "training_use": "client data is not used for model training by Mercy",
            "redaction_required_for_observability": True,
        },
    )


def _knowledge_context_for_route(matter_context: dict[str, Any]) -> dict[str, Any]:
    knowledge = matter_context.get("dc_knowledge")
    if not isinstance(knowledge, dict):
        return {
            "available": False,
            "results": [],
            "verification": {"status": "not_requested"},
        }
    return {
        "available": bool(knowledge.get("results")),
        "rag_version": knowledge.get("rag_version"),
        "results": knowledge.get("results", []),
        "verification": knowledge.get("verification"),
        "backend_status": knowledge.get("backend_status"),
        "graph_context": knowledge.get("graph_context"),
    }


__all__ = [
    "RouterDecision",
    "RouteCandidate",
    "moe_route",
    "is_citation_heavy",
    "is_drafting_task",
    "is_intake_task",
    "small_llm_classify",
    "inject_current_matter_context",
    "delegate_to_agent_network",
    "select_expert",
    "dc_guardrails_pass",
    "fallback_to_compliance_expert",
]
