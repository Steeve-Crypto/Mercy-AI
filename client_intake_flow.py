from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from mercy_context import update_matter_context
from observability import trace_event
from prompts.intake import build_intake_prompt_library


INTAKE_FLOW_VERSION = "client-intake-flow-1.0"


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _truthy_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _flatten_list(values: list[Any]) -> list[Any]:
    flattened: list[Any] = []
    for value in values:
        if isinstance(value, list):
            flattened.extend(value)
        elif value is not None:
            flattened.append(value)
    return flattened


def _document_references(documents: list[Any]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for index, document in enumerate(documents, start=1):
        if isinstance(document, dict):
            title = document.get("title") or document.get("name") or f"Intake document {index}"
            normalized.append(
                {
                    "document_id": str(document.get("document_id") or document.get("id") or f"intake-doc-{index}"),
                    "title": str(title),
                    "source": str(document.get("source") or "client_intake"),
                    "provenance": document.get("provenance") if isinstance(document.get("provenance"), dict) else {},
                }
            )
        elif _truthy_text(document):
            normalized.append(
                {
                    "document_id": f"intake-doc-{index}",
                    "title": str(document),
                    "source": "client_intake",
                    "provenance": {},
                }
            )
    return normalized


def _deadline_references(deadlines: list[Any]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for index, deadline in enumerate(deadlines, start=1):
        if isinstance(deadline, dict):
            normalized.append(
                {
                    "label": str(deadline.get("label") or deadline.get("name") or f"Deadline {index}"),
                    "date": deadline.get("date"),
                    "source": str(deadline.get("source") or "client_intake"),
                    "notes": deadline.get("notes"),
                }
            )
        elif _truthy_text(deadline):
            normalized.append({"label": str(deadline), "date": None, "source": "client_intake", "notes": None})
    return normalized


def _missing_information(context_payload: dict[str, Any], conflicts: dict[str, Any], scope: dict[str, Any]) -> list[str]:
    missing: list[str] = []
    required = {
        "client_name": "client name",
        "client_role": "client role",
        "requested_relief": "requested relief",
        "opposing_parties": "opposing parties",
        "documents": "document references",
    }
    for key, label in required.items():
        if not context_payload.get(key):
            missing.append(label)
    if not context_payload.get("deadlines"):
        missing.append("deadline confirmation")
    if not conflicts.get("checked") and not conflicts.get("status"):
        missing.append("conflict-check status")
    if not scope.get("confirmed") and not scope.get("scope_of_work"):
        missing.append("scope confirmation")
    for item in _as_list(context_payload.get("missing_information")):
        text = _truthy_text(item)
        if text and text not in missing:
            missing.append(text)
    return missing


def _conflict_check(client: dict[str, Any], conflicts: dict[str, Any], opposing_parties: list[str]) -> dict[str, Any]:
    related_parties = [str(value) for value in _flatten_list([conflicts.get("related_parties"), conflicts.get("affiliates")]) if _truthy_text(value)]
    status = str(conflicts.get("status") or ("ready_for_review" if opposing_parties else "incomplete"))
    warnings: list[str] = []
    if not client.get("client_name") and not client.get("name"):
        warnings.append("client_identity_incomplete")
    if not opposing_parties:
        warnings.append("opposing_parties_missing")
    if conflicts.get("potential_conflict"):
        warnings.append("potential_conflict_reported")
    return {
        "status": status,
        "checked": bool(conflicts.get("checked")),
        "human_review_required": True,
        "opposing_parties": opposing_parties,
        "related_parties": related_parties,
        "warnings": warnings,
        "notes": conflicts.get("notes") or conflicts.get("conflict_notes"),
    }


def _scope_confirmation(scope: dict[str, Any], requested_relief: str | None) -> dict[str, Any]:
    scope_of_work = scope.get("scope_of_work") or scope.get("work") or requested_relief
    exclusions = _as_list(scope.get("excluded_work") or scope.get("exclusions"))
    status = "confirmed" if scope.get("confirmed") else "needs_attorney_confirmation"
    if not scope_of_work:
        status = "incomplete"
    return {
        "status": status,
        "scope_of_work": scope_of_work,
        "excluded_work": exclusions,
        "client_responsibilities": _as_list(scope.get("client_responsibilities")),
        "attorney_approval_required": True,
        "notes": scope.get("notes"),
    }


def _summary(updated_context: dict[str, Any], conflict_check: dict[str, Any], scope_confirmation: dict[str, Any]) -> dict[str, Any]:
    missing = updated_context.get("missing_information") or []
    return {
        "version": INTAKE_FLOW_VERSION,
        "matter_id": updated_context.get("matter_id"),
        "matter_name": updated_context.get("name"),
        "client_name": updated_context.get("client_name"),
        "jurisdiction": updated_context.get("jurisdiction"),
        "client_role": updated_context.get("client_role"),
        "requested_relief": updated_context.get("requested_relief"),
        "document_count": len(updated_context.get("documents") or []),
        "deadline_count": len(updated_context.get("deadlines") or []),
        "missing_information_count": len(missing),
        "conflict_status": conflict_check.get("status"),
        "scope_status": scope_confirmation.get("status"),
        "ready_for_attorney_review": bool(updated_context.get("client_name")) and not missing,
        "last_updated": updated_context.get("last_updated"),
    }


def run_full_intake_flow(payload: dict[str, Any]) -> dict[str, Any]:
    client = _as_dict(payload.get("client"))
    matter = _as_dict(payload.get("matter"))
    facts = _as_dict(payload.get("facts"))
    conflicts = _as_dict(payload.get("conflicts"))
    scope = _as_dict(payload.get("scope"))
    consent = _as_dict(payload.get("consent"))

    opposing_parties = [
        str(value)
        for value in _flatten_list([payload.get("opposing_parties"), matter.get("opposing_parties"), conflicts.get("opposing_parties")])
        if _truthy_text(value)
    ]
    documents = _document_references(_flatten_list([payload.get("documents"), matter.get("documents"), facts.get("documents")]))
    deadlines = _deadline_references(_flatten_list([payload.get("deadlines"), matter.get("deadlines"), facts.get("deadlines")]))
    requested_relief = _truthy_text(payload.get("requested_relief") or matter.get("requested_relief") or scope.get("requested_relief"))

    key_facts = {
        **_as_dict(payload.get("key_facts")),
        **_as_dict(facts.get("key_facts")),
    }
    if facts.get("chronology"):
        key_facts["chronology"] = facts.get("chronology")
    if facts.get("summary"):
        key_facts["client_fact_summary"] = facts.get("summary")

    context_payload = {
        "matter_id": payload.get("matter_id") or matter.get("matter_id") or str(uuid4()),
        "client_id": client.get("client_id") or payload.get("client_id") or str(uuid4()),
        "client_name": client.get("client_name") or client.get("name") or payload.get("client_name"),
        "matter_name": matter.get("matter_name") or matter.get("name") or payload.get("matter_name") or payload.get("name"),
        "matter_type": matter.get("matter_type") or payload.get("matter_type"),
        "tier": payload.get("tier") or matter.get("tier") or "free",
        "jurisdiction": matter.get("jurisdiction") or payload.get("jurisdiction") or "District of Columbia",
        "client_role": matter.get("client_role") or payload.get("client_role"),
        "opposing_parties": opposing_parties,
        "deadlines": deadlines,
        "requested_relief": requested_relief,
        "key_facts": key_facts,
        "documents": documents,
        "sensitivity_flags": [
            str(value)
            for value in _flatten_list([payload.get("sensitivity_flags"), consent.get("sensitivity_flags")])
            if _truthy_text(value)
        ],
        "history": [
            {
                "event": "full_client_intake_received",
                "timestamp": datetime.now(UTC).isoformat(),
                "source": payload.get("surface_context") or "full_intake",
                "steps": sorted(key for key in ("client", "matter", "facts", "conflicts", "scope", "consent") if payload.get(key)),
            }
        ],
        "source": payload.get("surface_context") or "full_intake",
    }

    conflict_check = _conflict_check(client, conflicts, opposing_parties)
    scope_confirmation = _scope_confirmation(scope, requested_relief)
    context_payload["missing_information"] = _missing_information(context_payload, conflicts, scope)

    updated_context = update_matter_context(context_payload)
    prompt_library = build_intake_prompt_library(updated_context)
    intake_summary = _summary(updated_context, conflict_check, scope_confirmation)
    next_steps = [
        "Attorney reviews conflict-check status before representation is confirmed.",
        "Confirm engagement scope and exclusions in writing before substantive legal advice.",
    ]
    if updated_context.get("missing_information"):
        next_steps.insert(0, "Collect missing intake fields: " + ", ".join(updated_context["missing_information"]))

    trace_event(
        name="full_client_intake_flow",
        surface_context=str(payload.get("surface_context") or "full_intake"),
        category="matter_context",
        matter_reference=updated_context.get("matter_id"),
        metadata={
            "matter_id": updated_context.get("matter_id"),
            "conflict_status": conflict_check["status"],
            "scope_status": scope_confirmation["status"],
            "missing_information_count": len(updated_context.get("missing_information") or []),
        },
    )

    return {
        "intake_flow_version": INTAKE_FLOW_VERSION,
        "matter_context": updated_context,
        "matter_id": updated_context["matter_id"],
        "intake_summary": intake_summary,
        "conflict_check": conflict_check,
        "scope_confirmation": scope_confirmation,
        "prompt_library": prompt_library,
        "next_steps": next_steps,
        "human_review_required": True,
        "updated": True,
    }


__all__ = ["INTAKE_FLOW_VERSION", "run_full_intake_flow"]

