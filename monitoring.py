from __future__ import annotations

import json
import os
import urllib.request
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from beta_launch import ACTIVE_USERS, quota_status, strong_monthly_quota
from evals.regression_status import latest_regression_health
from finetune.status import fine_tuning_readiness_status
from observability import TRACE_STORE, langsmith_project_config, trace_event
from security_controls import redact_pii, sanitize_payload


MONITORING_VERSION = "mercy-monitoring-ops-1.0"
MAX_COST_EVENTS = 2000


@dataclass
class CostEvent:
    event_id: str
    tenant_id: str
    user_id_hash: str
    provider: str | None
    model: str | None
    task_type: str
    model_tier: str
    estimated_cost_usd: float
    prompt_tokens: int
    completion_tokens: int
    route_expert: str | None = None
    surface_context: str = "llm_provider"
    trace_id: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


COST_EVENTS: list[CostEvent] = []


def _hash_user(user_id: str | None) -> str:
    import hashlib

    return hashlib.sha256(str(user_id or "unknown").encode("utf-8")).hexdigest()[:16]


def _parse_iso(value: str | None) -> datetime:
    if not value:
        return datetime.now(UTC)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except ValueError:
        return datetime.now(UTC)


def _cutoff(days: int) -> datetime:
    return datetime.now(UTC) - timedelta(days=max(1, days))


def _within_days(value: str | None, days: int) -> bool:
    return _parse_iso(value) >= _cutoff(days)


def _auth_ids(tenant_context: dict[str, Any] | None) -> tuple[str, str]:
    context = tenant_context or {}
    return str(context.get("tenant_id") or "unknown"), str(context.get("user_id") or "unknown")


def record_cost_event(
    *,
    tenant_context: dict[str, Any] | None,
    provider: str | None,
    model: str | None,
    task_type: str,
    estimated_cost_usd: float | None,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
    route_expert: str | None = None,
    surface_context: str = "llm_provider",
    trace_id: str | None = None,
) -> dict[str, Any]:
    tenant_id, user_id = _auth_ids(tenant_context)
    model_tier = "strong" if task_type in {"legal_drafting", "agent_execution", "research_generation", "complex_research"} else "fast"
    event = CostEvent(
        event_id=str(uuid4()),
        tenant_id=tenant_id,
        user_id_hash=_hash_user(user_id),
        provider=provider,
        model=model,
        task_type=task_type,
        model_tier=model_tier,
        estimated_cost_usd=round(max(0.0, float(estimated_cost_usd or 0.0)), 8),
        prompt_tokens=int(prompt_tokens or 0),
        completion_tokens=int(completion_tokens or 0),
        route_expert=route_expert,
        surface_context=surface_context,
        trace_id=trace_id,
    )
    COST_EVENTS.append(event)
    del COST_EVENTS[:-MAX_COST_EVENTS]
    trace_event(
        name="monitoring_cost_event",
        surface_context="monitoring",
        category="cost",
        metadata=event.to_dict(),
    )
    return event.to_dict()


def tenant_cost_usd(tenant_id: str, *, days: int = 1) -> float:
    return round(
        sum(event.estimated_cost_usd for event in COST_EVENTS if event.tenant_id == tenant_id and _within_days(event.created_at, days)),
        6,
    )


def cost_policy_for_context(tenant_context: dict[str, Any] | None, *, days: int = 1) -> dict[str, Any]:
    tenant_id, _ = _auth_ids(tenant_context)
    cap_raw = os.getenv("MERCY_DAILY_TENANT_COST_CAP_USD") or os.getenv("MERCY_MONITORING_TENANT_DAILY_COST_CAP_USD") or "0"
    try:
        cap = max(0.0, float(cap_raw))
    except ValueError:
        cap = 0.0
    spent = tenant_cost_usd(tenant_id, days=days)
    capped = bool(cap and spent >= cap)
    return {
        "enabled": bool(cap),
        "tenant_id": tenant_id,
        "window_days": days,
        "spent_usd": spent,
        "cap_usd": cap,
        "expensive_calls_allowed": not capped,
        "action": "cap_to_fast_or_template" if capped else "allow",
    }


def monitoring_metrics(days: int = 7) -> dict[str, Any]:
    records = [record for record in TRACE_STORE.list(limit=500) if _within_days(str(record.get("started_at")), days)]
    cost_events = [event for event in COST_EVENTS if _within_days(event.created_at, days)]
    active_users = [state for state in ACTIVE_USERS.values() if state.status == "active"]
    tenant_ids = {state.tenant_id for state in active_users} | {event.tenant_id for event in cost_events}
    guardrails = Counter(str(record.get("guardrail_status")) for record in records if record.get("guardrail_status") in {"warn", "block"})
    errors = [record for record in records if record.get("status") == "error"]
    rag_records = [record for record in records if record.get("category") in {"rag", "rag_eval"}]
    llm_records = [record for record in records if record.get("category") == "llm"]
    templates = _template_usage_from_beta_and_traces(records)
    regression_health = latest_regression_health()
    fine_tuning = fine_tuning_readiness_status()
    return {
        "version": MONITORING_VERSION,
        "window_days": days,
        "generated_at": datetime.now(UTC).isoformat(),
        "langsmith": langsmith_project_config().to_dict(),
        "active_beta_users": len(active_users),
        "tenant_count": len(tenant_ids),
        "usage": {
            "messages": len([record for record in records if record.get("category") in {"agent", "drafting", "llm"}]),
            "llm_calls": len(llm_records),
            "prompt_tokens": sum(event.prompt_tokens for event in cost_events),
            "completion_tokens": sum(event.completion_tokens for event in cost_events),
            "templates": templates.most_common(20),
            "daily": _bucket_usage(records, cost_events, "day"),
            "weekly": _bucket_usage(records, cost_events, "week"),
        },
        "cost": {
            "estimated_total_usd": round(sum(event.estimated_cost_usd for event in cost_events), 6),
            "event_count": len(cost_events),
        },
        "ragas_trends": {
            "trace_count": len(rag_records),
            "recent_statuses": [record.get("guardrail_status") or record.get("status") for record in rag_records[-20:]],
            "latest_regression": regression_health,
        },
        "regression_health": regression_health,
        "fine_tuning_readiness": fine_tuning,
        "grounding_health": _grounding_health(rag_records),
        "guardrail_triggers": dict(guardrails),
        "error_rates": {
            "trace_count": len(records),
            "error_count": len(errors),
            "error_rate": round(len(errors) / len(records), 4) if records else 0.0,
        },
        "quota": _quota_summary(active_users),
    }


def cost_breakdown(days: int = 7) -> dict[str, Any]:
    events = [event for event in COST_EVENTS if _within_days(event.created_at, days)]
    by_tenant: dict[str, float] = defaultdict(float)
    by_user: dict[str, float] = defaultdict(float)
    by_model: dict[str, float] = defaultdict(float)
    by_provider: dict[str, float] = defaultdict(float)
    for event in events:
        by_tenant[event.tenant_id] += event.estimated_cost_usd
        by_user[f"{event.tenant_id}:{event.user_id_hash}"] += event.estimated_cost_usd
        by_model[event.model or "fallback_template"] += event.estimated_cost_usd
        by_provider[event.provider or "fallback_template"] += event.estimated_cost_usd
    return {
        "version": MONITORING_VERSION,
        "window_days": days,
        "generated_at": datetime.now(UTC).isoformat(),
        "total_estimated_cost_usd": round(sum(event.estimated_cost_usd for event in events), 6),
        "by_tenant": _rounded_counter(by_tenant),
        "by_user": _rounded_counter(by_user),
        "by_model": _rounded_counter(by_model),
        "by_provider": _rounded_counter(by_provider),
        "recent_events": [event.to_dict() for event in events[-25:]],
    }


def monitoring_dashboard(days: int = 7, *, send_alerts: bool = False) -> dict[str, Any]:
    metrics = monitoring_metrics(days=days)
    breakdown = cost_breakdown(days=days)
    alerts = evaluate_alerts(metrics, breakdown)
    notifications = dispatch_alerts(alerts, dry_run=not send_alerts)
    return {
        "version": MONITORING_VERSION,
        "dashboard": "Mercy Production Monitoring",
        "metrics": metrics,
        "cost_breakdown": breakdown,
        "alerts": alerts,
        "notifications": notifications,
        "data_minimization": "No raw prompts, selected text, document text, emails, or client PII are included.",
    }


def evaluate_alerts(metrics: dict[str, Any], breakdown: dict[str, Any]) -> list[dict[str, Any]]:
    alerts: list[dict[str, Any]] = []
    cost_threshold = _float_env("MERCY_ALERT_COST_SPIKE_USD", 25.0)
    guardrail_threshold = int(_float_env("MERCY_ALERT_GUARDRAIL_FAILURES", 10.0))
    error_threshold = _float_env("MERCY_ALERT_ERROR_RATE", 0.1)
    total_cost = float(breakdown.get("total_estimated_cost_usd") or 0.0)
    if total_cost >= cost_threshold:
        alerts.append(_alert("cost_spike", "warning", f"Estimated cost ${total_cost:.4f} exceeded ${cost_threshold:.2f}.", {"total_cost_usd": total_cost}))
    quota = metrics.get("quota") if isinstance(metrics.get("quota"), dict) else {}
    for item in quota.get("near_limit_users", []) if isinstance(quota.get("near_limit_users"), list) else []:
        alerts.append(_alert("quota_near_limit", "warning", "A beta user is near or over strong-model quota.", item))
    guardrails = metrics.get("guardrail_triggers") if isinstance(metrics.get("guardrail_triggers"), dict) else {}
    guardrail_count = int(guardrails.get("block") or 0) + int(guardrails.get("warn") or 0)
    if guardrail_count >= guardrail_threshold:
        alerts.append(_alert("repeated_guardrail_failures", "warning", "Guardrail warnings/blocks exceeded threshold.", {"count": guardrail_count}))
    error_rates = metrics.get("error_rates") if isinstance(metrics.get("error_rates"), dict) else {}
    if float(error_rates.get("error_rate") or 0.0) >= error_threshold:
        alerts.append(_alert("critical_error_rate", "critical", "Trace error rate exceeded threshold.", error_rates))
    return alerts


def dispatch_alerts(alerts: list[dict[str, Any]], *, dry_run: bool = True) -> list[dict[str, Any]]:
    if not alerts:
        return []
    actions: list[dict[str, Any]] = []
    safe_alerts = redact_pii(alerts)
    slack_url = os.getenv("MERCY_ALERT_SLACK_WEBHOOK")
    email_to = os.getenv("MERCY_ALERT_EMAIL_TO")
    if slack_url:
        actions.append(_post_slack(slack_url, safe_alerts, dry_run=dry_run))
    if email_to:
        actions.append({"channel": "email", "to": email_to, "dry_run": dry_run, "status": "configured", "alert_count": len(alerts)})
    if not actions:
        actions.append({"channel": "none", "dry_run": True, "status": "no_alert_channel_configured", "alert_count": len(alerts)})
    trace_event(name="monitoring_alerts_evaluated", surface_context="monitoring", category="monitoring", metadata={"alert_count": len(alerts), "actions": actions})
    return actions


def _post_slack(url: str, alerts: Any, *, dry_run: bool) -> dict[str, Any]:
    if dry_run:
        return {"channel": "slack", "dry_run": True, "status": "not_sent", "alert_count": len(alerts)}
    try:
        body = json.dumps({"text": "Mercy monitoring alert", "alerts": alerts}).encode("utf-8")
        request = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(request, timeout=5) as response:  # noqa: S310 - explicitly configured webhook URL.
            status_code = response.getcode()
        return {"channel": "slack", "dry_run": False, "status": "sent", "status_code": status_code, "alert_count": len(alerts)}
    except Exception as exc:
        return {"channel": "slack", "dry_run": False, "status": "failed", "error": exc.__class__.__name__, "alert_count": len(alerts)}


def _template_usage_from_beta_and_traces(records: list[dict[str, Any]]) -> Counter[str]:
    counter: Counter[str] = Counter()
    for state in ACTIVE_USERS.values():
        counter.update(state.template_usage)
    for record in records:
        metadata = record.get("metadata") if isinstance(record.get("metadata"), dict) else {}
        template_id = metadata.get("template_id")
        if template_id:
            counter[str(template_id)] += 1
    return counter


def _bucket_usage(records: list[dict[str, Any]], events: list[CostEvent], bucket: str) -> list[dict[str, Any]]:
    counts: dict[str, dict[str, Any]] = defaultdict(lambda: {"messages": 0, "tokens": 0, "cost_usd": 0.0})
    for record in records:
        key = _bucket_key(str(record.get("started_at")), bucket)
        if record.get("category") in {"agent", "drafting", "llm"}:
            counts[key]["messages"] += 1
    for event in events:
        key = _bucket_key(event.created_at, bucket)
        counts[key]["tokens"] += event.prompt_tokens + event.completion_tokens
        counts[key]["cost_usd"] += event.estimated_cost_usd
    return [{"period": key, **{k: round(v, 6) if isinstance(v, float) else v for k, v in value.items()}} for key, value in sorted(counts.items())]


def _bucket_key(value: str, bucket: str) -> str:
    dt = _parse_iso(value)
    if bucket == "week":
        year, week, _ = dt.isocalendar()
        return f"{year}-W{week:02d}"
    return dt.date().isoformat()


def _grounding_health(records: list[dict[str, Any]]) -> dict[str, Any]:
    statuses = Counter()
    for record in records:
        rag = record.get("rag") if isinstance(record.get("rag"), dict) else {}
        status = rag.get("verification_status") or record.get("guardrail_status") or record.get("status")
        statuses[str(status or "unknown")] += 1
    total = sum(statuses.values())
    healthy = statuses.get("pass", 0) + statuses.get("ok", 0)
    return {"total": total, "healthy": healthy, "health_rate": round(healthy / total, 4) if total else 1.0, "statuses": dict(statuses)}


def _quota_summary(active_users: list[Any]) -> dict[str, Any]:
    near_limit: list[dict[str, Any]] = []
    limit = strong_monthly_quota()
    for state in active_users:
        status = quota_status(state)
        used = int(status["strong_model_used"])
        remaining = int(status["strong_model_remaining"])
        if remaining <= max(5, int(limit * 0.1)):
            near_limit.append(
                {
                    "tenant_id": state.tenant_id,
                    "user_id_hash": _hash_user(state.user_id),
                    "strong_model_used": used,
                    "strong_model_remaining": remaining,
                    "limit": limit,
                }
            )
    return {
        "strong_model_monthly_limit": limit,
        "total_strong_used": sum(state.strong_messages_used for state in active_users),
        "total_fast_used": sum(state.fast_messages_used for state in active_users),
        "near_limit_users": near_limit,
    }


def _rounded_counter(values: dict[str, float]) -> list[dict[str, Any]]:
    return [{"key": key, "estimated_cost_usd": round(value, 6)} for key, value in sorted(values.items(), key=lambda item: item[1], reverse=True)]


def _float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name) or default)
    except ValueError:
        return default


def _alert(kind: str, severity: str, message: str, metadata: dict[str, Any]) -> dict[str, Any]:
    return sanitize_payload(
        {
            "alert_id": str(uuid4()),
            "kind": kind,
            "severity": severity,
            "message": message,
            "metadata": metadata,
            "created_at": datetime.now(UTC).isoformat(),
        },
        max_text_length=4000,
    )


def monitoring_status(days: int = 7) -> dict[str, Any]:
    return {
        "metrics": monitoring_metrics(days=days),
        "cost_breakdown": cost_breakdown(days=days),
        "alerts": evaluate_alerts(monitoring_metrics(days=days), cost_breakdown(days=days)),
    }
