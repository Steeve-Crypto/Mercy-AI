from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime
import os
import threading
import time
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Request, Response


SAFE_ROUTE_PREFIXES = (
    "/health",
    "/devops",
    "/admin/devops",
    "/v1",
)

OBSERVED_NODE_LABELS: dict[str, dict[str, str]] = {
    "web_dashboard": {"label": "Mercy Web Dashboard", "type": "surface", "group": "product_surfaces", "lane": "Product Surfaces", "layer": "surfaces"},
    "word_addin": {"label": "Word Add-in", "type": "office_addin", "group": "product_surfaces", "lane": "Product Surfaces", "layer": "surfaces"},
    "outlook_addin": {"label": "Outlook Add-in", "type": "office_addin", "group": "product_surfaces", "lane": "Product Surfaces", "layer": "surfaces"},
    "devops_console": {"label": "Mercy System Map", "type": "surface", "group": "product_surfaces", "lane": "Product Surfaces", "layer": "surfaces"},
    "manual_client": {"label": "Manual Client", "type": "client", "group": "runtime_services", "lane": "External/Runtime Services", "layer": "runtime"},
    "external_client": {"label": "External Client", "type": "client", "group": "runtime_services", "lane": "External/Runtime Services", "layer": "runtime"},
    "unknown_client": {"label": "Unknown Client", "type": "client", "group": "runtime_services", "lane": "External/Runtime Services", "layer": "runtime"},
    "fastapi_core": {"label": "FastAPI Core on port 8000", "type": "backend", "group": "backend_api", "lane": "Backend/API", "layer": "backend"},
    "health_route": {"label": "Health Route", "type": "route", "group": "backend_api", "lane": "Backend/API", "layer": "backend"},
    "matter_routes": {"label": "Matter Routes", "type": "route_family", "group": "backend_api", "lane": "Backend/API", "layer": "backend"},
    "document_routes": {"label": "Document Routes", "type": "route_family", "group": "backend_api", "lane": "Backend/API", "layer": "backend"},
    "agent_routes": {"label": "Agent API Routes", "type": "route_family", "group": "backend_api", "lane": "Backend/API", "layer": "backend"},
    "rag_routes": {"label": "RAG API Routes", "type": "route_family", "group": "backend_api", "lane": "Backend/API", "layer": "backend"},
    "tenant_auth": {"label": "Tenant Auth Context", "type": "auth", "group": "auth_security", "lane": "Auth/Security", "layer": "security"},
    "security_middleware": {"label": "Security Middleware", "type": "security", "group": "auth_security", "lane": "Auth/Security", "layer": "security"},
    "dc_guardrails": {"label": "D.C. Guardrail Middleware", "type": "security", "group": "auth_security", "lane": "Auth/Security", "layer": "security"},
    "otel_hook": {"label": "OpenTelemetry Hook", "type": "observability", "group": "auth_security", "lane": "Auth/Security", "layer": "security"},
    "postgres_store": {"label": "Postgres Store", "type": "database", "group": "data_layer", "lane": "Data Layer", "layer": "data"},
    "matter_store": {"label": "Matter Store", "type": "database", "group": "data_layer", "lane": "Data Layer", "layer": "data"},
    "document_metadata": {"label": "Document Metadata Store", "type": "database", "group": "data_layer", "lane": "Data Layer", "layer": "data"},
    "trace_buffer": {"label": "Trace Buffer", "type": "observability_store", "group": "data_layer", "lane": "Data Layer", "layer": "data"},
    "dc_source_ingestion": {"label": "D.C. Source Ingestion", "type": "knowledge_pipeline", "group": "knowledge_rag", "lane": "Knowledge/RAG Infrastructure", "layer": "knowledge"},
    "chunker": {"label": "Chunker", "type": "knowledge_pipeline", "group": "knowledge_rag", "lane": "Knowledge/RAG Infrastructure", "layer": "knowledge"},
    "vector_index": {"label": "Vector Index", "type": "vector_store", "group": "knowledge_rag", "lane": "Knowledge/RAG Infrastructure", "layer": "knowledge"},
    "llm_runtime": {"label": "LLM Provider Runtime", "type": "external_service", "group": "runtime_services", "lane": "External/Runtime Services", "layer": "runtime"},
}


EDGE_DEFINITIONS: dict[str, tuple[str, str, str, str]] = {
    "edge_web_core": ("web_dashboard", "fastapi_core", "Web calls backend", "safe route telemetry"),
    "edge_word_core": ("word_addin", "fastapi_core", "Word add-in calls backend", "safe route telemetry"),
    "edge_outlook_core": ("outlook_addin", "fastapi_core", "Outlook add-in calls backend", "safe route telemetry"),
    "edge_console_map": ("devops_console", "fastapi_core", "Loads system map", "system metadata"),
    "edge_manual_core": ("manual_client", "fastapi_core", "Manual request hits backend", "safe route telemetry"),
    "edge_external_core": ("external_client", "fastapi_core", "External request hits backend", "safe route telemetry"),
    "edge_unknown_core": ("unknown_client", "fastapi_core", "Unknown request hits backend", "safe route telemetry"),
    "edge_core_health": ("fastapi_core", "health_route", "Serves health", "service status"),
    "edge_core_auth": ("fastapi_core", "tenant_auth", "Resolves tenant context", "tenant metadata"),
    "edge_core_security": ("fastapi_core", "security_middleware", "Applies request controls", "request metadata"),
    "edge_core_guardrails": ("fastapi_core", "dc_guardrails", "Applies D.C. guardrails", "route and guardrail metadata"),
    "edge_core_otel": ("fastapi_core", "otel_hook", "Optional safe spans", "route telemetry"),
    "edge_matters_store": ("matter_routes", "matter_store", "Reads/writes matter metadata", "matter identifiers and status"),
    "edge_documents_store": ("document_routes", "document_metadata", "Reads/writes file metadata", "file identifiers and status"),
    "edge_core_postgres": ("fastapi_core", "postgres_store", "Persistent storage adapter", "storage operation metadata"),
    "edge_trace_buffer": ("fastapi_core", "trace_buffer", "Records safe events", "trace metadata"),
    "edge_rag_ingestion": ("rag_routes", "dc_source_ingestion", "Ingests source metadata", "source identifiers"),
    "edge_ingestion_chunker": ("dc_source_ingestion", "chunker", "Prepares chunks", "source locator metadata"),
    "edge_chunker_vector": ("chunker", "vector_index", "Indexes retrieval vectors", "index metadata"),
    "edge_rag_vector": ("rag_routes", "vector_index", "Queries vector index", "retrieval metadata"),
    "edge_agent_llm": ("agent_routes", "llm_runtime", "Optional model runtime", "provider metadata"),
}


@dataclass
class EdgeObservation:
    edge_id: str
    from_node: str
    to_node: str
    label: str
    data_class: str
    call_count: int = 0
    error_count: int = 0
    total_latency_ms: float = 0.0
    last_seen: str | None = None
    methods: set[str] = field(default_factory=set)
    route_families: set[str] = field(default_factory=set)


_LOCK = threading.Lock()
_EDGE_OBSERVATIONS: dict[str, EdgeObservation] = {}
_NODE_LAST_SEEN: dict[str, str] = {}
_RECENT_SAFE_SPANS: deque[dict[str, Any]] = deque(maxlen=200)


def otel_enabled() -> bool:
    return os.getenv("MERCY_OTEL_ENABLED", "").strip().lower() == "true"


def safe_route_family(path: str) -> str:
    if path.startswith("/devops"):
        return "/devops/*"
    if path.startswith("/admin/devops"):
        return "/admin/devops"
    if path.startswith("/v1/"):
        parts = path.strip("/").split("/")
        return "/" + "/".join(parts[:2]) + "/*" if len(parts) >= 2 else "/v1/*"
    return path if path in SAFE_ROUTE_PREFIXES else "other"


def _utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def classify_request_source(path: str, headers: dict[str, str] | Any) -> str:
    surface = (headers.get("x-mercy-surface") or headers.get("x-mercy-client") or "").lower()
    origin = (headers.get("origin") or headers.get("referer") or "").lower()
    user_agent = (headers.get("user-agent") or "").lower()
    if "word" in surface or "word" in user_agent:
        return "word_addin"
    if "office" in origin and "word" in origin:
        return "word_addin"
    if "outlook" in surface or "outlook" in user_agent:
        return "outlook_addin"
    if "office" in origin and "outlook" in origin:
        return "outlook_addin"
    if path.startswith("/devops") or path in {"/", "/admin/devops"}:
        return "devops_console"
    if "3100" in origin or "mercy-legal-web" in surface or "mercy-legal-web" in origin:
        return "web_dashboard"
    if any(token in user_agent for token in ("powershell", "curl", "httpie", "python", "node-fetch", "undici")):
        return "manual_client"
    if not origin:
        return "external_client" if "mozilla" in user_agent else "manual_client"
    return "unknown_client"


def _source_node_for_request(request: Request) -> str:
    return classify_request_source(request.url.path, request.headers)


def _route_edges(path: str, source_node: str) -> list[str]:
    edges = ["edge_core_security", "edge_core_otel", "edge_trace_buffer"]
    if source_node == "devops_console":
        edges.append("edge_console_map")
    elif source_node == "word_addin":
        edges.append("edge_word_core")
    elif source_node == "outlook_addin":
        edges.append("edge_outlook_core")
    elif source_node == "manual_client":
        edges.append("edge_manual_core")
    elif source_node == "external_client":
        edges.append("edge_external_core")
    elif source_node == "unknown_client":
        edges.append("edge_unknown_core")
    else:
        edges.append("edge_web_core")

    if path == "/health":
        edges.append("edge_core_health")
    if path.startswith("/v1/"):
        edges.extend(["edge_core_auth", "edge_core_guardrails", "edge_core_postgres"])
    if "/matters" in path or "/matter" in path:
        edges.append("edge_matters_store")
        if "/documents" in path or "document" in path:
            edges.append("edge_documents_store")
    if "/documents" in path or path.startswith("/v1/workspace/discovery"):
        edges.append("edge_documents_store")
    if path.startswith("/v1/rag"):
        edges.append("edge_rag_vector")
        if "ingest" in path:
            edges.extend(["edge_rag_ingestion", "edge_ingestion_chunker", "edge_chunker_vector"])
    if path.startswith("/v1/agent") or path.startswith("/v1/router"):
        edges.append("edge_agent_llm")
        if path.startswith("/v1/agent"):
            edges.append("edge_rag_vector")
    return list(dict.fromkeys(edge for edge in edges if edge in EDGE_DEFINITIONS))


def record_dependency_observation(
    *,
    path: str,
    method: str,
    status_code: int,
    latency_ms: float,
    source_node: str,
    route_family: str,
    trace_id: str,
) -> None:
    if not otel_enabled():
        return
    last_seen = _utc_now()
    with _LOCK:
        for edge_id in _route_edges(path, source_node):
            from_node, to_node, label, data_class = EDGE_DEFINITIONS[edge_id]
            observation = _EDGE_OBSERVATIONS.setdefault(
                edge_id,
                EdgeObservation(edge_id=edge_id, from_node=from_node, to_node=to_node, label=label, data_class=data_class),
            )
            observation.call_count += 1
            observation.error_count += 1 if status_code >= 500 else 0
            observation.total_latency_ms += latency_ms
            observation.last_seen = last_seen
            observation.methods.add(method)
            observation.route_families.add(route_family)
            _NODE_LAST_SEEN[from_node] = last_seen
            _NODE_LAST_SEEN[to_node] = last_seen
        _RECENT_SAFE_SPANS.append(
            {
                "traceId": trace_id,
                "method": method,
                "routeFamily": route_family,
                "statusCode": status_code,
                "latencyMs": round(latency_ms, 2),
                "component": "mercy-backend",
                "timestamp": last_seen,
            }
        )


def observed_system_map(declared_edge_ids: set[str] | None = None) -> dict[str, Any]:
    declared_edge_ids = declared_edge_ids or set()
    if not otel_enabled():
        return {
            "metadata": {
                "name": "Mercy Observed System Map",
                "version": "0.2.0",
                "kind": "observed-system-map",
                "otelEnabled": False,
                "storage": "disabled",
                "dataPolicy": "Safe route and component telemetry only.",
                "generatedAt": _utc_now(),
            },
            "nodes": [],
            "edges": [],
            "statusSummary": {"observed": 0, "unknown_observed_dependency": 0, "failing": 0},
            "health": {"overall": "declared_only", "summary": {"observed": 0, "unknown_observed_dependency": 0, "failing": 0}},
            "recentSpans": [],
        }

    with _LOCK:
        observations = list(_EDGE_OBSERVATIONS.values())
        node_last_seen = dict(_NODE_LAST_SEEN)
        recent_spans = list(_RECENT_SAFE_SPANS)

    node_ids = sorted({node_id for obs in observations for node_id in (obs.from_node, obs.to_node)})
    nodes = []
    for node_id in node_ids:
        template = OBSERVED_NODE_LABELS.get(
            node_id,
            {"label": node_id.replace("_", " ").title(), "type": "observed_dependency", "group": "runtime_services", "lane": "External/Runtime Services", "layer": "runtime"},
        )
        nodes.append(
            {
                "id": node_id,
                **template,
                "status": "observed",
                "description": "Observed from safe OpenTelemetry route metadata.",
                "declared": False,
                "observed": True,
                "safeMetadata": {"lastSeen": node_last_seen.get(node_id), "observationSource": "in-process-otel-buffer"},
                "riskNotes": ["Safe metadata only. Request bodies, prompts, documents, and matter text are excluded."],
                "lastSeen": node_last_seen.get(node_id),
            }
        )

    edges = []
    for obs in observations:
        error_rate = round(obs.error_count / obs.call_count, 4) if obs.call_count else 0
        declared = obs.edge_id in declared_edge_ids
        status = "failing" if error_rate > 0 else "observed" if declared else "unknown_observed_dependency"
        edges.append(
            {
                "id": obs.edge_id,
                "from": obs.from_node,
                "to": obs.to_node,
                "label": obs.label,
                "observed": True,
                "declared": declared,
                "callCount": obs.call_count,
                "avgLatencyMs": round(obs.total_latency_ms / obs.call_count, 2) if obs.call_count else None,
                "errorRate": error_rate,
                "lastSeen": obs.last_seen,
                "status": status,
                "dataClass": obs.data_class,
                "allowsRawLegalText": False,
                "notes": "Derived from safe OpenTelemetry route metadata. Bodies, prompts, documents, and model outputs are excluded.",
                "safeMetadata": {
                    "methods": sorted(obs.methods),
                    "routeFamilies": sorted(obs.route_families),
                    "observationSource": "in-process-otel-buffer",
                },
            }
        )

    summary = {
        "observed": sum(1 for edge in edges if edge["status"] == "observed"),
        "unknown_observed_dependency": sum(1 for edge in edges if not edge["declared"]),
        "failing": sum(1 for edge in edges if edge["status"] == "failing"),
    }
    return {
        "metadata": {
            "name": "Mercy Observed System Map",
            "version": "0.2.0",
            "kind": "observed-system-map",
            "otelEnabled": True,
            "storage": "in-process-otel-buffer",
            "dataPolicy": "Safe route and component telemetry only.",
            "generatedAt": _utc_now(),
        },
        "nodes": nodes,
        "edges": edges,
        "statusSummary": summary,
        "health": {"overall": "failing" if summary["failing"] else "healthy", "summary": summary},
        "recentSpans": recent_spans,
    }


def configure_fastapi_otel(app: FastAPI, *, service_name: str = "mercy-backend") -> dict[str, Any]:
    """Install safe local OpenTelemetry-style request timing when enabled.

    This intentionally does not configure an exporter or attach legal content.
    If OpenTelemetry packages are installed, spans are emitted through the
    current provider; otherwise the middleware remains a safe no-op timer.
    """

    if not otel_enabled():
        return {"enabled": False, "service_name": service_name}

    tracer = None
    try:
        from opentelemetry import trace  # type: ignore

        tracer = trace.get_tracer("mercy.fastapi")
    except Exception:
        tracer = None

    @app.middleware("http")
    async def mercy_otel_middleware(request: Request, call_next: Any) -> Response:
        started = time.perf_counter()
        route_family = safe_route_family(request.url.path)
        trace_id = uuid4().hex

        if tracer is None:
            response = await call_next(request)
            latency_ms = round((time.perf_counter() - started) * 1000, 2)
            record_dependency_observation(
                path=request.url.path,
                method=request.method,
                status_code=response.status_code,
                latency_ms=latency_ms,
                source_node=_source_node_for_request(request),
                route_family=route_family,
                trace_id=trace_id,
            )
            response.headers.setdefault("X-Mercy-Trace-Component", service_name)
            response.headers.setdefault("X-Mercy-Route-Family", route_family)
            response.headers.setdefault("X-Mercy-Trace-Id", trace_id)
            return response

        with tracer.start_as_current_span(f"{request.method} {route_family}") as span:
            span_context = span.get_span_context()
            if span_context and getattr(span_context, "trace_id", 0):
                trace_id = f"{span_context.trace_id:032x}"
            span.set_attribute("service.name", service_name)
            span.set_attribute("mercy.component", service_name)
            span.set_attribute("http.request.method", request.method)
            span.set_attribute("mercy.route_family", route_family)
            response = await call_next(request)
            latency_ms = round((time.perf_counter() - started) * 1000, 2)
            span.set_attribute("http.response.status_code", response.status_code)
            span.set_attribute("mercy.latency_ms", latency_ms)
            span.set_attribute("mercy.trace_id", trace_id)
            record_dependency_observation(
                path=request.url.path,
                method=request.method,
                status_code=response.status_code,
                latency_ms=latency_ms,
                source_node=_source_node_for_request(request),
                route_family=route_family,
                trace_id=trace_id,
            )
            response.headers.setdefault("X-Mercy-Trace-Component", service_name)
            response.headers.setdefault("X-Mercy-Route-Family", route_family)
            response.headers.setdefault("X-Mercy-Trace-Id", trace_id)
            return response

    return {"enabled": True, "service_name": service_name, "exporter": "current-provider-or-none"}
