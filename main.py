from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from hashlib import sha256
import json
import os
from pathlib import Path
from typing import Any
from uuid import uuid4

from agent_network import execute_agent_task, mcp_skill_manifest
from client_intake_flow import run_full_intake_flow
from dc_knowledge_rag import SourceValidationError, ingest_dc_sources, rag_backend_status, retrieve_dc_knowledge
from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from bridge import draft_from_facts, run_discovery
from auth_context import TenantUser, get_current_tenant_user
from beta_launch import (
    accept_invite,
    beta_analytics,
    beta_status,
    check_quota,
    create_invite,
    join_waitlist,
    legal_document,
    record_feedback,
    record_usage,
)
from dc_guardrails import DCGuardrailMiddleware
from legal_task_router import moe_route
from llm_providers import generate_workspace_draft
from mercy_context import (
    MATTERS,
    CORE_NAME,
    MatterTenantAccessError,
    PRODUCT_NAME,
    attach_matter_document,
    build_billing_report,
    delete_all_tenant_data,
    get_matter_context,
    list_matter_documents,
    product_capabilities,
    remove_matter_document,
    update_matter_context,
)
from mercy_config import get_config
from microsoft_auth import exchange_microsoft_token_for_mercy_session
from monitoring import cost_breakdown, monitoring_dashboard, monitoring_metrics
from observability import configure_langsmith_environment, observability_dashboard, trace_event, trace_span
from otel_observability import configure_fastapi_otel, observed_system_map, otel_enabled
from ragas_eval import DEFAULT_DATASET_PATH, DEFAULT_REPORT_PATH, run_ragas_evaluation
from response_envelope import attach_response_envelope, build_response_envelope
from security_controls import check_rate_limit, record_security_audit, sanitize_payload, sanitize_text, security_compliance_status, security_headers
from mercy_storage import (
    list_microsoft_identity_mappings,
    set_microsoft_identity_mapping_status,
    upsert_microsoft_identity_mapping,
)
from system_prompts import CLERK_OS_VERSION, DC_CLERK_OPERATING_SYSTEM
from template_gallery import list_template_gallery, trace_template_usage


ROOT_DIR = Path(__file__).resolve().parent
CONFIG = get_config()
UPLOAD_DIR = CONFIG.upload_dir
DASHBOARD_DIR = ROOT_DIR / "standalone_platform"
DEVOPS_SYSTEM_MAP_PATH = DASHBOARD_DIR / "devops" / "mercy-system-map.json"
DEVOPS_MAP_PATH = DASHBOARD_DIR / "devops" / "mercy-map.json"
WORD_PLUGIN_DIR = ROOT_DIR / "word_plugin"
LANGSMITH_CONFIG = configure_langsmith_environment()

app = FastAPI(
    title=CORE_NAME,
    version="0.1.0",
    description=(
        "FastAPI brain for shared discovery and drafting services used by the "
        "Mercy Word plugin and standalone platform."
    ),
)

_DEFAULT_ALLOWED_ORIGINS = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "https://127.0.0.1:3000",
    "https://localhost:3000",
]
_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in (os.getenv("MERCY_ALLOWED_ORIGINS") or ",".join(_DEFAULT_ALLOWED_ORIGINS)).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(DCGuardrailMiddleware)
OTEL_CONFIG = configure_fastapi_otel(app)


def _mercy_dev_tools_enabled() -> bool:
    return os.getenv("MERCY_DEV_TOOLS", "").strip().lower() == "true"


def _request_is_localhost(request: Request) -> bool:
    local_hosts = {"127.0.0.1", "::1", "localhost", "testclient"}
    client_host = request.client.host if request.client else ""
    forwarded_host = (request.headers.get("x-forwarded-host") or "").split(":")[0]
    host_header = (request.headers.get("host") or "").split(":")[0]
    url_host = request.url.hostname or ""
    return any(host in local_hosts for host in {client_host, forwarded_host, host_header, url_host})


def _require_devops_console(request: Request) -> None:
    if not _mercy_dev_tools_enabled():
        raise HTTPException(status_code=404, detail="Dev tools are not enabled.")
    if not _request_is_localhost(request):
        raise HTTPException(status_code=403, detail="Dev tools are restricted to localhost.")


def _is_devops_console_path(path: str) -> bool:
    return path in {"/", "/dashboard", "/devops", "/admin/devops", "/static/dashboard/index.html"} or path.startswith(
        "/static/dashboard/devops/"
    )


def _devops_console_security_headers() -> dict[str, str]:
    headers = security_headers()
    headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "img-src 'self' data: https:; "
        "style-src 'self' 'unsafe-inline'; "
        "script-src 'self' 'unsafe-inline'; "
        "connect-src 'self' https: http://localhost:* http://127.0.0.1:*; "
        "frame-ancestors 'none';"
    )
    return headers


def _read_json_file(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"{path.name} is not available.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=500, detail=f"{path.name} must contain a JSON object.")
    return payload


def _declared_edge_ids(declared: dict[str, Any]) -> set[str]:
    return {edge.get("id") for edge in declared.get("edges", []) if isinstance(edge, dict) and edge.get("id")}


def _merge_system_maps(declared: dict[str, Any], observed: dict[str, Any]) -> dict[str, Any]:
    observed_nodes = {node.get("id"): node for node in observed.get("nodes", []) if isinstance(node, dict) and node.get("id")}
    observed_edges = {edge.get("id"): edge for edge in observed.get("edges", []) if isinstance(edge, dict) and edge.get("id")}
    declared_node_ids = {node.get("id") for node in declared.get("nodes", []) if isinstance(node, dict)}
    declared_edge_ids = {edge.get("id") for edge in declared.get("edges", []) if isinstance(edge, dict)}

    merged_nodes: list[dict[str, Any]] = []
    for node in declared.get("nodes", []):
        if not isinstance(node, dict):
            continue
        observed_node = observed_nodes.get(node.get("id"))
        merged = {**node, "declared": True, "observed": bool(observed_node)}
        if observed_node:
            merged.update(
                {
                    "status": observed_node.get("status") or "observed",
                    "safeMetadata": {**node.get("safeMetadata", {}), **observed_node.get("safeMetadata", {})},
                    "lastSeen": observed_node.get("lastSeen"),
                }
            )
        elif node.get("status") == "healthy":
            merged["status"] = "healthy"
        else:
            merged["status"] = "declared_only"
        merged_nodes.append(merged)

    for node_id, node in observed_nodes.items():
        if node_id in declared_node_ids:
            continue
        merged_nodes.append(
            {
                **node,
                "declared": False,
                "observed": True,
                "status": "unknown_observed_dependency",
                "riskNotes": [*node.get("riskNotes", []), "Observed dependency is not declared in mercy-system-map.json."],
            }
        )

    merged_edges: list[dict[str, Any]] = []
    for edge in declared.get("edges", []):
        if not isinstance(edge, dict):
            continue
        observed_edge = observed_edges.get(edge.get("id"))
        merged = {**edge, "declared": True, "observed": bool(observed_edge)}
        if observed_edge:
            merged.update(
                {
                    "status": observed_edge.get("status") or "observed",
                    "callCount": observed_edge.get("callCount", edge.get("callCount", 0)),
                    "avgLatencyMs": observed_edge.get("avgLatencyMs", edge.get("avgLatencyMs")),
                    "errorRate": observed_edge.get("errorRate", edge.get("errorRate")),
                    "lastSeen": observed_edge.get("lastSeen", edge.get("lastSeen")),
                }
            )
        else:
            merged["status"] = "missing_observation" if otel_enabled() else "declared_only"
        merged_edges.append(merged)

    for edge_id, edge in observed_edges.items():
        if edge_id in declared_edge_ids:
            continue
        merged_edges.append(
            {
                **edge,
                "declared": False,
                "observed": True,
                "status": "unknown_observed_dependency",
                "notes": f"{edge.get('notes', '')} Observed dependency is not declared in mercy-system-map.json.".strip(),
            }
        )

    summary = {
        "declared_only": sum(1 for item in [*merged_nodes, *merged_edges] if item.get("declared") and not item.get("observed")),
        "observed": sum(1 for item in [*merged_nodes, *merged_edges] if item.get("declared") and item.get("observed")),
        "missing_observation": sum(1 for item in merged_edges if item.get("status") == "missing_observation"),
        "unknown_observed_dependency": sum(1 for item in [*merged_nodes, *merged_edges] if item.get("status") == "unknown_observed_dependency"),
        "healthy": sum(1 for item in merged_nodes if item.get("status") == "healthy"),
        "warning": sum(1 for item in merged_nodes if item.get("status") == "warning"),
        "failing": sum(1 for item in merged_nodes if item.get("status") == "failing"),
    }

    return {
        **declared,
        "metadata": {
            **declared.get("metadata", {}),
            "kind": "merged-system-map",
            "observedSource": observed.get("metadata", {}).get("storage", "not-configured"),
            "otelEnabled": otel_enabled(),
        },
        "nodes": merged_nodes,
        "edges": merged_edges,
        "health": {"overall": "warning" if summary["unknown_observed_dependency"] or summary["missing_observation"] else "healthy", "summary": summary},
    }


@app.middleware("http")
async def security_controls_middleware(request: Request, call_next: Any) -> Response:
    if request.url.path == "/static/dashboard/index.html" or request.url.path.startswith("/static/dashboard/devops/"):
        if not _mercy_dev_tools_enabled():
            return JSONResponse({"detail": "Dev tools are not enabled."}, status_code=404)
        if not _request_is_localhost(request):
            return JSONResponse({"detail": "Dev tools are restricted to localhost."}, status_code=403)
    if request.url.path.startswith("/v1/"):
        if os.getenv("MERCY_REQUIRE_HTTPS", "").lower() == "true":
            proto = request.headers.get("x-forwarded-proto") or request.url.scheme
            if proto != "https" and request.client and request.client.host not in {"127.0.0.1", "localhost"}:
                return JSONResponse({"detail": "HTTPS is required for Mercy API traffic."}, status_code=400)
        tenant_hint = request.headers.get("x-mercy-tenant-id") or request.headers.get("x-tenant-id") or "anonymous"
        client_host = request.client.host if request.client else "unknown"
        allowed, retry_after = check_rate_limit(f"{tenant_hint}:{client_host}:{request.url.path}")
        if not allowed:
            record_security_audit(
                "rate_limit_exceeded",
                category="abuse_protection",
                metadata={"path": request.url.path, "client_host": client_host, "retry_after": retry_after},
                guardrail_status="block",
            )
            return JSONResponse(
                {"detail": "Too many requests. Please retry shortly.", "retry_after_seconds": retry_after},
                status_code=429,
                headers={"Retry-After": str(retry_after), **security_headers()},
            )
    response = await call_next(request)
    headers = _devops_console_security_headers() if _is_devops_console_path(request.url.path) else security_headers()
    for header, value in headers.items():
        response.headers.setdefault(header, value)
    return response

if DASHBOARD_DIR.exists():
    app.mount("/static/dashboard", StaticFiles(directory=str(DASHBOARD_DIR)), name="dashboard_static")

if WORD_PLUGIN_DIR.exists():
    app.mount("/word_plugin", StaticFiles(directory=str(WORD_PLUGIN_DIR)), name="word_plugin")


class DiscoveryRequest(BaseModel):
    document_path: str = Field(..., description="Absolute or workspace-relative PDF path.")
    document_text: str | None = Field(None, description="Optional supplemental text.")
    matter_id: str | None = Field(None, description="Optional workspace matter identifier.")


class DraftRequest(BaseModel):
    facts: dict[str, Any] = Field(..., description="Facts from /v1/workspace/discovery.")
    draft_type: str = Field("statement_of_case", description="Draft segment or full_appellate_brief.")
    target_court: str = Field(
        "U.S. Court of Appeals for the D.C. Circuit",
        description="Court whose rules should be prioritized.",
    )
    requested_relief: str | None = Field(None, description="Precise relief sought.")
    matter_id: str | None = Field(None, description="Optional workspace matter identifier.")
    surface_context: str = Field("core", description="Calling surface for route metadata.")
    user_type: str = Field("solo", description="User type used by the MoE router.")


class MatterCreateRequest(BaseModel):
    name: str = Field(..., description="Matter or case name.")
    tier: str = Field("free", description="free or premium.")
    client_id: str | None = Field(None, description="Optional client identifier.")
    client_name: str | None = Field(None, description="Optional client display name.")
    matter_type: str | None = Field(None, description="Optional matter type.")


class MicrosoftExchangeRequest(BaseModel):
    bootstrap_token: str = Field(..., min_length=1, description="Microsoft Office SSO bootstrap token.")


class MicrosoftIdentityProvisionRequest(BaseModel):
    microsoft_tenant_id: str = Field(..., min_length=1, description="Microsoft Entra tenant ID claim.")
    microsoft_object_id: str = Field(..., min_length=1, description="Microsoft Entra object ID claim.")
    email: str | None = Field(None, description="Verified Microsoft email/preferred_username for admin review.")
    mercy_user_id: str = Field(..., min_length=1, description="Mercy user ID to bind.")
    tenant_id: str = Field(..., min_length=1, description="Universal Mercy tenant/workspace account ID.")
    firm_id: str | None = Field(None, description="Firm ID for firm accounts. Omit for solo accounts.")
    roles: list[str] = Field(default_factory=lambda: ["attorney"], description="Mercy roles for the user.")
    status: str = Field("pending", description="active, disabled, or pending.")
    attorney_seat_limit: int | None = Field(None, description="Firm accounts require at least 2 seats; solo defaults to 1.")


class MicrosoftIdentityStatusRequest(BaseModel):
    status: str = Field(..., description="active, disabled, or pending.")


class MatterIntakeRequest(BaseModel):
    matter_id: str | None = Field(None, description="Matter identifier to create or update.")
    client_id: str | None = Field(None, description="Client identifier.")
    client_name: str | None = Field(None, description="Client display name.")
    name: str | None = Field(None, description="Matter name.")
    matter_name: str | None = Field(None, description="Matter name alias.")
    matter_type: str | None = Field(None, description="Matter type.")
    tier: str = Field("free", description="free or premium.")
    jurisdiction: str = Field("District of Columbia", description="Primary jurisdiction.")
    client_role: str | None = Field(None, description="Plaintiff, defendant, petitioner, respondent, tenant, etc.")
    opposing_parties: list[str] = Field(default_factory=list, description="Known opposing parties.")
    deadlines: list[dict[str, Any]] = Field(default_factory=list, description="Known deadlines.")
    key_facts: dict[str, Any] = Field(default_factory=dict, description="Matter-level key facts.")
    documents: list[dict[str, Any]] = Field(default_factory=list, description="Matter document references.")
    history: list[dict[str, Any]] = Field(default_factory=list, description="Prior intake or workflow history.")
    requested_relief: str | None = Field(None, description="Client objective or requested relief.")
    sensitivity_flags: list[str] = Field(default_factory=list, description="Confidentiality or risk flags.")
    missing_information: list[str] = Field(default_factory=list, description="Open intake questions.")
    surface_context: str = Field("core_intake", description="Calling surface.")
    user_type: str = Field("solo", description="User type used by the MoE router.")


class FullMatterIntakeRequest(BaseModel):
    matter_id: str | None = Field(None, description="Matter identifier to create or update.")
    client: dict[str, Any] = Field(default_factory=dict, description="Client identity and contact step.")
    matter: dict[str, Any] = Field(default_factory=dict, description="Matter metadata and parties step.")
    facts: dict[str, Any] = Field(default_factory=dict, description="Fact gathering and chronology step.")
    documents: list[Any] = Field(default_factory=list, description="Documents supplied during intake.")
    deadlines: list[Any] = Field(default_factory=list, description="Known deadlines supplied during intake.")
    conflicts: dict[str, Any] = Field(default_factory=dict, description="Conflict-check inputs and status.")
    scope: dict[str, Any] = Field(default_factory=dict, description="Scope confirmation inputs.")
    consent: dict[str, Any] = Field(default_factory=dict, description="Confidentiality and consent acknowledgements.")
    key_facts: dict[str, Any] = Field(default_factory=dict, description="Additional fact fields for MatterContext.")
    requested_relief: str | None = Field(None, description="Client objective or requested relief.")
    opposing_parties: list[str] = Field(default_factory=list, description="Known opposing parties.")
    sensitivity_flags: list[str] = Field(default_factory=list, description="Confidentiality or risk flags.")
    missing_information: list[str] = Field(default_factory=list, description="Open intake questions.")
    tier: str = Field("free", description="free or premium.")
    surface_context: str = Field("core_full_intake", description="Calling surface.")
    user_type: str = Field("solo", description="User type used by the MoE router.")


class RouterInspectRequest(BaseModel):
    query: str = Field(..., description="User request or legal task prompt.")
    matter_context: dict[str, Any] = Field(default_factory=dict, description="Matter facts and request context.")
    user_type: str = Field("solo", description="solo, small_firm, staff, or admin.")
    surface_context: str = Field("core", description="Calling surface name.")
    matter_id: str | None = Field(None, description="Optional matter identifier to merge into context.")
    selected_text: str | None = Field(None, description="Optional Word or document selection.")
    document_text: str | None = Field(None, description="Optional document text.")


class RagRetrieveRequest(BaseModel):
    query: str = Field(..., description="D.C. legal research or drafting retrieval query.")
    matter_id: str | None = Field(None, description="Optional matter identifier to merge into retrieval context.")
    matter_context: dict[str, Any] = Field(default_factory=dict, description="Additional matter context.")
    top_k: int = Field(5, ge=1, le=10, description="Maximum number of chunks to retrieve.")
    user_type: str = Field("solo", description="User type used by the MoE router.")
    surface_context: str = Field("core_rag", description="Calling surface name.")
    practice_area: str | None = Field(None, description="Optional D.C. practice area metadata filter.")
    date_from: str | None = Field(None, description="Optional source date lower bound.")
    date_to: str | None = Field(None, description="Optional source date upper bound.")


class RagIngestRequest(BaseModel):
    source: dict[str, Any] = Field(..., description="Official D.C. source record.")
    chunks: list[dict[str, Any]] = Field(default_factory=list, description="Validated chunks derived from the source.")
    matter_id: str | None = Field(None, description="Optional matter identifier for audit context.")
    surface_context: str = Field("core_rag_ingest", description="Calling surface name.")


class RagEvaluateRequest(BaseModel):
    dataset_path: str | None = Field(None, description="Optional JSONL golden dataset path.")
    top_k: int = Field(5, ge=1, le=10, description="Number of chunks to retrieve per golden example.")
    limit: int | None = Field(None, ge=1, le=100, description="Optional maximum examples to evaluate.")
    pass_threshold: float = Field(0.72, ge=0.0, le=1.0, description="Per-example average metric threshold.")
    write_report: bool = Field(False, description="Write a local JSON report under reports/.")
    report_path: str | None = Field(None, description="Optional report destination when write_report is true.")
    surface_context: str = Field("core_ragas_eval", description="Calling surface name.")


class ObservabilityTraceRequest(BaseModel):
    name: str = Field("manual_trace", description="Trace name.")
    surface_context: str = Field("core_observability", description="Calling surface name.")
    category: str = Field("manual", description="Trace category.")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Non-sensitive metadata to attach.")
    limit: int = Field(100, ge=1, le=500, description="Dashboard trace limit to return.")


class AgentExecuteRequest(BaseModel):
    task: str = Field(..., description="Legal task to route and execute through the agent network.")
    params: dict[str, Any] = Field(default_factory=dict, description="Agent or MCP skill parameters.")
    matter_id: str | None = Field(None, description="Optional matter identifier to hydrate context.")
    matter_context: dict[str, Any] = Field(default_factory=dict, description="Additional matter context.")
    user_type: str = Field("solo", description="User type used by the MoE router.")
    surface_context: str = Field("core_agent", description="Calling surface name.")


class BetaWaitlistRequest(BaseModel):
    email: str = Field(..., description="Beta waitlist email.")
    practice_area: str | None = Field(None, description="Optional D.C. practice area.")


class BetaInviteRequest(BaseModel):
    email: str = Field(..., description="Invite recipient email.")
    invited_by: str | None = Field(None, description="Optional inviting user label.")


class BetaAcceptInviteRequest(BaseModel):
    invite_code: str = Field(..., description="Invite code.")
    email: str | None = Field(None, description="Optional invitee email.")


class BetaFeedbackRequest(BaseModel):
    rating: str = Field(..., description="up or down.")
    comment: str | None = Field(None, description="Optional feedback comment.")
    action: str = Field("major_action", description="Action being rated.")
    trace_id: str | None = Field(None, description="Optional trace ID.")
    route_expert: str | None = Field(None, description="Optional MoE expert.")
    guardrail_status: str | None = Field(None, description="Optional guardrail status.")
    template_id: str | None = Field(None, description="Optional gallery template ID.")


@app.post("/v1/auth/microsoft/exchange")
async def microsoft_auth_exchange(request: MicrosoftExchangeRequest) -> dict[str, Any]:
    return exchange_microsoft_token_for_mercy_session(request.bootstrap_token)


@app.get("/v1/admin/microsoft-identity-mappings")
async def admin_list_microsoft_identity_mappings(
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    _require_provisioning_admin(tenant_user)
    mappings = list_microsoft_identity_mappings()
    record_security_audit(
        "microsoft_identity_mappings_listed",
        tenant_context=_tenant_context(tenant_user),
        category="admin_provisioning",
        metadata={"count": len(mappings)},
    )
    return {"version": "mercy-microsoft-identity-admin-1.0", "mappings": mappings}


@app.post("/v1/admin/microsoft-identity-mappings")
async def admin_create_microsoft_identity_mapping(
    request: MicrosoftIdentityProvisionRequest,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    _require_provisioning_admin(tenant_user)
    try:
        mapping = upsert_microsoft_identity_mapping(
            microsoft_tenant_id=request.microsoft_tenant_id,
            microsoft_object_id=request.microsoft_object_id,
            email=request.email,
            mercy_user_id=request.mercy_user_id,
            firm_id=request.firm_id,
            tenant_id=request.tenant_id,
            roles=request.roles,
            status=request.status,
            attorney_seat_limit=request.attorney_seat_limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    record_security_audit(
        "microsoft_identity_mapping_upserted",
        tenant_context=_tenant_context(tenant_user),
        category="admin_provisioning",
        metadata={
            "mapping_id": mapping.get("id"),
            "target_tenant_id": mapping.get("tenant_id"),
            "account_type": mapping.get("account_type"),
            "status": mapping.get("status"),
        },
    )
    return {"version": "mercy-microsoft-identity-admin-1.0", "mapping": mapping}


@app.patch("/v1/admin/microsoft-identity-mappings/{microsoft_tenant_id}/{microsoft_object_id}/status")
async def admin_update_microsoft_identity_mapping_status(
    microsoft_tenant_id: str,
    microsoft_object_id: str,
    request: MicrosoftIdentityStatusRequest,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    _require_provisioning_admin(tenant_user)
    try:
        mapping = set_microsoft_identity_mapping_status(microsoft_tenant_id, microsoft_object_id, request.status)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    record_security_audit(
        "microsoft_identity_mapping_status_updated",
        tenant_context=_tenant_context(tenant_user),
        category="admin_provisioning",
        metadata={"mapping_id": mapping.get("id"), "status": mapping.get("status")},
    )
    return {"version": "mercy-microsoft-identity-admin-1.0", "mapping": mapping}


def _tenant_context(tenant_user: TenantUser) -> dict[str, Any]:
    return tenant_user.to_context()


def _auth_metadata(tenant_user: TenantUser) -> dict[str, Any]:
    return {
        "tenant_id": tenant_user.tenant_id,
        "user_id": tenant_user.user_id,
        "auth_mode": tenant_user.auth_mode,
    }


def _require_monitoring_admin(tenant_user: TenantUser) -> None:
    if tenant_user.auth_mode == "local_dev":
        return
    if "admin" in tenant_user.roles or "ops" in tenant_user.roles:
        return
    raise HTTPException(status_code=403, detail="Monitoring endpoints require an admin or ops role.")


def _require_provisioning_admin(tenant_user: TenantUser) -> None:
    if tenant_user.auth_mode == "local_dev":
        return
    if any(role in {"admin", "superadmin"} for role in tenant_user.roles):
        return
    raise HTTPException(status_code=403, detail="Microsoft identity provisioning requires an admin or superadmin role.")


def _matter_context(matter_id: str | None, tenant_user: TenantUser) -> dict[str, Any]:
    try:
        return get_matter_context(matter_id, tenant_context=_tenant_context(tenant_user)) or {}
    except MatterTenantAccessError as exc:
        raise HTTPException(status_code=404, detail="Matter not found.") from exc


_TENANT_IDENTITY_CONTEXT_KEYS = {"auth_context", "tenant_id", "user_id", "created_by_user_id", "roles", "auth_mode"}
_STORED_MATTER_CONTEXT_KEYS = {
    "matter_id",
    "client_id",
    "client_name",
    "name",
    "matter_name",
    "matter_type",
    "jurisdiction",
    "client_role",
    "opposing_parties",
    "deadlines",
    "requested_relief",
    "key_facts",
    "facts",
    "documents",
    "attached_documents",
    "attached_document_ids",
    "sensitivity_flags",
    "missing_information",
    "history",
    "drafts",
    "billing_events",
    "route_history",
    "created_at",
    "last_updated",
    "retention_status",
}


def _sanitize_client_matter_context(
    client_context: dict[str, Any] | None,
    *,
    matter_id: str | None,
) -> dict[str, Any]:
    sanitized = sanitize_payload(client_context or {})
    blocked = set(_TENANT_IDENTITY_CONTEXT_KEYS)
    if matter_id:
        blocked.update(_STORED_MATTER_CONTEXT_KEYS)
    return {key: value for key, value in sanitized.items() if key not in blocked}


def _scoped_matter_context(
    tenant_user: TenantUser,
    *,
    matter_id: str | None = None,
    client_context: dict[str, Any] | None = None,
    surface_context: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    stored_context = _matter_context(matter_id, tenant_user)
    context = {
        **_sanitize_client_matter_context(client_context, matter_id=matter_id),
        **stored_context,
        **(extra or {}),
        "surface_context": surface_context,
        "auth_context": _tenant_context(tenant_user),
    }
    if matter_id:
        context["matter_id"] = matter_id
    return context


def _route_payload(decision: Any) -> dict[str, Any]:
    return decision.to_dict() if hasattr(decision, "to_dict") else dict(decision)


def _attach_route(
    result: dict[str, Any],
    route: dict[str, Any],
    tenant_user: TenantUser,
    matter_id: str | None = None,
    matter_context: dict[str, Any] | None = None,
    source: str = "core",
) -> dict[str, Any]:
    context = matter_context or _matter_context(matter_id, tenant_user)
    wrapped = attach_response_envelope(result, route, context, source=source)
    if matter_id:
        try:
            MATTERS.attach_route(matter_id, route, tenant_context=_tenant_context(tenant_user))
        except MatterTenantAccessError as exc:
            raise HTTPException(status_code=404, detail="Matter not found.") from exc
    return wrapped


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"status": "ok", "service": "mercy-backend", "port": 8000, "product": PRODUCT_NAME}


@app.get("/v1/product/capabilities")
async def capabilities(tenant_user: TenantUser = Depends(get_current_tenant_user)) -> dict[str, Any]:
    return product_capabilities()


@app.get("/v1/security/compliance")
async def security_compliance(tenant_user: TenantUser = Depends(get_current_tenant_user)) -> dict[str, Any]:
    record_security_audit(
        "security_compliance_view",
        tenant_context=_tenant_context(tenant_user),
        category="security",
        metadata={"surface_context": "security_compliance"},
    )
    return {
        **security_compliance_status(),
        "tenant_isolation": {
            "tenant_id": tenant_user.tenant_id,
            "status": "active",
            "message": "Matter, RAG, checkpoint, quota, and audit records are scoped by tenant_id.",
        },
    }


@app.get("/v1/monitoring/dashboard")
async def monitoring_dashboard_endpoint(
    days: int = Query(7, ge=1, le=90),
    send_alerts: bool = Query(False, description="Send configured alerts instead of dry-run evaluation."),
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    _require_monitoring_admin(tenant_user)
    trace_event(name="monitoring_dashboard_view", surface_context="monitoring", category="monitoring", metadata=_auth_metadata(tenant_user))
    return monitoring_dashboard(days=days, send_alerts=send_alerts)


@app.get("/v1/monitoring/metrics")
async def monitoring_metrics_endpoint(
    days: int = Query(7, ge=1, le=90),
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    _require_monitoring_admin(tenant_user)
    trace_event(name="monitoring_metrics_view", surface_context="monitoring", category="monitoring", metadata=_auth_metadata(tenant_user))
    return monitoring_metrics(days=days)


@app.get("/v1/monitoring/cost/breakdown")
async def monitoring_cost_breakdown_endpoint(
    days: int = Query(7, ge=1, le=90),
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    _require_monitoring_admin(tenant_user)
    trace_event(name="monitoring_cost_breakdown_view", surface_context="monitoring", category="monitoring", metadata=_auth_metadata(tenant_user))
    return cost_breakdown(days=days)


@app.delete("/v1/account/data")
async def delete_account_data(tenant_user: TenantUser = Depends(get_current_tenant_user)) -> dict[str, Any]:
    return delete_all_tenant_data(_tenant_context(tenant_user))


@app.get("/v1/beta/status")
async def beta_status_endpoint(tenant_user: TenantUser = Depends(get_current_tenant_user)) -> dict[str, Any]:
    return beta_status(_tenant_context(tenant_user))


@app.post("/v1/beta/waitlist")
async def beta_waitlist(
    request: BetaWaitlistRequest,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    return join_waitlist(_tenant_context(tenant_user), request.email, request.practice_area)


@app.post("/v1/beta/invites")
async def beta_invites(
    request: BetaInviteRequest,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    return create_invite(request.email, _tenant_context(tenant_user), invited_by=request.invited_by)


@app.post("/v1/beta/invites/accept")
async def beta_invite_accept(
    request: BetaAcceptInviteRequest,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    return accept_invite(_tenant_context(tenant_user), request.invite_code, request.email)


@app.get("/v1/beta/legal/{document_kind}")
async def beta_legal_document(
    document_kind: str,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> Response:
    if document_kind not in {"dpa", "terms"}:
        raise HTTPException(status_code=404, detail="Beta legal document not found.")
    trace_event(
        name="beta_legal_document_downloaded",
        surface_context="beta_launch",
        category="beta",
        metadata={**_auth_metadata(tenant_user), "document_kind": document_kind},
    )
    filename = "mercy-beta-dpa.md" if document_kind == "dpa" else "mercy-beta-terms.md"
    return Response(
        content=legal_document(document_kind),
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/v1/beta/feedback")
async def beta_feedback(
    request: BetaFeedbackRequest,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    try:
        return record_feedback(_tenant_context(tenant_user), request.dict(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/v1/beta/analytics")
async def beta_analytics_endpoint(
    limit: int = Query(100, ge=1, le=500),
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    trace_event(name="beta_analytics_view", surface_context="beta_admin", category="beta", metadata=_auth_metadata(tenant_user))
    return beta_analytics(limit=limit)


@app.get("/v1/templates/gallery")
async def templates_gallery(
    practice_area: str | None = Query(None, description="Optional practice-area filter."),
    difficulty: str | None = Query(None, description="Optional difficulty filter."),
    search: str | None = Query(None, description="Optional text search across template titles and descriptions."),
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    return list_template_gallery(
        tenant_context=_tenant_context(tenant_user),
        practice_area=practice_area,
        difficulty=difficulty,
        search=search,
    )


@app.post("/v1/matters")
async def create_matter(
    request: MatterCreateRequest,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    tier = request.tier if request.tier in {"free", "premium"} else "free"
    matter = MATTERS.create(
        name=request.name,
        tier=tier,
        client_id=request.client_id,
        client_name=request.client_name,
        matter_type=request.matter_type,
        tenant_context=_tenant_context(tenant_user),
    )
    record_security_audit(
        "matter_created",
        tenant_context=_tenant_context(tenant_user),
        matter_id=matter.get("matter_id"),
        category="matter",
        metadata={"matter_type": matter.get("matter_type"), "tier": matter.get("tier")},
    )
    return matter


@app.post("/v1/matter/intake")
async def matter_intake(
    request: MatterIntakeRequest,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    with trace_span("matter_intake_endpoint", request.surface_context, "matter_context", metadata=_auth_metadata(tenant_user)) as span:
        payload = sanitize_payload(request.dict(exclude_none=True))
        payload["source"] = request.surface_context
        try:
            updated_context = update_matter_context(payload, tenant_context=_tenant_context(tenant_user))
        except MatterTenantAccessError as exc:
            raise HTTPException(status_code=404, detail="Matter not found.") from exc
        span["metadata"] = {"matter_id": updated_context.get("matter_id"), **_auth_metadata(tenant_user)}
        route = _route_payload(
            moe_route(
                query="Update matter intake context with client, jurisdiction, parties, deadlines, documents, requested relief, and confidentiality flags.",
                matter_context={
                    **updated_context,
                    "surface_context": request.surface_context,
                    "auth_context": _tenant_context(tenant_user),
                },
                user_type=request.user_type,
            )
        )
        span["route"] = route
        return _attach_route(
            {
                "matter_context": updated_context,
                "matter_id": updated_context["matter_id"],
                "updated": True,
            },
            route,
            tenant_user,
            updated_context["matter_id"],
            updated_context,
            source="matter_intake",
        )


@app.post("/v1/matter/intake/full")
async def matter_intake_full(
    request: FullMatterIntakeRequest,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    with trace_span(
        "matter_intake_full_endpoint",
        request.surface_context,
        "matter_context",
        matter_reference=request.matter_id,
        metadata=_auth_metadata(tenant_user),
    ) as span:
        payload = sanitize_payload(request.dict(exclude_none=True))
        payload["surface_context"] = request.surface_context
        payload["auth_context"] = _tenant_context(tenant_user)
        try:
            result = run_full_intake_flow(payload)
        except MatterTenantAccessError as exc:
            raise HTTPException(status_code=404, detail="Matter not found.") from exc
        updated_context = result["matter_context"]
        span["metadata"] = {
            "matter_id": updated_context.get("matter_id"),
            "conflict_status": result["conflict_check"]["status"],
            "scope_status": result["scope_confirmation"]["status"],
            **_auth_metadata(tenant_user),
        }
        route = _route_payload(
            moe_route(
                query=(
                    "Run full client intake, matter fact gathering, conflict check, "
                    "and scope confirmation for a D.C. legal matter."
                ),
                matter_context={
                    **updated_context,
                    "conflict_check": result["conflict_check"],
                    "scope_confirmation": result["scope_confirmation"],
                    "surface_context": request.surface_context,
                    "auth_context": _tenant_context(tenant_user),
                },
                user_type=request.user_type,
            )
        )
        span["route"] = route
        return _attach_route(
            result,
            route,
            tenant_user,
            updated_context["matter_id"],
            updated_context,
            source="matter_intake_full",
        )


@app.get("/v1/matters")
async def list_matters(tenant_user: TenantUser = Depends(get_current_tenant_user)) -> list[dict[str, Any]]:
    matters = MATTERS.list(tenant_context=_tenant_context(tenant_user))
    record_security_audit(
        "matter_list_accessed",
        tenant_context=_tenant_context(tenant_user),
        category="matter",
        metadata={"count": len(matters)},
    )
    return matters


@app.get("/v1/matters/{matter_id}/documents")
async def get_matter_documents(
    matter_id: str,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    try:
        documents = list_matter_documents(matter_id, tenant_context=_tenant_context(tenant_user))
    except MatterTenantAccessError as exc:
        raise HTTPException(status_code=404, detail="Matter not found.") from exc
    record_security_audit(
        "matter_documents_accessed",
        tenant_context=_tenant_context(tenant_user),
        matter_id=matter_id,
        category="matter",
        metadata={"document_count": len(documents)},
    )
    return {
        "matter_id": matter_id,
        "documents": documents,
        "generated_at": datetime.now(UTC).isoformat(),
    }


def _find_matter_document(matter_id: str, document_id: str, tenant_user: TenantUser) -> dict[str, Any]:
    try:
        documents = list_matter_documents(matter_id, tenant_context=_tenant_context(tenant_user))
    except MatterTenantAccessError as exc:
        raise HTTPException(status_code=404, detail="Document not found.") from exc
    document = next((item for item in documents if str(item.get("document_id")) == document_id), None)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found for this matter.")
    return document


@app.get("/v1/matters/{matter_id}/documents/{document_id}/preview")
async def preview_matter_document(
    matter_id: str,
    document_id: str,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> FileResponse:
    document = _find_matter_document(matter_id, document_id, tenant_user)
    storage_path = Path(str(document.get("storage_path") or ""))
    try:
        resolved = storage_path.resolve()
        upload_root = UPLOAD_DIR.resolve()
    except OSError as exc:
        raise HTTPException(status_code=404, detail="Document file is unavailable.") from exc
    if upload_root not in resolved.parents and resolved != upload_root:
        raise HTTPException(status_code=403, detail="Document path is outside the managed upload vault.")
    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(status_code=404, detail="Document file is unavailable.")
    record_security_audit(
        "matter_document_previewed",
        tenant_context=_tenant_context(tenant_user),
        matter_id=matter_id,
        category="document",
        metadata={"document_id": document_id, "filename": document.get("filename")},
    )
    return FileResponse(
        resolved,
        media_type=str(document.get("mime_type") or "application/pdf"),
        filename=str(document.get("filename") or f"{document_id}.pdf"),
    )


@app.delete("/v1/matters/{matter_id}/documents/{document_id}")
async def delete_matter_document(
    matter_id: str,
    document_id: str,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    document = _find_matter_document(matter_id, document_id, tenant_user)
    removed = remove_matter_document(matter_id, document_id, tenant_context=_tenant_context(tenant_user))
    storage_path = Path(str(document.get("storage_path") or ""))
    deleted_file = False
    try:
        resolved = storage_path.resolve()
        upload_root = UPLOAD_DIR.resolve()
        if resolved.exists() and resolved.is_file() and (upload_root in resolved.parents or resolved.parent == upload_root):
            resolved.unlink()
            deleted_file = True
    except OSError:
        deleted_file = False
    record_security_audit(
        "matter_document_deleted",
        tenant_context=_tenant_context(tenant_user),
        matter_id=matter_id,
        category="document",
        metadata={"document_id": document_id, "filename": document.get("filename"), "deleted_file": deleted_file},
    )
    return {
        "deleted": bool(removed),
        "deleted_file": deleted_file,
        "matter_id": matter_id,
        "document_id": document_id,
        "documents": list_matter_documents(matter_id, tenant_context=_tenant_context(tenant_user)),
    }


@app.get("/v1/matters/{matter_id}")
async def get_matter(
    matter_id: str,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    try:
        matter = MATTERS.get(matter_id, tenant_context=_tenant_context(tenant_user))
    except MatterTenantAccessError as exc:
        raise HTTPException(status_code=404, detail="Matter not found.") from exc
    if not matter:
        raise HTTPException(status_code=404, detail="Matter not found.")
    record_security_audit(
        "matter_accessed",
        tenant_context=_tenant_context(tenant_user),
        matter_id=matter_id,
        category="matter",
        metadata={"matter_type": matter.get("matter_type")},
    )
    return matter


@app.get("/v1/matters/{matter_id}/billing-report")
async def matter_billing_report(
    matter_id: str,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    try:
        matter = MATTERS.get(matter_id, tenant_context=_tenant_context(tenant_user))
    except MatterTenantAccessError as exc:
        raise HTTPException(status_code=404, detail="Matter not found.") from exc
    if not matter:
        raise HTTPException(status_code=404, detail="Matter not found.")
    route = _route_payload(
        moe_route(
            query="Generate a billing report with D.C. fee reasonableness warnings.",
            matter_context={**matter, "surface_context": "core_billing", "auth_context": _tenant_context(tenant_user)},
            user_type="solo",
        )
    )
    return _attach_route(build_billing_report(matter), route, tenant_user, matter_id, matter, source="billing_report")


@app.get("/")
async def root(request: Request) -> FileResponse:
    _require_devops_console(request)
    return FileResponse(DASHBOARD_DIR / "index.html")


@app.get("/dashboard")
async def dashboard(request: Request) -> FileResponse:
    _require_devops_console(request)
    return FileResponse(DASHBOARD_DIR / "index.html")


@app.get("/admin/devops")
@app.get("/devops")
async def devops_console(request: Request) -> FileResponse:
    _require_devops_console(request)
    return FileResponse(DASHBOARD_DIR / "index.html")


@app.get("/devops/mercy-map.json")
async def devops_mercy_map(request: Request) -> JSONResponse:
    _require_devops_console(request)
    return JSONResponse(_read_json_file(DEVOPS_SYSTEM_MAP_PATH if DEVOPS_SYSTEM_MAP_PATH.exists() else DEVOPS_MAP_PATH))


@app.get("/devops/mercy-system-map.json")
async def devops_mercy_system_map(request: Request) -> JSONResponse:
    _require_devops_console(request)
    return JSONResponse(_read_json_file(DEVOPS_SYSTEM_MAP_PATH))


@app.get("/devops/observed-system-map.json")
async def devops_observed_system_map(request: Request) -> JSONResponse:
    _require_devops_console(request)
    declared = _read_json_file(DEVOPS_SYSTEM_MAP_PATH)
    return JSONResponse(observed_system_map(_declared_edge_ids(declared)))


@app.get("/devops/system-map-merged.json")
async def devops_system_map_merged(request: Request) -> JSONResponse:
    _require_devops_console(request)
    declared = _read_json_file(DEVOPS_SYSTEM_MAP_PATH)
    observed = observed_system_map(_declared_edge_ids(declared))
    return JSONResponse(_merge_system_maps(declared, observed))


@app.get("/v1/workspace/clerk-os")
async def clerk_os(tenant_user: TenantUser = Depends(get_current_tenant_user)) -> dict[str, Any]:
    route = _route_payload(
        moe_route(
            query="Review D.C. legal AI operating rules and compliance guardrails.",
            matter_context={"surface_context": "core_clerk_os", "auth_context": _tenant_context(tenant_user)},
            user_type="solo",
        )
    )
    payload = {
        "clerk_os_version": CLERK_OS_VERSION,
        "system_prompt": DC_CLERK_OPERATING_SYSTEM.strip(),
        "human_review_required": True,
    }
    return _attach_route(payload, route, tenant_user, source="clerk_os")


@app.post("/v1/router/inspect")
async def router_inspect(
    request: RouterInspectRequest,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    with trace_span(
        "router_inspect_endpoint",
        request.surface_context,
        "router",
        matter_reference=request.matter_id,
        metadata=_auth_metadata(tenant_user),
    ) as span:
        context = _scoped_matter_context(
            tenant_user,
            matter_id=request.matter_id,
            client_context=request.matter_context,
            surface_context=request.surface_context,
        )
        if request.selected_text:
            context["selected_text"] = sanitize_text(request.selected_text)
        if request.document_text:
            context["document_text"] = sanitize_text(request.document_text)
        if request.matter_id:
            context["matter_id"] = request.matter_id

        decision = moe_route(
            query=sanitize_text(request.query, max_length=8000),
            matter_context=context,
            user_type=request.user_type,
        )
        route = _route_payload(decision)
        span["route"] = route
        if request.matter_id:
            try:
                MATTERS.attach_route(request.matter_id, route, tenant_context=_tenant_context(tenant_user))
            except MatterTenantAccessError as exc:
                raise HTTPException(status_code=404, detail="Matter not found.") from exc
        envelope = build_response_envelope(route, context, source="router")
        return {
            "response_envelope": envelope,
            "route": route,
            "expert": route["expert"],
            "confidence": route["confidence"],
            "confidence_score": envelope["confidence_score"],
            "guardrail_status": envelope["guardrail_status"],
            "citations": envelope["citations"],
            "dc_ethics_metadata": envelope["dc_ethics_metadata"],
            "matter_context_snapshot": envelope["matter_context_snapshot"],
            "audit_timestamp": envelope["audit_timestamp"],
            "human_review_required": True,
        }


@app.post("/v1/rag/retrieve")
async def rag_retrieve(
    request: RagRetrieveRequest,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    with trace_span(
        "rag_retrieve_endpoint",
        request.surface_context,
        "rag",
        matter_reference=request.matter_id,
        metadata=_auth_metadata(tenant_user),
    ) as span:
        context = _scoped_matter_context(
            tenant_user,
            matter_id=request.matter_id,
            client_context=request.matter_context,
            surface_context=request.surface_context,
        )
        if request.practice_area:
            context["practice_area"] = request.practice_area
        if request.date_from:
            context["date_from"] = request.date_from
        if request.date_to:
            context["date_to"] = request.date_to
        if request.matter_id:
            context["matter_id"] = request.matter_id

        route = _route_payload(
            moe_route(
                query=sanitize_text(request.query, max_length=8000),
                matter_context=context,
                user_type=request.user_type,
            )
        )
        retrieval = retrieve_dc_knowledge(
            query=sanitize_text(request.query, max_length=8000),
            matter_context=context,
            top_k=request.top_k,
            route=route,
            agentic=True,
        )
        span["route"] = route
        span["rag"] = retrieval
        payload = {
            **retrieval,
            "matter_id": request.matter_id,
            "human_review_required": True,
        }
        record_security_audit(
            "rag_retrieval",
            tenant_context=_tenant_context(tenant_user),
            matter_id=request.matter_id,
            category="rag",
            metadata={"top_k": request.top_k, "results": len(retrieval.get("results") or []), "official_sources_only": True},
        )
        return _attach_route(payload, route, tenant_user, request.matter_id, context, source="rag_retrieve")


@app.get("/v1/rag/status")
async def rag_status(tenant_user: TenantUser = Depends(get_current_tenant_user)) -> dict[str, Any]:
    context = {"surface_context": "core_rag_status", "auth_context": _tenant_context(tenant_user)}
    trace_event(name="rag_status_view", surface_context="core_rag_status", category="rag", metadata=_auth_metadata(tenant_user))
    return rag_backend_status(context)


@app.post("/v1/rag/ingest")
async def rag_ingest(
    request: RagIngestRequest,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    context = _scoped_matter_context(
        tenant_user,
        matter_id=request.matter_id,
        surface_context=request.surface_context,
    )
    route = _route_payload(
        moe_route(
            query="Validate and register official District of Columbia legal source records for RAG ingestion.",
            matter_context=context,
            user_type="solo",
        )
    )
    try:
        result = ingest_dc_sources(
            {"source": request.source, "chunks": request.chunks},
            matter_context=context,
        )
    except SourceValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _attach_route(result, route, tenant_user, request.matter_id, context, source="rag_ingest")


@app.post("/v1/rag/evaluate")
async def rag_evaluate(
    request: RagEvaluateRequest,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    with trace_span("rag_evaluate_endpoint", request.surface_context, "rag_eval", metadata=_auth_metadata(tenant_user)) as span:
        route = _route_payload(
            moe_route(
                query="Evaluate D.C. knowledge RAG retrieval with RAGAS-style metrics and citation provenance.",
                matter_context={
                    "surface_context": request.surface_context,
                    "jurisdiction": "District of Columbia",
                    "auth_context": _tenant_context(tenant_user),
                },
                user_type="solo",
            )
        )
        span["route"] = route
        report = await asyncio.to_thread(
            run_ragas_evaluation,
            dataset_path=request.dataset_path or DEFAULT_DATASET_PATH,
            top_k=request.top_k,
            limit=request.limit,
            pass_threshold=request.pass_threshold,
            write_report=request.write_report,
            report_path=request.report_path or DEFAULT_REPORT_PATH,
            matter_context={
                "surface_context": request.surface_context,
                "jurisdiction": "District of Columbia",
                "auth_context": _tenant_context(tenant_user),
            },
        )
        span["metadata"] = {
            "dataset_size": report["dataset_size"],
            "overall": report["aggregate"]["overall"],
            **_auth_metadata(tenant_user),
        }
        payload = {
            "evaluation": report,
            "dataset_path": report["dataset_path"],
            "dataset_size": report["dataset_size"],
            "aggregate": report["aggregate"],
            "failure_groups": report.get("failure_groups", {}),
            "langsmith": report.get("langsmith", {}),
            "passed": report["passed"],
            "human_review_required": True,
            "citations": [
                {
                    "label": "RAGAS-style evaluation report",
                    "source_type": "evaluation_artifact",
                    "verification_status": "generated_locally",
                    "note": "Evaluation report is deterministic and suitable for local CI gating.",
                    "provenance": {
                        "source": "ragas_eval",
                        "dataset_path": report["dataset_path"],
                        "eval_version": report["eval_version"],
                    },
                }
            ],
        }
        return _attach_route(
            payload,
            route,
            tenant_user,
            matter_context={"surface_context": request.surface_context, "auth_context": _tenant_context(tenant_user)},
            source="rag_evaluate",
        )


@app.get("/v1/observability/trace")
async def observability_trace(
    limit: int = 100,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    trace_event(name="observability_trace_view", surface_context="core_observability", category="auth", metadata=_auth_metadata(tenant_user))
    return observability_dashboard(limit=limit)


@app.post("/v1/observability/trace")
async def create_observability_trace(
    request: ObservabilityTraceRequest,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    trace_event(
        name=request.name,
        surface_context=request.surface_context,
        category=request.category,
        metadata={**request.metadata, **_auth_metadata(tenant_user)},
    )
    return observability_dashboard(limit=request.limit)


@app.get("/v1/agent/skills")
async def agent_skills(tenant_user: TenantUser = Depends(get_current_tenant_user)) -> dict[str, Any]:
    trace_event(name="agent_skills_manifest_view", surface_context="core_agent", category="auth", metadata=_auth_metadata(tenant_user))
    return mcp_skill_manifest()


@app.post("/v1/agent/execute")
async def agent_execute(
    request: AgentExecuteRequest,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    with trace_span(
        "agent_execute_endpoint",
        request.surface_context,
        "agent",
        matter_reference=request.matter_id,
        metadata=_auth_metadata(tenant_user),
    ) as span:
        context = _scoped_matter_context(
            tenant_user,
            matter_id=request.matter_id,
            client_context=request.matter_context,
            surface_context=request.surface_context,
        )
        safe_task = sanitize_text(request.task, max_length=8000)
        route = _route_payload(moe_route(safe_task, context, user_type=request.user_type))
        model_tier = "strong" if route.get("expert") in {"drafting", "research"} else "fast"
        try:
            check_quota(_tenant_context(tenant_user), model_tier)
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=429, detail=str(exc)) from exc
        params = {
            **sanitize_payload(request.params),
            "surface_context": request.surface_context,
            "auth_context": _tenant_context(tenant_user),
        }
        template_id = str(params.get("template_id") or params.get("gallery_template_id") or "")
        if template_id:
            trace_template_usage(
                template_id=template_id,
                surface_context=request.surface_context,
                tenant_context=_tenant_context(tenant_user),
                matter_id=request.matter_id,
                prompt_template_id=str(params.get("prompt_template_id") or ""),
            )
        if request.matter_id:
            params.setdefault("matter_id", request.matter_id)
        result = execute_agent_task(
            task=safe_task,
            params=params,
            matter_context=context,
            route=route,
            user_type=request.user_type,
        )
        result["trace_id"] = span["trace_id"]
        result["langsmith_project_url"] = LANGSMITH_CONFIG.get("ui_url")
        span["route"] = route
        span["rag"] = result.get("agent_result", {}).get("rag") if isinstance(result.get("agent_result"), dict) else None
        span["metadata"] = {
            "agent": result.get("selected_agent"),
            "skill_count": len(result.get("mcp_skills_used") or []),
            **_auth_metadata(tenant_user),
        }
        llm_payload = result.get("llm") if isinstance(result.get("llm"), dict) else {}
        estimated_cost = float(llm_payload.get("estimated_cost_usd") or 0.0) if isinstance(llm_payload, dict) else 0.0
        result["beta"] = {
            "model_tier": model_tier,
            "quota": record_usage(
                _tenant_context(tenant_user),
                model_tier=model_tier,
                estimated_cost_usd=estimated_cost,
                template_id=template_id or None,
                guardrail_status=str(route.get("guardrail_status") or ""),
            ),
            "feedback_endpoint": "/v1/beta/feedback",
            "attorney_review_required": True,
        }
        record_security_audit(
            "agent_execution",
            tenant_context=_tenant_context(tenant_user),
            matter_id=request.matter_id,
            category="agent",
            metadata={
                "route_expert": route.get("expert"),
                "model_tier": model_tier,
                "skill_count": len(result.get("mcp_skills_used") or []),
                "estimated_cost_usd": estimated_cost,
            },
        )
        return _attach_route(result, route, tenant_user, request.matter_id, context, source="agent_execute")


@app.post("/v1/workspace/discovery")
async def workspace_discovery(
    request: DiscoveryRequest,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    with trace_span(
        "workspace_discovery_endpoint",
        "core_discovery",
        "discovery",
        matter_reference=request.matter_id,
        metadata=_auth_metadata(tenant_user),
    ) as span:
        matter_context = _scoped_matter_context(
            tenant_user,
            matter_id=request.matter_id,
            surface_context="core_discovery",
            extra={
                "document_path": sanitize_text(request.document_path, max_length=2000),
                "document_text": sanitize_text(request.document_text, max_length=40_000) if request.document_text else None,
            },
        )
        route = _route_payload(
            moe_route(
                query="Analyze this D.C. legal document for discovery review, risks, facts, and next actions.",
                matter_context=matter_context,
                user_type="solo",
            )
        )
        span["route"] = route
        try:
            result = await asyncio.to_thread(
                run_discovery,
                document_path=sanitize_text(request.document_path, max_length=2000),
                document_text=sanitize_text(request.document_text, max_length=40_000) if request.document_text else None,
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        if request.matter_id:
            result["matter_id"] = request.matter_id
            MATTERS.attach_facts(request.matter_id, result.get("facts", {}), tenant_context=_tenant_context(tenant_user))
            if "premium_billing_hook" in result:
                MATTERS.attach_billing_event(
                    request.matter_id,
                    result["premium_billing_hook"],
                    tenant_context=_tenant_context(tenant_user),
                )
        record_security_audit(
            "document_analysis",
            tenant_context=_tenant_context(tenant_user),
            matter_id=request.matter_id,
            category="document",
            metadata={"surface_context": "core_discovery", "fact_count": len(result.get("facts") or {})},
        )
        return _attach_route(result, route, tenant_user, request.matter_id, matter_context, source="discovery")


@app.post("/v1/workspace/discovery/upload")
async def workspace_discovery_upload(
    file: UploadFile = File(...),
    document_text: str | None = Form(None),
    matter_id: str | None = Form(None),
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Upload a PDF document.")

    stored_matter_context = _matter_context(matter_id, tenant_user)

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    content = await file.read()
    document_id = f"doc_{sha256(content or file.filename.encode()).hexdigest()[:24]}"
    safe_name = Path(file.filename).name
    destination = UPLOAD_DIR / f"{document_id}_{safe_name}"
    destination.write_bytes(content)
    matter_context = {
        **stored_matter_context,
        "document_path": str(destination),
        "document_text": document_text,
        "surface_context": "core_discovery_upload",
        "auth_context": _tenant_context(tenant_user),
    }
    if matter_id:
        matter_context["matter_id"] = matter_id
    route = _route_payload(
        moe_route(
            query="Analyze this uploaded D.C. legal document for discovery review, risks, facts, and next actions.",
            matter_context=matter_context,
            user_type="solo",
        )
    )

    try:
        result = await asyncio.to_thread(
            run_discovery,
            document_path=str(destination),
            document_text=document_text,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if matter_id:
        result["matter_id"] = matter_id
        document_metadata = {
            "document_id": document_id,
            "filename": safe_name,
            "uploaded_at": datetime.now(UTC).isoformat(),
            "size": len(content),
            "mime_type": file.content_type or "application/pdf",
            "type": "PDF",
            "status": "Ready",
            "extraction_status": "Ready",
            "extraction_progress": 100,
            "storage_path": str(destination),
            "facts_extracted": len(result.get("facts") or {}),
            "citation_count": len(result.get("citations") or []),
            "surface_context": "core_discovery_upload",
            "source": "workspace_discovery_upload",
        }
        result["document"] = document_metadata
        attach_matter_document(matter_id, document_metadata, tenant_context=_tenant_context(tenant_user))
        MATTERS.attach_facts(matter_id, result.get("facts", {}), tenant_context=_tenant_context(tenant_user))
        if "premium_billing_hook" in result:
            MATTERS.attach_billing_event(matter_id, result["premium_billing_hook"], tenant_context=_tenant_context(tenant_user))
    return _attach_route(result, route, tenant_user, matter_id, matter_context, source="discovery_upload")


@app.post("/v1/workspace/draft")
async def workspace_draft(
    request: DraftRequest,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    with trace_span(
        "workspace_draft_endpoint",
        request.surface_context,
        "drafting",
        matter_reference=request.matter_id,
        metadata=_auth_metadata(tenant_user),
    ) as span:
        matter_context = _scoped_matter_context(
            tenant_user,
            matter_id=request.matter_id,
            surface_context=request.surface_context,
            extra={
                "facts": sanitize_payload(request.facts),
                "draft_type": request.draft_type,
                "requested_relief": sanitize_text(request.requested_relief) if request.requested_relief else None,
            },
        )
        route = _route_payload(
            moe_route(
                query=sanitize_text(request.requested_relief or request.draft_type, max_length=8000),
                matter_context=matter_context,
                user_type=request.user_type,
            )
        )
        span["route"] = route
        try:
            result = await asyncio.to_thread(
                draft_from_facts,
                facts=sanitize_payload(request.facts),
                draft_type=request.draft_type,
                target_court=request.target_court,
                requested_relief=request.requested_relief,
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        retrieval = retrieve_dc_knowledge(
            query=sanitize_text(f"{request.draft_type} {request.requested_relief or ''}".strip(), max_length=8000),
            matter_context=matter_context,
            top_k=4,
            route=route,
            agentic=True,
        )
        fallback_draft = str(result.get("draft") or result.get("content") or "")
        llm_draft = generate_workspace_draft(
            facts=sanitize_payload(request.facts),
            draft_type=request.draft_type,
            target_court=request.target_court,
            requested_relief=request.requested_relief,
            matter_context=matter_context,
            retrieval=retrieval,
            route=route,
            fallback=fallback_draft,
        )
        result["draft"] = llm_draft.content
        result["rag"] = retrieval
        result["llm"] = llm_draft.to_dict()

        if request.matter_id:
            result["matter_id"] = request.matter_id
            MATTERS.attach_draft(request.matter_id, result, tenant_context=_tenant_context(tenant_user))
            if "premium_billing_hook" in result:
                MATTERS.attach_billing_event(
                    request.matter_id,
                    result["premium_billing_hook"],
                    tenant_context=_tenant_context(tenant_user),
                )
        record_security_audit(
            "document_generation",
            tenant_context=_tenant_context(tenant_user),
            matter_id=request.matter_id,
            category="document",
            metadata={
                "draft_type": request.draft_type,
                "route_expert": route.get("expert"),
                "used_llm": llm_draft.used_llm,
                "estimated_cost_usd": llm_draft.estimated_cost_usd,
            },
        )
        return _attach_route(result, route, tenant_user, request.matter_id, matter_context, source="drafting")
