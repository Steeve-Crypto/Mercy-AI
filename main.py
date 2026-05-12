from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from agent_network import execute_agent_task, mcp_skill_manifest
from client_intake_flow import run_full_intake_flow
from dc_knowledge_rag import rag_backend_status, retrieve_dc_knowledge
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from bridge import draft_from_facts, run_discovery
from auth_context import TenantUser, get_current_tenant_user
from dc_guardrails import DCGuardrailMiddleware
from legal_task_router import moe_route
from mercy_context import (
    MATTERS,
    CORE_NAME,
    MatterTenantAccessError,
    PRODUCT_NAME,
    build_billing_report,
    get_matter_context,
    product_capabilities,
    update_matter_context,
)
from observability import configure_langsmith_environment, observability_dashboard, trace_event, trace_span
from ragas_eval import DEFAULT_DATASET_PATH, DEFAULT_REPORT_PATH, run_ragas_evaluation
from response_envelope import attach_response_envelope, build_response_envelope
from system_prompts import CLERK_OS_VERSION, DC_CLERK_OPERATING_SYSTEM


ROOT_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = ROOT_DIR / "legal_discovery_ai" / "data" / "uploads"
DASHBOARD_DIR = ROOT_DIR / "standalone_platform"
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "https://127.0.0.1:3000",
        "https://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(DCGuardrailMiddleware)

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


def _tenant_context(tenant_user: TenantUser) -> dict[str, Any]:
    return tenant_user.to_context()


def _auth_metadata(tenant_user: TenantUser) -> dict[str, Any]:
    return {
        "tenant_id": tenant_user.tenant_id,
        "user_id": tenant_user.user_id,
        "auth_mode": tenant_user.auth_mode,
    }


def _matter_context(matter_id: str | None, tenant_user: TenantUser) -> dict[str, Any]:
    try:
        return get_matter_context(matter_id, tenant_context=_tenant_context(tenant_user)) or {}
    except MatterTenantAccessError as exc:
        raise HTTPException(status_code=403, detail="Matter belongs to a different tenant.") from exc


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
            raise HTTPException(status_code=403, detail="Matter belongs to a different tenant.") from exc
    return wrapped


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "product": PRODUCT_NAME, "clerk_os_version": CLERK_OS_VERSION}


@app.get("/v1/product/capabilities")
async def capabilities(tenant_user: TenantUser = Depends(get_current_tenant_user)) -> dict[str, Any]:
    return product_capabilities()


@app.post("/v1/matters")
async def create_matter(
    request: MatterCreateRequest,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    tier = request.tier if request.tier in {"free", "premium"} else "free"
    return MATTERS.create(
        name=request.name,
        tier=tier,
        client_id=request.client_id,
        client_name=request.client_name,
        matter_type=request.matter_type,
        tenant_context=_tenant_context(tenant_user),
    )


@app.post("/v1/matter/intake")
async def matter_intake(
    request: MatterIntakeRequest,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    with trace_span("matter_intake_endpoint", request.surface_context, "matter_context", metadata=_auth_metadata(tenant_user)) as span:
        payload = request.dict(exclude_none=True)
        payload["source"] = request.surface_context
        try:
            updated_context = update_matter_context(payload, tenant_context=_tenant_context(tenant_user))
        except MatterTenantAccessError as exc:
            raise HTTPException(status_code=403, detail="Matter belongs to a different tenant.") from exc
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
        payload = request.dict(exclude_none=True)
        payload["surface_context"] = request.surface_context
        payload["auth_context"] = _tenant_context(tenant_user)
        try:
            result = run_full_intake_flow(payload)
        except MatterTenantAccessError as exc:
            raise HTTPException(status_code=403, detail="Matter belongs to a different tenant.") from exc
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
    return MATTERS.list(tenant_context=_tenant_context(tenant_user))


@app.get("/v1/matters/{matter_id}")
async def get_matter(
    matter_id: str,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    try:
        matter = MATTERS.get(matter_id, tenant_context=_tenant_context(tenant_user))
    except MatterTenantAccessError as exc:
        raise HTTPException(status_code=403, detail="Matter belongs to a different tenant.") from exc
    if not matter:
        raise HTTPException(status_code=404, detail="Matter not found.")
    return matter


@app.get("/v1/matters/{matter_id}/billing-report")
async def matter_billing_report(
    matter_id: str,
    tenant_user: TenantUser = Depends(get_current_tenant_user),
) -> dict[str, Any]:
    try:
        matter = MATTERS.get(matter_id, tenant_context=_tenant_context(tenant_user))
    except MatterTenantAccessError as exc:
        raise HTTPException(status_code=403, detail="Matter belongs to a different tenant.") from exc
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
async def root() -> FileResponse:
    return FileResponse(DASHBOARD_DIR / "index.html")


@app.get("/dashboard")
async def dashboard() -> FileResponse:
    return FileResponse(DASHBOARD_DIR / "index.html")


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
        context = {
            **_matter_context(request.matter_id, tenant_user),
            **request.matter_context,
            "surface_context": request.surface_context,
            "auth_context": _tenant_context(tenant_user),
        }
        if request.selected_text:
            context["selected_text"] = request.selected_text
        if request.document_text:
            context["document_text"] = request.document_text
        if request.matter_id:
            context["matter_id"] = request.matter_id

        decision = moe_route(
            query=request.query,
            matter_context=context,
            user_type=request.user_type,
        )
        route = _route_payload(decision)
        span["route"] = route
        if request.matter_id:
            try:
                MATTERS.attach_route(request.matter_id, route, tenant_context=_tenant_context(tenant_user))
            except MatterTenantAccessError as exc:
                raise HTTPException(status_code=403, detail="Matter belongs to a different tenant.") from exc
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
        context = {
            **_matter_context(request.matter_id, tenant_user),
            **request.matter_context,
            "surface_context": request.surface_context,
            "auth_context": _tenant_context(tenant_user),
        }
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
                query=request.query,
                matter_context=context,
                user_type=request.user_type,
            )
        )
        retrieval = retrieve_dc_knowledge(
            query=request.query,
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
        return _attach_route(payload, route, tenant_user, request.matter_id, context, source="rag_retrieve")


@app.get("/v1/rag/status")
async def rag_status(tenant_user: TenantUser = Depends(get_current_tenant_user)) -> dict[str, Any]:
    context = {"surface_context": "core_rag_status", "auth_context": _tenant_context(tenant_user)}
    trace_event(name="rag_status_view", surface_context="core_rag_status", category="rag", metadata=_auth_metadata(tenant_user))
    return rag_backend_status(context)


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
        context = {
            **_matter_context(request.matter_id, tenant_user),
            **request.matter_context,
            "surface_context": request.surface_context,
            "auth_context": _tenant_context(tenant_user),
        }
        if request.matter_id:
            context["matter_id"] = request.matter_id
        route = _route_payload(moe_route(request.task, context, user_type=request.user_type))
        params = {
            **request.params,
            "surface_context": request.surface_context,
            "auth_context": _tenant_context(tenant_user),
        }
        if request.matter_id:
            params.setdefault("matter_id", request.matter_id)
        result = execute_agent_task(
            task=request.task,
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
        matter_context = {
            **_matter_context(request.matter_id, tenant_user),
            "matter_id": request.matter_id,
            "document_path": request.document_path,
            "document_text": request.document_text,
            "surface_context": "core_discovery",
            "auth_context": _tenant_context(tenant_user),
        }
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
                document_path=request.document_path,
                document_text=request.document_text,
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

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    destination = UPLOAD_DIR / Path(file.filename).name
    destination.write_bytes(await file.read())
    matter_context = {
        **_matter_context(matter_id, tenant_user),
        "matter_id": matter_id,
        "document_path": str(destination),
        "document_text": document_text,
        "surface_context": "core_discovery_upload",
        "auth_context": _tenant_context(tenant_user),
    }
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
        matter_context = {
            **_matter_context(request.matter_id, tenant_user),
            "matter_id": request.matter_id,
            "facts": request.facts,
            "draft_type": request.draft_type,
            "requested_relief": request.requested_relief,
            "surface_context": request.surface_context,
            "auth_context": _tenant_context(tenant_user),
        }
        route = _route_payload(
            moe_route(
                query=request.requested_relief or request.draft_type,
                matter_context=matter_context,
                user_type=request.user_type,
            )
        )
        span["route"] = route
        try:
            result = await asyncio.to_thread(
                draft_from_facts,
                facts=request.facts,
                draft_type=request.draft_type,
                target_court=request.target_court,
                requested_relief=request.requested_relief,
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        if request.matter_id:
            result["matter_id"] = request.matter_id
            MATTERS.attach_draft(request.matter_id, result, tenant_context=_tenant_context(tenant_user))
            if "premium_billing_hook" in result:
                MATTERS.attach_billing_event(
                    request.matter_id,
                    result["premium_billing_hook"],
                    tenant_context=_tenant_context(tenant_user),
                )
        return _attach_route(result, route, tenant_user, request.matter_id, matter_context, source="drafting")
