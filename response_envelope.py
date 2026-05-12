from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any


ENVELOPE_VERSION = "response-envelope-1.0"


@dataclass
class CitationProvenance:
    label: str
    source_type: str
    verification_status: str
    note: str
    provenance: dict[str, Any] = field(default_factory=dict)


@dataclass
class MatterContextSnapshot:
    reference: str | None
    hash: str
    storage_mode: str = "local_nonpersistent_by_default"


@dataclass
class ResponseEnvelope:
    envelope_version: str
    route: dict[str, Any]
    expert: str
    confidence_score: float
    guardrail_status: str
    citations: list[dict[str, Any]]
    dc_ethics_metadata: dict[str, Any]
    matter_context_snapshot: dict[str, Any]
    audit_timestamp: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def normalize_guardrail_status(status: str | None, execute: bool = True) -> str:
    if not execute:
        return "block"
    if status == "pass":
        return "pass"
    if status in {"block", "blocked"}:
        return "block"
    return "warn"


def matter_context_snapshot(matter_context: dict[str, Any] | None) -> dict[str, Any]:
    context = matter_context or {}
    reference = context.get("matter_id")
    scrubbed = {
        key: value
        for key, value in context.items()
        if key
        not in {
            "document_text",
            "selected_text",
            "facts",
            "drafts",
            "billing_events",
            "route_history",
        }
    }
    digest_source = json.dumps(scrubbed, sort_keys=True, default=str, ensure_ascii=True)
    snapshot = MatterContextSnapshot(
        reference=str(reference) if reference else None,
        hash=hashlib.sha256(digest_source.encode("utf-8")).hexdigest()[:16],
    )
    return asdict(snapshot)


def citation_provenance(citations: list[dict[str, Any]] | None, source: str) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for citation in citations or []:
        if not isinstance(citation, dict):
            continue
        item = CitationProvenance(
            label=str(citation.get("label") or citation.get("citation") or "[VERIFY CITE]"),
            source_type=str(citation.get("source_type") or "placeholder"),
            verification_status=str(citation.get("verification_status") or "missing_required"),
            note=str(citation.get("note") or "Attorney verification required."),
            provenance={
                **(citation.get("provenance") if isinstance(citation.get("provenance"), dict) else {}),
                "source": source,
            },
        )
        normalized.append(asdict(item))
    if normalized:
        return normalized
    return [
        asdict(
            CitationProvenance(
                label="[VERIFY CITE]",
                source_type="placeholder",
                verification_status="missing_required",
                note="No verified authority supplied; attorney must verify source support.",
                provenance={"source": source},
            )
        )
    ]


def dc_ethics_metadata(route: dict[str, Any], guardrail_status: str) -> dict[str, Any]:
    guardrails = route.get("guardrail_profile") if isinstance(route.get("guardrail_profile"), dict) else {}
    return {
        "human_review_required": True,
        "confidentiality_required": True,
        "citation_verification_required": True,
        "record_verification_required": True,
        "fee_reasonableness_required": route.get("route_mode") == "billing_report",
        "dc_bar_ethics_opinion": "388",
        "guardrail_status": guardrail_status,
        "review_flags": guardrails.get("review_flags", []),
        "data_posture": "local_nonpersistent_by_default",
        "training_use": "client data is not used for model training by Mercy",
    }


def build_response_envelope(
    route: dict[str, Any],
    matter_context: dict[str, Any] | None,
    citations: list[dict[str, Any]] | None = None,
    source: str = "core",
) -> dict[str, Any]:
    execute = bool(route.get("execute", True))
    guardrail_status = normalize_guardrail_status(str(route.get("guardrail_status") or ""), execute=execute)
    all_citations = citation_provenance(citations or route.get("citations"), source=source)
    envelope = ResponseEnvelope(
        envelope_version=ENVELOPE_VERSION,
        route=route,
        expert=str(route.get("expert") or "unknown"),
        confidence_score=float(route.get("confidence") or 0),
        guardrail_status=guardrail_status,
        citations=all_citations,
        dc_ethics_metadata=dc_ethics_metadata(route, guardrail_status),
        matter_context_snapshot=matter_context_snapshot(matter_context),
        audit_timestamp=datetime.now(UTC).isoformat(),
    )
    return envelope.to_dict()


def attach_response_envelope(
    payload: dict[str, Any],
    route: dict[str, Any],
    matter_context: dict[str, Any] | None = None,
    source: str = "core",
) -> dict[str, Any]:
    wrapped = dict(payload)
    citations = citation_provenance(
        [*(wrapped.get("citations") or []), *(route.get("citations") or [])],
        source=source,
    )
    envelope = build_response_envelope(route, matter_context, citations=citations, source=source)
    wrapped["response_envelope"] = envelope
    wrapped["route"] = route
    wrapped["expert"] = envelope["expert"]
    wrapped["confidence_score"] = envelope["confidence_score"]
    wrapped["guardrail_status"] = envelope["guardrail_status"]
    wrapped["citations"] = envelope["citations"]
    wrapped["dc_ethics_metadata"] = envelope["dc_ethics_metadata"]
    wrapped["matter_context_snapshot"] = envelope["matter_context_snapshot"]
    wrapped["audit_timestamp"] = envelope["audit_timestamp"]
    wrapped.setdefault("human_review_required", True)
    return wrapped


__all__ = [
    "ResponseEnvelope",
    "CitationProvenance",
    "MatterContextSnapshot",
    "build_response_envelope",
    "attach_response_envelope",
    "normalize_guardrail_status",
]
