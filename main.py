from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from bridge import draft_from_facts, run_discovery
from dc_guardrails import DCGuardrailMiddleware
from mercy_context import MATTERS, CORE_NAME, PRODUCT_NAME, build_billing_report, product_capabilities
from system_prompts import CLERK_OS_VERSION, DC_CLERK_OPERATING_SYSTEM


ROOT_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = ROOT_DIR / "legal_discovery_ai" / "data" / "uploads"
DASHBOARD_DIR = ROOT_DIR / "standalone_platform"
WORD_PLUGIN_DIR = ROOT_DIR / "word_plugin"

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


class MatterCreateRequest(BaseModel):
    name: str = Field(..., description="Matter or case name.")
    tier: str = Field("free", description="free or premium.")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "product": PRODUCT_NAME, "clerk_os_version": CLERK_OS_VERSION}


@app.get("/v1/product/capabilities")
async def capabilities() -> dict[str, Any]:
    return product_capabilities()


@app.post("/v1/matters")
async def create_matter(request: MatterCreateRequest) -> dict[str, Any]:
    tier = request.tier if request.tier in {"free", "premium"} else "free"
    return MATTERS.create(name=request.name, tier=tier)


@app.get("/v1/matters")
async def list_matters() -> list[dict[str, Any]]:
    return MATTERS.list()


@app.get("/v1/matters/{matter_id}")
async def get_matter(matter_id: str) -> dict[str, Any]:
    matter = MATTERS.get(matter_id)
    if not matter:
        raise HTTPException(status_code=404, detail="Matter not found.")
    return matter


@app.get("/v1/matters/{matter_id}/billing-report")
async def matter_billing_report(matter_id: str) -> dict[str, Any]:
    matter = MATTERS.get(matter_id)
    if not matter:
        raise HTTPException(status_code=404, detail="Matter not found.")
    return build_billing_report(matter)


@app.get("/")
async def root() -> FileResponse:
    return FileResponse(DASHBOARD_DIR / "index.html")


@app.get("/dashboard")
async def dashboard() -> FileResponse:
    return FileResponse(DASHBOARD_DIR / "index.html")


@app.get("/v1/workspace/clerk-os")
async def clerk_os() -> dict[str, Any]:
    return {
        "clerk_os_version": CLERK_OS_VERSION,
        "system_prompt": DC_CLERK_OPERATING_SYSTEM.strip(),
        "human_review_required": True,
    }


@app.post("/v1/workspace/discovery")
async def workspace_discovery(request: DiscoveryRequest) -> dict[str, Any]:
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
        MATTERS.attach_facts(request.matter_id, result.get("facts", {}))
        if "premium_billing_hook" in result:
            MATTERS.attach_billing_event(request.matter_id, result["premium_billing_hook"])
    return result


@app.post("/v1/workspace/discovery/upload")
async def workspace_discovery_upload(
    file: UploadFile = File(...),
    document_text: str | None = Form(None),
    matter_id: str | None = Form(None),
) -> dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Upload a PDF document.")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    destination = UPLOAD_DIR / Path(file.filename).name
    destination.write_bytes(await file.read())

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
        MATTERS.attach_facts(matter_id, result.get("facts", {}))
        if "premium_billing_hook" in result:
            MATTERS.attach_billing_event(matter_id, result["premium_billing_hook"])
    return result


@app.post("/v1/workspace/draft")
async def workspace_draft(request: DraftRequest) -> dict[str, Any]:
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
        MATTERS.attach_draft(request.matter_id, result)
        if "premium_billing_hook" in result:
            MATTERS.attach_billing_event(request.matter_id, result["premium_billing_hook"])
    return result
