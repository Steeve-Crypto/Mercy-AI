from __future__ import annotations

import os
from collections import Counter
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from observability import TRACE_STORE, trace_event


BETA_VERSION = "mercy-limited-beta-1.0"
DEFAULT_STRONG_MONTHLY_QUOTA = 300


@dataclass
class BetaUserState:
    tenant_id: str
    user_id: str
    email: str | None = None
    status: str = "active"
    invite_code: str | None = None
    waitlist_joined_at: str | None = None
    activated_at: str | None = field(default_factory=lambda: datetime.now(UTC).isoformat())
    strong_messages_used: int = 0
    fast_messages_used: int = 0
    estimated_cost_usd: float = 0.0
    template_usage: Counter[str] = field(default_factory=Counter)
    guardrail_triggers: Counter[str] = field(default_factory=Counter)
    feedback_count: int = 0

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "tenant_id": self.tenant_id,
            "user_id": self.user_id,
            "email": self.email,
            "status": self.status,
            "activated_at": self.activated_at,
            "waitlist_joined_at": self.waitlist_joined_at,
            "quota": quota_status(self),
        }


@dataclass
class FeedbackRecord:
    feedback_id: str
    tenant_id: str
    user_id: str
    rating: str
    comment: str | None
    action: str
    trace_id: str | None
    route_expert: str | None
    guardrail_status: str | None
    template_id: str | None
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())


WAITLIST: dict[str, BetaUserState] = {}
ACTIVE_USERS: dict[str, BetaUserState] = {}
INVITES: dict[str, dict[str, Any]] = {}
FEEDBACK: list[FeedbackRecord] = []


def beta_mode_enabled() -> bool:
    return str(os.getenv("MERCY_BETA_MODE") or "true").lower() in {"1", "true", "yes", "on"}


def invite_only_enabled() -> bool:
    return str(os.getenv("MERCY_BETA_INVITE_ONLY") or "true").lower() in {"1", "true", "yes", "on"}


def strong_monthly_quota() -> int:
    try:
        return max(1, int(os.getenv("MERCY_BETA_STRONG_MONTHLY_QUOTA") or DEFAULT_STRONG_MONTHLY_QUOTA))
    except ValueError:
        return DEFAULT_STRONG_MONTHLY_QUOTA


def _key(tenant_context: dict[str, Any]) -> str:
    return f"{tenant_context.get('tenant_id') or 'unknown'}:{tenant_context.get('user_id') or 'unknown'}"


def _local_auto_active() -> bool:
    return os.getenv("MERCY_ENV") == "local" or os.getenv("MERCY_AUTH_MODE") == "dev"


def current_beta_user(tenant_context: dict[str, Any]) -> BetaUserState:
    key = _key(tenant_context)
    if key in ACTIVE_USERS:
        return ACTIVE_USERS[key]
    state = BetaUserState(
        tenant_id=str(tenant_context.get("tenant_id") or "unknown"),
        user_id=str(tenant_context.get("user_id") or "unknown"),
        status="active" if _local_auto_active() else "waitlisted",
        activated_at=datetime.now(UTC).isoformat() if _local_auto_active() else None,
    )
    if _local_auto_active():
        ACTIVE_USERS[key] = state
    else:
        WAITLIST.setdefault(key, state)
    return state


def beta_status(tenant_context: dict[str, Any]) -> dict[str, Any]:
    state = current_beta_user(tenant_context)
    active = state.status == "active" or not invite_only_enabled()
    return {
        "version": BETA_VERSION,
        "beta_mode": beta_mode_enabled(),
        "invite_only": invite_only_enabled(),
        "access": "active" if active else "waitlist",
        "user": state.to_public_dict(),
        "quota": quota_status(state),
        "legal_docs": {
            "dpa": "/v1/beta/legal/dpa",
            "terms": "/v1/beta/legal/terms",
        },
        "welcome_sequence": beta_welcome_sequence(),
        "ethics_note": (
            "Mercy beta output is AI-assisted work product for D.C. attorneys. Counsel remains responsible for "
            "competence, confidentiality, supervision, citation verification, client communication, and final judgment."
        ),
    }


def quota_status(state: BetaUserState) -> dict[str, Any]:
    quota = strong_monthly_quota()
    remaining = max(0, quota - state.strong_messages_used)
    return {
        "strong_model_monthly_limit": quota,
        "strong_model_used": state.strong_messages_used,
        "strong_model_remaining": remaining,
        "fast_model_limit": "unlimited",
        "fast_model_used": state.fast_messages_used,
        "period": datetime.now(UTC).strftime("%Y-%m"),
        "gentle_rate_limit": "Strong-model legal drafting and research are capped during limited beta; fast routing and metadata actions remain available.",
    }


def join_waitlist(tenant_context: dict[str, Any], email: str, practice_area: str | None = None) -> dict[str, Any]:
    state = BetaUserState(
        tenant_id=str(tenant_context.get("tenant_id") or "unknown"),
        user_id=str(tenant_context.get("user_id") or "unknown"),
        email=email,
        status="waitlisted",
        waitlist_joined_at=datetime.now(UTC).isoformat(),
        activated_at=None,
    )
    WAITLIST[_key(tenant_context)] = state
    trace_event(
        name="beta_waitlist_joined",
        surface_context="beta_launch",
        category="beta",
        metadata={"tenant_id": state.tenant_id, "user_id": state.user_id, "practice_area": practice_area},
    )
    return {"status": "waitlisted", "user": state.to_public_dict(), "welcome_sequence": beta_welcome_sequence()}


def create_invite(email: str, tenant_context: dict[str, Any], invited_by: str | None = None) -> dict[str, Any]:
    code = f"MERCY-{uuid4().hex[:10].upper()}"
    INVITES[code] = {
        "email": email,
        "tenant_id": tenant_context.get("tenant_id"),
        "created_by": invited_by or tenant_context.get("user_id"),
        "created_at": datetime.now(UTC).isoformat(),
        "accepted_at": None,
    }
    trace_event(name="beta_invite_created", surface_context="beta_launch", category="beta", metadata={"email": email, "tenant_id": tenant_context.get("tenant_id")})
    return {"invite_code": code, "email": email, "status": "created"}


def accept_invite(tenant_context: dict[str, Any], invite_code: str, email: str | None = None) -> dict[str, Any]:
    invite = INVITES.get(invite_code)
    if not invite:
        return {"status": "invalid", "message": "Invite code was not found or has expired."}
    invite["accepted_at"] = datetime.now(UTC).isoformat()
    state = BetaUserState(
        tenant_id=str(tenant_context.get("tenant_id") or invite.get("tenant_id") or "unknown"),
        user_id=str(tenant_context.get("user_id") or "unknown"),
        email=email or str(invite.get("email") or ""),
        status="active",
        invite_code=invite_code,
    )
    ACTIVE_USERS[_key(tenant_context)] = state
    WAITLIST.pop(_key(tenant_context), None)
    trace_event(name="beta_invite_accepted", surface_context="beta_launch", category="beta", metadata={"tenant_id": state.tenant_id, "user_id": state.user_id})
    return {"status": "active", "user": state.to_public_dict(), "welcome_sequence": beta_welcome_sequence()}


def enforce_beta_access(tenant_context: dict[str, Any]) -> None:
    if not beta_mode_enabled() or not invite_only_enabled() or _local_auto_active():
        return
    state = current_beta_user(tenant_context)
    if state.status != "active":
        raise PermissionError("Limited beta access requires an accepted invite.")


def check_quota(tenant_context: dict[str, Any], model_tier: str) -> dict[str, Any]:
    enforce_beta_access(tenant_context)
    state = current_beta_user(tenant_context)
    if model_tier != "strong":
        return quota_status(state)
    if state.strong_messages_used >= strong_monthly_quota():
        raise RuntimeError("Strong-model beta quota reached for this month. Fast model actions remain available.")
    return quota_status(state)


def record_usage(
    tenant_context: dict[str, Any],
    *,
    model_tier: str,
    estimated_cost_usd: float = 0.0,
    template_id: str | None = None,
    guardrail_status: str | None = None,
) -> dict[str, Any]:
    state = current_beta_user(tenant_context)
    if model_tier == "strong":
        state.strong_messages_used += 1
    else:
        state.fast_messages_used += 1
    state.estimated_cost_usd = round(state.estimated_cost_usd + max(0.0, estimated_cost_usd), 6)
    if template_id:
        state.template_usage[template_id] += 1
    if guardrail_status in {"warn", "block"}:
        state.guardrail_triggers[str(guardrail_status)] += 1
    trace_event(
        name="beta_usage_recorded",
        surface_context="beta_launch",
        category="beta",
        guardrail_status=guardrail_status,
        metadata={
            "tenant_id": state.tenant_id,
            "user_id": state.user_id,
            "model_tier": model_tier,
            "template_id": template_id,
            "estimated_cost_usd": estimated_cost_usd,
        },
    )
    return quota_status(state)


def record_feedback(tenant_context: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    rating = str(payload.get("rating") or "").lower()
    if rating not in {"up", "down"}:
        raise ValueError("Feedback rating must be 'up' or 'down'.")
    state = current_beta_user(tenant_context)
    record = FeedbackRecord(
        feedback_id=str(uuid4()),
        tenant_id=state.tenant_id,
        user_id=state.user_id,
        rating=rating,
        comment=str(payload.get("comment") or "")[:500] or None,
        action=str(payload.get("action") or "major_action"),
        trace_id=str(payload.get("trace_id") or "") or None,
        route_expert=str(payload.get("route_expert") or "") or None,
        guardrail_status=str(payload.get("guardrail_status") or "") or None,
        template_id=str(payload.get("template_id") or "") or None,
    )
    FEEDBACK.append(record)
    state.feedback_count += 1
    trace_event(
        name="beta_feedback_submitted",
        surface_context="beta_feedback",
        category="feedback",
        guardrail_status=record.guardrail_status,
        metadata={**asdict(record), "comment": bool(record.comment)},
    )
    return {"status": "received", "feedback_id": record.feedback_id, "thanks": "Thank you. Feedback is used to improve Mercy's beta reliability and D.C. grounding."}


def beta_analytics(limit: int = 100) -> dict[str, Any]:
    records = TRACE_STORE.list(limit=limit)
    active_users = [state for state in ACTIVE_USERS.values() if state.status == "active"]
    template_usage: Counter[str] = Counter()
    guardrail_triggers: Counter[str] = Counter()
    estimated_cost = 0.0
    for state in active_users:
        template_usage.update(state.template_usage)
        guardrail_triggers.update(state.guardrail_triggers)
        estimated_cost += state.estimated_cost_usd
    for record in records:
        metadata = record.get("metadata") if isinstance(record.get("metadata"), dict) else {}
        if metadata.get("template_id"):
            template_usage[str(metadata["template_id"])] += 1
        if record.get("guardrail_status") in {"warn", "block"}:
            guardrail_triggers[str(record["guardrail_status"])] += 1
        if metadata.get("estimated_cost_usd") is not None:
            try:
                estimated_cost += float(metadata["estimated_cost_usd"])
            except (TypeError, ValueError):
                pass
    ragas_traces = [record for record in records if record.get("category") in {"rag_eval", "rag"}]
    return {
        "version": BETA_VERSION,
        "active_users": len(active_users),
        "waitlist_count": len(WAITLIST),
        "invite_count": len(INVITES),
        "feedback": {
            "count": len(FEEDBACK),
            "thumbs_up": len([item for item in FEEDBACK if item.rating == "up"]),
            "thumbs_down": len([item for item in FEEDBACK if item.rating == "down"]),
        },
        "template_usage": template_usage.most_common(20),
        "guardrail_triggers": dict(guardrail_triggers),
        "ragas_trends": {
            "trace_count": len(ragas_traces),
            "recent_statuses": [record.get("guardrail_status") or record.get("status") for record in ragas_traces[-10:]],
        },
        "estimated_cost_usd": round(estimated_cost, 6),
        "quota": {
            "strong_model_monthly_limit": strong_monthly_quota(),
            "total_strong_used": sum(state.strong_messages_used for state in active_users),
            "fast_model_limit": "unlimited",
        },
        "generated_at": datetime.now(UTC).isoformat(),
    }


def beta_welcome_sequence() -> list[dict[str, str]]:
    return [
        {
            "subject": "Welcome to the Mercy D.C. attorney beta",
            "body": "Start with one D.C. matter, run intake, then generate from the template gallery. Every output requires attorney review.",
        },
        {
            "subject": "Quick start: first D.C. matter",
            "body": "Create a matter, choose a template, verify official D.C. citations, and keep the reliability panel open while reviewing.",
        },
        {
            "subject": "Ethics note for AI-assisted work",
            "body": "Counsel remains responsible for competence, confidentiality, supervision, citation verification, client communication, and final judgment under the D.C. Rules of Professional Conduct.",
        },
    ]


def legal_document(kind: str) -> str:
    if kind == "dpa":
        title = "Mercy AI Limited Beta Data Processing Addendum"
        body = [
            "This Data Processing Addendum is provided for limited beta evaluation by D.C. solo and small-firm attorneys.",
            "Mercy processes beta account, matter metadata, prompts, citations, feedback, and usage telemetry only to provide, secure, support, and improve the beta service.",
            "Client data is not used for model training by Mercy. Attorneys must avoid submitting unnecessary confidential or privileged material and must follow firm confidentiality obligations.",
            "Mercy maintains tenant-scoped access controls, local/dev safeguards, redacted observability, and beta usage tracing. Production retention, deletion, export, encryption, and audit terms must be finalized before general availability.",
            "Subprocessors may include configured LLM providers, hosting/database providers, and LangSmith-compatible observability providers when enabled by the beta environment.",
            "D.C. attorney responsibility: counsel remains responsible for supervision, competence, confidentiality, citation verification, and client communication under the D.C. Rules of Professional Conduct.",
        ]
    else:
        title = "Mercy AI Limited Beta Terms of Service"
        body = [
            "Mercy is an invite-only beta legal AI tool for D.C. solo and small-firm attorneys. The beta is provided for evaluation and attorney-supervised drafting, research, and workflow support.",
            "Mercy does not provide legal advice, does not create an attorney-client relationship with any client, and does not replace attorney judgment.",
            "All AI-assisted drafting, research, citations, source summaries, and templates must be reviewed and verified by a licensed attorney before use, filing, sending, or billing.",
            "D.C. Rules of Professional Conduct reminders: attorneys must maintain competence, confidentiality, supervision, conflict checks, candor, reasonable fees, and communication with clients.",
            "Beta quotas: strong-model drafting/research is limited to 300 messages per month by default; fast routing, metadata, and lightweight actions are not metered under this beta policy.",
            "Feedback submitted in the beta may be used to improve Mercy reliability, guardrails, D.C. source grounding, and user experience. Do not include unnecessary confidential client facts in feedback comments.",
            "The beta may change, pause, or terminate while Mercy hardens security, persistence, legal-source coverage, and production operations.",
        ]
    return f"# {title}\n\n" + "\n\n".join(f"{index + 1}. {item}" for index, item in enumerate(body)) + "\n"


__all__ = [
    "BETA_VERSION",
    "accept_invite",
    "beta_analytics",
    "beta_status",
    "check_quota",
    "create_invite",
    "join_waitlist",
    "legal_document",
    "record_feedback",
    "record_usage",
]
