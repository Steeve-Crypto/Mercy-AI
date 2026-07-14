"""One-shot: capture a real persisted LARS job status payload for verification evidence."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from unittest.mock import patch

# Prefer repo root over scripts/ so root monitoring.py is not shadowed by scripts/monitoring.py.
_ROOT = Path(__file__).resolve().parents[1]
_scripts = str(Path(__file__).resolve().parent)
if _scripts in sys.path:
    sys.path.remove(_scripts)
sys.path.insert(0, str(_ROOT))

os.environ.setdefault("MERCY_ENV", "local")
os.environ.setdefault("MERCY_AUTH_MODE", "dev")

from lars.store import reset_memory_store_for_tests

reset_memory_store_for_tests()

out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("alts-real-state.json")

with patch("lars.store.persistent_storage_configured", return_value=False), patch(
    "lars.store.local_memory_fallback_allowed", return_value=True
), patch("lars.runtime.execute_agent_task") as execute_mock, patch(
    "lars.runtime.retrieve_dc_knowledge"
) as rag_mock, patch("lars.runtime.moe_route") as route_mock, patch(
    "lars.runtime.schedule_background_run", return_value={"scheduled": False, "reason": "evidence"}
):
    route_mock.return_value.to_dict.return_value = {
        "expert": "research",
        "confidence": 0.91,
        "execute": True,
        "guardrail_status": "warn",
        "citations": [],
        "route_mode": "dc_research",
    }
    execute_mock.return_value = {
        "selected_agent": "ResearchAgent",
        "selected_expert": "research",
        "agent_result": {"content": "D.C. notice analysis requiring attorney review.", "status": "warn"},
        "llm": {"estimated_cost_usd": 0.02},
        "citations": [{"label": "D.C. Code § 2-510"}],
    }
    rag_mock.return_value = {
        "results": [
            {
                "summary": "Administrative appeal notice authority (redacted corpus excerpt).",
                "citation": {"label": "D.C. Code § 2-510", "verification_status": "candidate"},
                "jurisdiction": "District of Columbia",
                "authority_type": "statute",
            }
        ]
    }
    from lars.runtime import create_and_start_job, get_job, protect_artifact, status_payload
    from lars.store import save_job

    created = create_and_start_job(
        {
            "query": "Is mailed notice sufficient for D.C. administrative appeal timelines?",
            "matter_id": "matter-evidence-1",
            "factual_assumptions": ["Notice was mailed to the address of record."],
            "deliverable_type": "research_memorandum",
            "jurisdiction": "District of Columbia",
            "auto_approve_assignment": True,
            "max_model_calls": 8,
        },
        tenant_id="tenant-evidence",
        user_id="attorney-evidence",
        firm_id="firm-evidence",
    )
    job_id = created["job"]["job_id"]
    job = get_job(job_id, tenant_id="tenant-evidence")
    assert job is not None
    job.artifacts.append(
        {
            "artifact_id": "art_ev_1",
            "deliverable_type": "research_memorandum",
            "title": "Draft research memorandum",
            "content_markdown": "ATTORNEY EDITED INTRO — protected sample language.",
            "version": 1,
            "created_at": job.updated_at,
        }
    )
    save_job(job)
    protect_artifact(
        job_id,
        tenant_id="tenant-evidence",
        user_id="attorney-evidence",
        artifact_id="art_ev_1",
        protected=True,
        notes="Protect intro",
    )
    payload = status_payload(get_job(job_id, tenant_id="tenant-evidence"))
    nodes = payload["job"].get("nodes") or {}
    slim = {
        "mode": payload.get("mode"),
        "lars_version": payload.get("lars_version"),
        "alts_version": payload.get("alts_version"),
        "phase": payload.get("phase"),
        "job": {
            "job_id": payload["job"]["job_id"],
            "tenant_id": payload["job"]["tenant_id"],
            "user_id": payload["job"]["user_id"],
            "firm_id": payload["job"].get("firm_id"),
            "status": payload["job"]["status"],
            "assignment": {
                "matter_id": payload["job"]["assignment"].get("matter_id"),
                "query": payload["job"]["assignment"].get("query"),
                "jurisdiction": payload["job"]["assignment"].get("jurisdiction"),
                "deliverable_type": payload["job"]["assignment"].get("deliverable_type"),
            },
            "root_node_id": payload["job"].get("root_node_id"),
            "node_count": len(nodes),
            "node_types": sorted({n.get("node_type") for n in nodes.values()}),
            "gate_count": len(payload["job"].get("gates") or []),
            "gates_sample": [
                {"gate_type": g.get("gate_type"), "status": g.get("status"), "decided_by": g.get("decided_by")}
                for g in (payload["job"].get("gates") or [])[:4]
            ],
            "authority_count": len(payload["job"].get("authorities") or {}),
            "authorities_sample": list((payload["job"].get("authorities") or {}).values())[:2],
            "artifact_count": len(payload["job"].get("artifacts") or []),
            "artifacts_sample": [
                {
                    "artifact_id": a.get("artifact_id"),
                    "title": a.get("title"),
                    "version": a.get("version"),
                    "protection": a.get("protection"),
                    "content_markdown_preview": (a.get("content_markdown") or "")[:120],
                }
                for a in (payload["job"].get("artifacts") or [])[:2]
            ],
            "event_count": len(payload["job"].get("events") or []),
            "events_sample": (payload["job"].get("events") or [])[:5],
            "last_action": payload["job"].get("last_action"),
        },
        "tree": {
            "root_node_id": (payload.get("tree") or {}).get("root_node_id"),
            "node_count": (payload.get("tree") or {}).get("node_count"),
            "nodes_sample": ((payload.get("tree") or {}).get("nodes") or [])[:5],
        },
        "pending_gates": payload.get("pending_gates"),
        "source": "status_payload(get_job(...)) after create_and_start_job — real persisted store job (redacted/slimmed)",
    }
    out_path.write_text(json.dumps(slim, indent=2, default=str), encoding="utf-8")
    print(f"wrote {out_path} job_id={job_id} nodes={slim['job']['node_count']} events={slim['job']['event_count']}")
