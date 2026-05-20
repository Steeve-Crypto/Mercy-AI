from __future__ import annotations

import os
import time
from typing import Any

from fastapi import FastAPI, Request, Response


SAFE_ROUTE_PREFIXES = (
    "/health",
    "/devops",
    "/admin/devops",
    "/v1",
)


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

        if tracer is None:
            response = await call_next(request)
            response.headers.setdefault("X-Mercy-Trace-Component", service_name)
            response.headers.setdefault("X-Mercy-Route-Family", route_family)
            return response

        with tracer.start_as_current_span(f"{request.method} {route_family}") as span:
            span.set_attribute("service.name", service_name)
            span.set_attribute("mercy.component", service_name)
            span.set_attribute("http.request.method", request.method)
            span.set_attribute("mercy.route_family", route_family)
            response = await call_next(request)
            latency_ms = round((time.perf_counter() - started) * 1000, 2)
            span.set_attribute("http.response.status_code", response.status_code)
            span.set_attribute("mercy.latency_ms", latency_ms)
            response.headers.setdefault("X-Mercy-Trace-Component", service_name)
            response.headers.setdefault("X-Mercy-Route-Family", route_family)
            return response

    return {"enabled": True, "service_name": service_name, "exporter": "current-provider-or-none"}
