"""Legal Assignment Compiler for Mercy LARS."""

from __future__ import annotations

from typing import Any

from lars.models import (
    DELIVERABLE_TYPES,
    BudgetState,
    DEFAULT_BUDGETS,
    GateType,
    LegalAssignment,
    new_id,
)


CRITICAL_INPUTS = (
    "jurisdiction",
    "legal_questions",
    "deliverable_type",
    "query",
)


def _string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        items = [part.strip() for part in value.replace("\n", ",").split(",")]
        return [item for item in items if item]
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [str(value).strip()] if str(value).strip() else []


def _budget_from_payload(payload: dict[str, Any]) -> BudgetState:
    budgets = dict(DEFAULT_BUDGETS)
    for key in DEFAULT_BUDGETS:
        if key in payload and payload[key] is not None:
            budgets[key] = payload[key]
    nested = payload.get("budgets")
    if isinstance(nested, dict):
        for key, value in nested.items():
            if key in budgets and value is not None:
                budgets[key] = value
    for alias, target in (
        ("maximum_duration_seconds", "max_duration_seconds"),
        ("maximum_model_budget", "max_model_calls"),
        ("maximum_tool_budget", "max_tool_calls"),
        ("max_cost", "max_cost_usd"),
    ):
        if alias in payload and payload[alias] is not None:
            budgets[target] = payload[alias]
    return BudgetState(
        max_tree_depth=int(budgets["max_tree_depth"]),
        max_active_branches=int(budgets["max_active_branches"]),
        max_children_per_node=int(budgets["max_children_per_node"]),
        max_revisions_per_node=int(budgets["max_revisions_per_node"]),
        max_model_calls=int(budgets["max_model_calls"]),
        max_tool_calls=int(budgets["max_tool_calls"]),
        max_duration_seconds=int(budgets["max_duration_seconds"]),
        max_cost_usd=float(budgets["max_cost_usd"]),
        max_unresolved_contradictions=int(budgets["max_unresolved_contradictions"]),
        max_retry_count=int(budgets["max_retry_count"]),
        max_steps_per_tick=int(budgets["max_steps_per_tick"]),
    )


def compile_legal_assignment(
    payload: dict[str, Any],
    *,
    tenant_id: str,
    user_id: str,
    firm_id: str | None = None,
) -> LegalAssignment:
    """Compile attorney input into a validated Legal Assignment Specification."""
    query = str(payload.get("query") or payload.get("instructions") or "").strip()
    legal_questions = _string_list(payload.get("legal_questions") or payload.get("questions"))
    if query and not legal_questions:
        legal_questions = [query]
    if not query and legal_questions:
        query = legal_questions[0]

    deliverable_type = str(payload.get("deliverable_type") or "research_memorandum").strip().lower()
    if deliverable_type not in DELIVERABLE_TYPES:
        deliverable_type = "research_memorandum"

    jurisdiction = str(payload.get("jurisdiction") or "District of Columbia").strip() or "District of Columbia"
    matter_id = str(payload.get("matter_id") or "").strip() or None
    selected_document_ids = _string_list(payload.get("selected_document_ids") or payload.get("document_ids"))
    factual_assumptions = _string_list(payload.get("factual_assumptions") or payload.get("assumptions"))
    disputed_facts = _string_list(payload.get("disputed_facts"))

    missing: list[str] = []
    if not query:
        missing.append("query")
    if not legal_questions:
        missing.append("legal_questions")
    if not jurisdiction:
        missing.append("jurisdiction")
    if not matter_id and not selected_document_ids and not factual_assumptions:
        missing.append("matter_id_or_facts_or_documents")

    constrained: list[str] = []
    allow_assumptions = bool(payload.get("allow_constrained_assumptions", True))
    if "matter_id_or_facts_or_documents" in missing and allow_assumptions:
        constrained.append(
            "No matter documents were selected; research will proceed on attorney-stated facts only and must label missing record support."
        )
        missing = [item for item in missing if item != "matter_id_or_facts_or_documents"]

    clarification_required = bool(missing) and not bool(payload.get("force_start"))
    checkpoints = _string_list(payload.get("approval_checkpoints")) or [
        GateType.ASSIGNMENT.value,
        GateType.DRAFT.value,
        GateType.FINAL.value,
    ]
    if payload.get("require_research_plan_approval"):
        if GateType.RESEARCH_PLAN.value not in checkpoints:
            checkpoints.insert(1, GateType.RESEARCH_PLAN.value)

    assignment = LegalAssignment(
        assignment_id=str(payload.get("assignment_id") or new_id("asg")),
        tenant_id=tenant_id,
        user_id=user_id,
        firm_id=firm_id,
        matter_id=matter_id,
        workspace=str(payload.get("workspace") or "web"),
        jurisdiction=jurisdiction,
        legal_questions=legal_questions,
        deliverable_type=deliverable_type,
        query=query,
        factual_assumptions=factual_assumptions,
        disputed_facts=disputed_facts,
        selected_document_ids=selected_document_ids,
        source_restrictions=_string_list(payload.get("source_restrictions")),
        official_source_preference=bool(payload.get("official_source_preference", True)),
        intended_audience=str(payload.get("intended_audience") or "attorney"),
        tone=str(payload.get("tone") or "professional_dc"),
        research_depth=str(payload.get("research_depth") or "standard"),
        citation_requirements=_string_list(payload.get("citation_requirements"))
        or ["official_dc_sources_preferred", "no_fabricated_citations"],
        approval_checkpoints=checkpoints,
        privilege_constraints=_string_list(payload.get("privilege_constraints"))
        or ["attorney_client_privilege_preserved"],
        confidentiality_constraints=_string_list(payload.get("confidentiality_constraints"))
        or ["tenant_isolated", "matter_scoped"],
        excluded_theories=_string_list(payload.get("excluded_theories")),
        excluded_sources=_string_list(payload.get("excluded_sources")),
        require_adverse_authority_review=bool(payload.get("require_adverse_authority_review", True)),
        require_treatment_validation=bool(payload.get("require_treatment_validation", True)),
        required_output_formats=_string_list(payload.get("required_output_formats"))
        or ["structured_json", "attorney_review_markdown"],
        governing_law=str(payload.get("governing_law") or jurisdiction),
        relevant_date=str(payload.get("relevant_date") or "").strip() or None,
        deadline=str(payload.get("deadline") or "").strip() or None,
        missing_critical_inputs=missing,
        constrained_assumptions=constrained,
        clarification_required=clarification_required,
        budgets=_budget_from_payload(payload),
        metadata={
            "compiler": "lars_assignment_compiler_1.0",
            "surface": payload.get("surface_context") or "web",
            "raw_keys": sorted(str(key) for key in payload.keys()),
        },
    )
    return assignment


def validate_assignment(assignment: LegalAssignment) -> dict[str, Any]:
    errors: list[str] = []
    if not assignment.tenant_id:
        errors.append("tenant_id is required")
    if not assignment.user_id:
        errors.append("user_id is required")
    if not assignment.query:
        errors.append("query is required")
    if not assignment.legal_questions:
        errors.append("legal_questions are required")
    if assignment.deliverable_type not in DELIVERABLE_TYPES:
        errors.append("deliverable_type is not supported")
    if assignment.budgets.max_model_calls < 1:
        errors.append("max_model_calls must be >= 1")
    if assignment.budgets.max_active_branches < 1:
        errors.append("max_active_branches must be >= 1")
    if assignment.clarification_required:
        errors.append("clarification_required: " + ", ".join(assignment.missing_critical_inputs))
    return {
        "valid": not errors,
        "errors": errors,
        "missing_critical_inputs": list(assignment.missing_critical_inputs),
        "constrained_assumptions": list(assignment.constrained_assumptions),
        "clarification_required": assignment.clarification_required,
    }
