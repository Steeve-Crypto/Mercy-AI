from __future__ import annotations

import os
import time
from collections import deque
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any, Iterator
from uuid import uuid4


OBSERVABILITY_VERSION = "mercy-observability-1.0"
DEFAULT_LANGSMITH_PROJECT = "mercy-legal-core-dev"
TRACE_BUFFER_LIMIT = 500


@dataclass
class LangSmithProjectConfig:
    tracing_enabled: bool
    project_name: str
    endpoint: str
    api_key_configured: bool
    ui_url: str
    environment_variables: dict[str, str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class TraceRecord:
    trace_id: str
    name: str
    surface_context: str
    category: str
    started_at: str
    ended_at: str | None = None
    latency_ms: float | None = None
    status: str = "started"
    route: dict[str, Any] | None = None
    rag: dict[str, Any] | None = None
    guardrail_status: str | None = None
    matter_reference: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ObservabilityStore:
    def __init__(self, limit: int = TRACE_BUFFER_LIMIT) -> None:
        self._records: deque[TraceRecord] = deque(maxlen=limit)

    def add(self, record: TraceRecord) -> None:
        self._records.append(record)

    def list(self, limit: int = 100) -> list[dict[str, Any]]:
        return [record.to_dict() for record in list(self._records)[-limit:]]

    def clear(self) -> None:
        self._records.clear()

    def dashboard(self, limit: int = 100) -> dict[str, Any]:
        records = self.list(limit=limit)
        return {
            "version": OBSERVABILITY_VERSION,
            "langsmith": langsmith_project_config().to_dict(),
            "summary": _summary(records),
            "router_decisions": _router_decisions(records),
            "rag_retrieval_quality": _rag_quality(records),
            "guardrail_violations": _guardrail_violations(records),
            "latency_by_surface": _latency_by_surface(records),
            "recent_traces": records[-25:],
            "dashboard_outline": [
                "Router decisions + confidence by surface",
                "RAG retrieval quality: result count, verification status, top combined scores",
                "Guardrail violations: warn/block counts and review flags",
                "End-to-end latency by surface_context for Standalone Platform, Word Add-in, and core endpoints",
                "LangSmith UI link and environment readiness",
            ],
        }


TRACE_STORE = ObservabilityStore()


def langsmith_project_config() -> LangSmithProjectConfig:
    project_name = os.getenv("LANGSMITH_PROJECT") or os.getenv("LANGCHAIN_PROJECT") or DEFAULT_LANGSMITH_PROJECT
    endpoint = os.getenv("LANGSMITH_ENDPOINT") or os.getenv("LANGCHAIN_ENDPOINT") or "https://api.smith.langchain.com"
    tracing_raw = (
        os.getenv("LANGSMITH_TRACING")
        or os.getenv("LANGCHAIN_TRACING_V2")
        or os.getenv("LANGCHAIN_TRACING")
        or "false"
    )
    tracing_enabled = tracing_raw.lower() in {"1", "true", "yes", "on"}
    api_key_configured = bool(os.getenv("LANGSMITH_API_KEY") or os.getenv("LANGCHAIN_API_KEY"))
    ui_url = f"https://smith.langchain.com/o/default/projects/p/{project_name}"
    return LangSmithProjectConfig(
        tracing_enabled=tracing_enabled,
        project_name=project_name,
        endpoint=endpoint,
        api_key_configured=api_key_configured,
        ui_url=ui_url,
        environment_variables={
            "LANGSMITH_TRACING": "true",
            "LANGSMITH_ENDPOINT": endpoint,
            "LANGSMITH_API_KEY": "<set in local environment>",
            "LANGSMITH_PROJECT": project_name,
        },
    )


def configure_langsmith_environment() -> dict[str, Any]:
    config = langsmith_project_config()
    os.environ.setdefault("LANGSMITH_PROJECT", config.project_name)
    os.environ.setdefault("LANGSMITH_ENDPOINT", config.endpoint)
    os.environ.setdefault("LANGCHAIN_PROJECT", config.project_name)
    os.environ.setdefault("LANGCHAIN_ENDPOINT", config.endpoint)
    if config.tracing_enabled:
        os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")
    return config.to_dict()


def trace_event(
    name: str,
    surface_context: str = "core",
    category: str = "core",
    route: dict[str, Any] | None = None,
    rag: dict[str, Any] | None = None,
    guardrail_status: str | None = None,
    matter_reference: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> TraceRecord:
    started = datetime.now(UTC)
    record = TraceRecord(
        trace_id=str(uuid4()),
        name=name,
        surface_context=surface_context or "core",
        category=category,
        started_at=started.isoformat(),
        ended_at=started.isoformat(),
        latency_ms=0.0,
        status="ok",
        route=_safe_route(route),
        rag=_safe_rag(rag),
        guardrail_status=guardrail_status or _guardrail_from_route(route),
        matter_reference=matter_reference,
        metadata=_redact_metadata(metadata or {}),
    )
    TRACE_STORE.add(record)
    _submit_langsmith_trace(record)
    return record


@contextmanager
def trace_span(
    name: str,
    surface_context: str = "core",
    category: str = "core",
    route: dict[str, Any] | None = None,
    matter_reference: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> Iterator[dict[str, Any]]:
    trace_id = str(uuid4())
    started = datetime.now(UTC)
    perf_start = time.perf_counter()
    state: dict[str, Any] = {"trace_id": trace_id, "route": route, "rag": None, "metadata": metadata or {}}
    try:
        yield state
        status = "ok"
    except Exception:
        status = "error"
        raise
    finally:
        ended = datetime.now(UTC)
        final_route = state.get("route") if isinstance(state.get("route"), dict) else route
        final_rag = state.get("rag") if isinstance(state.get("rag"), dict) else None
        final_metadata = {
            **(metadata or {}),
            **(state.get("metadata") if isinstance(state.get("metadata"), dict) else {}),
        }
        record = TraceRecord(
            trace_id=trace_id,
            name=name,
            surface_context=surface_context or "core",
            category=category,
            started_at=started.isoformat(),
            ended_at=ended.isoformat(),
            latency_ms=round((time.perf_counter() - perf_start) * 1000, 2),
            status=status,
            route=_safe_route(final_route),
            rag=_safe_rag(final_rag),
            guardrail_status=_guardrail_from_route(final_route),
            matter_reference=str(final_metadata.get("matter_id")) if final_metadata.get("matter_id") else matter_reference,
            metadata=_redact_metadata(final_metadata),
        )
        TRACE_STORE.add(record)
        _submit_langsmith_trace(record)


def record_route_trace(route: dict[str, Any], surface_context: str, matter_reference: str | None = None) -> None:
    trace_event(
        name="moe_route",
        surface_context=surface_context,
        category="router",
        route=route,
        guardrail_status=str(route.get("guardrail_status") or "") if isinstance(route, dict) else None,
        matter_reference=matter_reference,
    )


def record_rag_trace(
    retrieval: dict[str, Any],
    route: dict[str, Any] | None,
    surface_context: str,
    matter_reference: str | None = None,
) -> None:
    trace_event(
        name="rag_retrieve",
        surface_context=surface_context,
        category="rag",
        route=route,
        rag=retrieval,
        guardrail_status=str(retrieval.get("verification", {}).get("status") or _guardrail_from_route(route)),
        matter_reference=matter_reference,
    )


def record_guardrail_trace(route: dict[str, Any], surface_context: str, matter_reference: str | None = None) -> None:
    status = str(route.get("guardrail_status") or "") if isinstance(route, dict) else ""
    if status in {"warn", "block"}:
        trace_event(
            name="guardrail_signal",
            surface_context=surface_context,
            category="guardrail",
            route=route,
            guardrail_status=status,
            matter_reference=matter_reference,
        )


def observability_dashboard(limit: int = 100) -> dict[str, Any]:
    return TRACE_STORE.dashboard(limit=limit)


def _summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    latencies = [float(record["latency_ms"]) for record in records if record.get("latency_ms") is not None]
    return {
        "trace_count": len(records),
        "avg_latency_ms": round(sum(latencies) / len(latencies), 2) if latencies else 0.0,
        "router_trace_count": len([record for record in records if record.get("category") == "router"]),
        "rag_trace_count": len([record for record in records if record.get("category") == "rag"]),
        "guardrail_warn_or_block_count": len(
            [record for record in records if record.get("guardrail_status") in {"warn", "block"}]
        ),
    }


def _router_decisions(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    decisions: list[dict[str, Any]] = []
    for record in records:
        route = record.get("route")
        if not isinstance(route, dict):
            continue
        decisions.append(
            {
                "trace_id": record["trace_id"],
                "surface_context": record["surface_context"],
                "expert": route.get("expert"),
                "expert_label": route.get("expert_label"),
                "route_mode": route.get("route_mode"),
                "confidence": route.get("confidence"),
                "guardrail_status": route.get("guardrail_status"),
                "latency_ms": record.get("latency_ms"),
            }
        )
    return decisions[-25:]


def _rag_quality(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    quality: list[dict[str, Any]] = []
    for record in records:
        rag = record.get("rag")
        if not isinstance(rag, dict):
            continue
        quality.append(
            {
                "trace_id": record["trace_id"],
                "surface_context": record["surface_context"],
                "result_count": rag.get("result_count", 0),
                "verification_status": rag.get("verification_status"),
                "top_score": rag.get("top_score", 0.0),
                "citation_count": rag.get("citation_count", 0),
                "latency_ms": record.get("latency_ms"),
            }
        )
    return quality[-25:]


def _guardrail_violations(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    violations: list[dict[str, Any]] = []
    for record in records:
        if record.get("guardrail_status") not in {"warn", "block"}:
            continue
        route = record.get("route") if isinstance(record.get("route"), dict) else {}
        guardrails = route.get("guardrail_profile") if isinstance(route.get("guardrail_profile"), dict) else {}
        violations.append(
            {
                "trace_id": record["trace_id"],
                "surface_context": record["surface_context"],
                "status": record.get("guardrail_status"),
                "expert": route.get("expert"),
                "route_mode": route.get("route_mode"),
                "review_flags": guardrails.get("review_flags", []),
                "latency_ms": record.get("latency_ms"),
            }
        )
    return violations[-25:]


def _latency_by_surface(records: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, list[float]] = {}
    for record in records:
        if record.get("latency_ms") is None:
            continue
        grouped.setdefault(str(record.get("surface_context") or "core"), []).append(float(record["latency_ms"]))
    return {
        surface: {
            "count": len(values),
            "avg_ms": round(sum(values) / len(values), 2),
            "max_ms": round(max(values), 2),
        }
        for surface, values in sorted(grouped.items())
    }


def _safe_route(route: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(route, dict):
        return None
    return {
        "expert": route.get("expert"),
        "expert_label": route.get("expert_label"),
        "route_mode": route.get("route_mode"),
        "confidence": route.get("confidence"),
        "guardrail_status": route.get("guardrail_status"),
        "selected_capability": route.get("selected_capability"),
        "missing_inputs": route.get("missing_inputs", []),
        "guardrail_profile": route.get("guardrail_profile", {}),
    }


def _safe_rag(rag: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(rag, dict):
        return None
    results = rag.get("results") if isinstance(rag.get("results"), list) else []
    top_score = 0.0
    if results:
        top_score = max(float(result.get("combined_score") or 0.0) for result in results if isinstance(result, dict))
    verification = rag.get("verification") if isinstance(rag.get("verification"), dict) else {}
    return {
        "rag_version": rag.get("rag_version"),
        "result_count": len(results),
        "citation_count": len(rag.get("citations") or []),
        "verification_status": verification.get("status"),
        "top_score": round(top_score, 4),
    }


def _guardrail_from_route(route: dict[str, Any] | None) -> str | None:
    if not isinstance(route, dict):
        return None
    status = route.get("guardrail_status")
    return str(status) if status else None


def _redact_metadata(metadata: dict[str, Any]) -> dict[str, Any]:
    blocked_exact = {
        "document_text",
        "selected_text",
        "facts",
        "key_facts",
        "draft",
        "content",
        "prompt",
        "query",
        "answer",
        "generated_answer",
        "matter_text",
        "document_content",
    }
    blocked_fragments = ("prompt", "document_text", "selected_text", "matter_text", "raw_text", "client_fact")

    def scrub(value: Any) -> Any:
        if isinstance(value, dict):
            return {
                key: scrub(nested)
                for key, nested in value.items()
                if key.lower() not in blocked_exact and not any(fragment in key.lower() for fragment in blocked_fragments)
            }
        if isinstance(value, list):
            return [scrub(item) for item in value]
        return value

    return {
        key: scrub(value)
        for key, value in metadata.items()
        if key.lower() not in blocked_exact and not any(fragment in key.lower() for fragment in blocked_fragments)
    }


def _submit_langsmith_trace(record: TraceRecord) -> None:
    config = langsmith_project_config()
    if not (config.tracing_enabled and config.api_key_configured):
        return
    try:
        from langsmith import Client  # type: ignore

        client = Client(api_url=config.endpoint)
        client.create_run(
            name=record.name,
            run_type="chain",
            project_name=config.project_name,
            inputs={"surface_context": record.surface_context, "category": record.category},
            outputs={
                "status": record.status,
                "route": record.route,
                "rag": record.rag,
                "guardrail_status": record.guardrail_status,
                "latency_ms": record.latency_ms,
            },
            extra={"metadata": record.metadata, "trace_id": record.trace_id},
        )
    except Exception:
        return


__all__ = [
    "OBSERVABILITY_VERSION",
    "TRACE_STORE",
    "configure_langsmith_environment",
    "langsmith_project_config",
    "observability_dashboard",
    "record_guardrail_trace",
    "record_rag_trace",
    "record_route_trace",
    "trace_event",
    "trace_span",
]
