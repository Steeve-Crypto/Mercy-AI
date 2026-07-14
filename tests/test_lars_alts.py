from __future__ import annotations

import os
import unittest
from unittest.mock import patch


os.environ.setdefault("MERCY_ENV", "local")
os.environ.setdefault("MERCY_AUTH_MODE", "dev")


def _reset_lars_storage() -> None:
    from lars.store import reset_memory_store_for_tests

    reset_memory_store_for_tests()
    try:
        from mercy_storage import persistent_storage_configured, session_scope

        if persistent_storage_configured():
            from sqlalchemy import text

            with session_scope() as session:
                session.execute(text("DELETE FROM mercy_lars_jobs"))
    except Exception:
        # Table may not exist yet; memory reset is enough for local fallback paths.
        pass


class LarsAltsUnitTests(unittest.TestCase):
    def setUp(self) -> None:
        _reset_lars_storage()

    def test_assignment_compiler_requires_clarification_without_scope(self) -> None:
        from lars.assignment import compile_legal_assignment, validate_assignment

        assignment = compile_legal_assignment(
            {"query": ""},
            tenant_id="tenant-a",
            user_id="user-a",
        )
        validation = validate_assignment(assignment)
        self.assertFalse(validation["valid"])
        self.assertTrue(assignment.clarification_required)

    def test_assignment_compiler_builds_dc_research_memo(self) -> None:
        from lars.assignment import compile_legal_assignment, validate_assignment

        assignment = compile_legal_assignment(
            {
                "query": "Is this limitation of liability enforceable under D.C. law?",
                "matter_id": "matter-1",
                "deliverable_type": "research_memorandum",
                "factual_assumptions": ["The clause is in a signed consumer agreement."],
                "jurisdiction": "District of Columbia",
            },
            tenant_id="tenant-a",
            user_id="user-a",
            firm_id=None,
        )
        validation = validate_assignment(assignment)
        self.assertTrue(validation["valid"])
        self.assertEqual(assignment.deliverable_type, "research_memorandum")
        self.assertIn("District of Columbia", assignment.jurisdiction)
        self.assertTrue(assignment.require_adverse_authority_review)

    def test_job_lifecycle_pause_resume_cancel_and_tenant_isolation(self) -> None:
        from lars.runtime import cancel_job, create_and_start_job, get_job, list_jobs, pause_job, resume_job

        with patch("lars.store.persistent_storage_configured", return_value=False), patch(
            "lars.store.local_memory_fallback_allowed", return_value=True
        ), patch("lars.runtime.execute_agent_task") as execute_mock, patch(
            "lars.runtime.retrieve_dc_knowledge"
        ) as rag_mock, patch("lars.runtime.moe_route") as route_mock:
            route_mock.return_value.to_dict.return_value = {
                "expert": "research",
                "confidence": 0.9,
                "execute": True,
                "guardrail_status": "warn",
                "citations": [],
                "route_mode": "dc_research",
            }
            execute_mock.return_value = {
                "selected_agent": "ResearchAgent",
                "selected_expert": "research",
                "agent_result": {"content": "D.C. authority candidate analysis requiring attorney review.", "status": "warn"},
                "llm": {"estimated_cost_usd": 0.01},
                "citations": [{"label": "D.C. Code § 28-3904"}],
            }
            rag_mock.return_value = {
                "results": [
                    {
                        "summary": "Candidate D.C. consumer protection authority.",
                        "citation": {"label": "D.C. Code § 28-3904", "verification_status": "candidate"},
                        "jurisdiction": "District of Columbia",
                        "authority_type": "statute",
                    }
                ]
            }
            created = create_and_start_job(
                {
                    "query": "Analyze enforceability of a limitation clause under D.C. law.",
                    "matter_id": "matter-1",
                    "factual_assumptions": ["Signed consumer contract includes the clause."],
                    "auto_approve_assignment": True,
                    "max_model_calls": 12,
                    "max_steps_per_tick": 3,
                },
                tenant_id="tenant-a",
                user_id="user-a",
            )
            self.assertEqual(created["mode"], "lars_job")
            job_id = created["job"]["job_id"]
            job = get_job(job_id, tenant_id="tenant-a")
            self.assertIsNotNone(job)
            assert job is not None
            self.assertGreaterEqual(len(job.nodes), 1)
            self.assertEqual(get_job(job_id, tenant_id="tenant-b"), None)

            paused = pause_job(job_id, tenant_id="tenant-a")
            self.assertEqual(paused["job"]["status"], "paused")
            resumed = resume_job(job_id, tenant_id="tenant-a", steps=2)
            self.assertIn(
                resumed["job"]["status"],
                {"running", "waiting_attorney", "verifying", "completed", "paused", "blocked", "failed"},
            )
            canceled = cancel_job(job_id, tenant_id="tenant-a")
            self.assertEqual(canceled["job"]["status"], "canceled")
            listed = list_jobs(tenant_id="tenant-a")
            self.assertEqual(len(listed), 1)

    def test_gate_approval_and_budget_fields_present(self) -> None:
        from lars.runtime import approve_gate, create_and_start_job, get_job

        with patch("lars.store.persistent_storage_configured", return_value=False), patch(
            "lars.store.local_memory_fallback_allowed", return_value=True
        ):
            created = create_and_start_job(
                {
                    "query": "Draft a D.C. research outline on notice requirements.",
                    "matter_id": "matter-2",
                    "factual_assumptions": ["Administrative notice was mailed."],
                    "auto_approve_assignment": False,
                },
                tenant_id="tenant-a",
                user_id="user-a",
            )
            job_id = created["job"]["job_id"]
            job = get_job(job_id, tenant_id="tenant-a")
            assert job is not None
            self.assertEqual(job.status, "waiting_attorney")
            gate = next(gate for gate in job.gates if gate.gate_type == "assignment_approval")
            with patch("lars.runtime.execute_agent_task") as execute_mock, patch(
                "lars.runtime.retrieve_dc_knowledge"
            ) as rag_mock, patch("lars.runtime.moe_route") as route_mock:
                route_mock.return_value.to_dict.return_value = {
                    "expert": "research",
                    "confidence": 0.88,
                    "execute": True,
                    "guardrail_status": "warn",
                    "citations": [],
                    "route_mode": "dc_research",
                }
                execute_mock.return_value = {
                    "selected_agent": "ResearchAgent",
                    "agent_result": {"content": "Outline with citation placeholders.", "status": "warn"},
                    "llm": {"estimated_cost_usd": 0.01},
                }
                rag_mock.return_value = {"results": []}
                approved = approve_gate(
                    job_id,
                    tenant_id="tenant-a",
                    gate_id=gate.gate_id,
                    decision="approved",
                    user_id="user-a",
                    continue_steps=2,
                )
            self.assertTrue(
                any(g["gate_id"] == gate.gate_id and g["status"] == "approved" for g in approved["job"]["gates"])
            )
            self.assertIn("budgets", approved["job"])
            self.assertIn("controller", approved)

    def test_api_lars_endpoints_are_tenant_scoped(self) -> None:
        from fastapi.testclient import TestClient

        with patch("lars.store.persistent_storage_configured", return_value=False), patch(
            "lars.store.local_memory_fallback_allowed", return_value=True
        ):
            from main import app

            client = TestClient(app)
            headers_a = {
                "Authorization": "Bearer test-token",
                "X-Mercy-Tenant-Id": "tenant-a",
                "X-Mercy-User-Id": "user-a",
                "X-Mercy-Roles": "attorney",
            }
            headers_b = {
                "Authorization": "Bearer test-token",
                "X-Mercy-Tenant-Id": "tenant-b",
                "X-Mercy-User-Id": "user-b",
                "X-Mercy-Roles": "attorney",
            }
            with patch("lars.runtime.execute_agent_task") as execute_mock, patch(
                "lars.runtime.retrieve_dc_knowledge"
            ) as rag_mock, patch("lars.runtime.moe_route") as route_mock:
                route_mock.return_value.to_dict.return_value = {
                    "expert": "research",
                    "confidence": 0.9,
                    "execute": True,
                    "guardrail_status": "warn",
                    "citations": [],
                    "route_mode": "dc_research",
                }
                execute_mock.return_value = {
                    "selected_agent": "ResearchAgent",
                    "agent_result": {"content": "API path analysis.", "status": "warn"},
                    "llm": {"estimated_cost_usd": 0.01},
                }
                rag_mock.return_value = {"results": []}
                create = client.post(
                    "/v1/lars/jobs",
                    headers=headers_a,
                    json={
                        "query": "Research D.C. notice requirements for administrative appeals.",
                        "matter_id": "matter-api",
                        "factual_assumptions": ["Notice was mailed to the listed address."],
                        "auto_approve_assignment": True,
                        "max_model_calls": 8,
                    },
                )
            self.assertIn(create.status_code, {200, 201})
            payload = create.json()
            job_id = payload["job"]["job_id"]
            denied = client.get(f"/v1/lars/jobs/{job_id}", headers=headers_b)
            self.assertEqual(denied.status_code, 404)
            allowed = client.get(f"/v1/lars/jobs/{job_id}", headers=headers_a)
            self.assertEqual(allowed.status_code, 200)
            status = client.get("/v1/lars/status", headers=headers_a)
            self.assertEqual(status.status_code, 200)
            self.assertEqual(status.json()["lars_version"], "mercy-lars-1.0")
            self.assertIn("depth_budget_profiles", status.json())
            self.assertIn("tree", allowed.json())
            self.assertIn("phase", allowed.json())
            self.assertIn("artifacts_catalog", allowed.json())

    def test_list_jobs_matter_filter_and_source_usage(self) -> None:
        from lars.runtime import create_and_start_job, get_source_usage, list_jobs
        from lars.workspace import source_usage_trace

        with patch("lars.store.persistent_storage_configured", return_value=False), patch(
            "lars.store.local_memory_fallback_allowed", return_value=True
        ), patch("lars.runtime.execute_agent_task") as execute_mock, patch(
            "lars.runtime.retrieve_dc_knowledge"
        ) as rag_mock, patch("lars.runtime.moe_route") as route_mock:
            route_mock.return_value.to_dict.return_value = {
                "expert": "research",
                "confidence": 0.9,
                "execute": True,
                "guardrail_status": "warn",
                "citations": [],
                "route_mode": "dc_research",
            }
            execute_mock.return_value = {
                "selected_agent": "ResearchAgent",
                "selected_expert": "research",
                "agent_result": {"content": "Matter-scoped analysis.", "status": "warn"},
                "llm": {"estimated_cost_usd": 0.01},
                "citations": [{"label": "D.C. Code § 2-510"}],
            }
            rag_mock.return_value = {
                "results": [
                    {
                        "summary": "Administrative appeal notice authority.",
                        "citation": {"label": "D.C. Code § 2-510", "verification_status": "candidate"},
                        "jurisdiction": "District of Columbia",
                        "authority_type": "statute",
                    }
                ]
            }
            created = create_and_start_job(
                {
                    "query": "Research D.C. administrative appeal notice.",
                    "matter_id": "matter-filter-1",
                    "factual_assumptions": ["Notice was mailed."],
                    "selected_document_ids": ["doc-1"],
                },
                tenant_id="tenant-a",
                user_id="user-a",
                auto_approve_assignment=True,
            )
            job_id = created["job"]["job_id"]
            filtered = list_jobs(tenant_id="tenant-a", matter_id="matter-filter-1")
            self.assertTrue(any(job.job_id == job_id for job in filtered))
            empty = list_jobs(tenant_id="tenant-a", matter_id="matter-other")
            self.assertFalse(any(job.job_id == job_id for job in empty))
            usage = get_source_usage(job_id, tenant_id="tenant-a")
            self.assertEqual(usage["job_id"], job_id)
            self.assertIn("sources", usage)
            self.assertIn("source_scope", usage)
            self.assertEqual(usage["source_scope"]["selected_document_ids"], ["doc-1"])
            # Empty job still produces a structured trace payload.
            from lars.store import get_job as store_get_job

            job = store_get_job(job_id, tenant_id="tenant-a")
            assert job is not None
            trace = source_usage_trace(job)
            self.assertEqual(trace["matter_id"], "matter-filter-1")

    def test_permitted_actions_include_synthesize_and_complete(self) -> None:
        from lars.runtime import apply_node_action, create_and_start_job, get_job, get_node
        from lars.workspace import permitted_node_actions

        with patch("lars.store.persistent_storage_configured", return_value=False), patch(
            "lars.store.local_memory_fallback_allowed", return_value=True
        ), patch("lars.runtime.execute_agent_task") as execute_mock, patch(
            "lars.runtime.retrieve_dc_knowledge"
        ) as rag_mock, patch("lars.runtime.moe_route") as route_mock, patch(
            "lars.runtime.schedule_background_run", return_value={"scheduled": False, "reason": "test_stub"}
        ):
            route_mock.return_value.to_dict.return_value = {
                "expert": "research",
                "confidence": 0.9,
                "execute": True,
                "guardrail_status": "warn",
                "citations": [],
            }
            execute_mock.return_value = {
                "selected_agent": "ResearchAgent",
                "agent_result": {"content": "Synthesis-ready analysis.", "status": "warn"},
                "llm": {"estimated_cost_usd": 0.01},
            }
            rag_mock.return_value = {"results": []}
            created = create_and_start_job(
                {
                    "query": "Complete ALTS action surface for D.C. research memo.",
                    "matter_id": "matter-actions",
                    "factual_assumptions": ["Record complete enough for synthesis."],
                    "auto_approve_assignment": True,
                    "max_model_calls": 10,
                },
                tenant_id="tenant-actions",
                user_id="user-actions",
            )
            job_id = created["job"]["job_id"]
            job = get_job(job_id, tenant_id="tenant-actions")
            assert job is not None
            root_id = job.root_node_id
            permitted = {item["action"] for item in permitted_node_actions(job, root_id)}
            for required in (
                "EXPAND_WIDER",
                "DEEPEN",
                "CHALLENGE",
                "REVISE",
                "MERGE",
                "PRUNE",
                "PAUSE_FOR_ATTORNEY",
                "SYNTHESIZE",
                "VERIFY",
                "COMPLETE",
            ):
                # MERGE only when multiple active branches; others must always be listed when non-terminal.
                if required == "MERGE" and required not in permitted:
                    continue
                self.assertIn(required, permitted, f"missing attorney action {required}")

            detail = get_node(job_id, tenant_id="tenant-actions", node_id=root_id)
            self.assertIn("parents", detail)
            self.assertIn("children", detail)
            detail_actions = {item["action"] for item in detail.get("available_actions") or []}
            self.assertIn("SYNTHESIZE", detail_actions)
            self.assertIn("COMPLETE", detail_actions)

            synthesized = apply_node_action(
                job_id,
                tenant_id="tenant-actions",
                user_id="user-actions",
                node_id=root_id,
                action="SYNTHESIZE",
                notes="Attorney-directed synthesis",
            )
            self.assertEqual(synthesized["job"]["last_action"], "SYNTHESIZE")
            # COMPLETE must not raise action_not_permitted / unsupported_action
            completed = apply_node_action(
                job_id,
                tenant_id="tenant-actions",
                user_id="user-actions",
                node_id=root_id,
                action="COMPLETE",
                notes="Attorney-directed complete",
            )
            self.assertIn(completed["job"]["status"], {"completed", "waiting_attorney", "running", "verifying"})
            self.assertEqual(completed["job"]["last_action"], "COMPLETE")

    def test_depth_budget_profiles_map_to_real_limits(self) -> None:
        from lars.assignment import compile_legal_assignment, depth_budget_profiles

        profiles = depth_budget_profiles()
        self.assertIn("focused", profiles)
        self.assertIn("deep", profiles)
        focused = compile_legal_assignment(
            {
                "query": "Focused D.C. research on notice.",
                "matter_id": "m1",
                "factual_assumptions": ["Notice mailed."],
                "research_depth": "focused",
            },
            tenant_id="tenant-a",
            user_id="user-a",
        )
        deep = compile_legal_assignment(
            {
                "query": "Deep D.C. research on notice.",
                "matter_id": "m1",
                "factual_assumptions": ["Notice mailed."],
                "research_depth": "deep",
            },
            tenant_id="tenant-a",
            user_id="user-a",
        )
        self.assertLess(focused.budgets.max_model_calls, deep.budgets.max_model_calls)
        self.assertLess(focused.budgets.max_duration_seconds, deep.budgets.max_duration_seconds)

    def test_node_action_events_notes_and_office_insert(self) -> None:
        from lars.runtime import (
            add_attorney_note,
            apply_node_action,
            create_and_start_job,
            get_events,
            get_office_insert,
            resolve_contradiction,
        )

        with patch("lars.store.persistent_storage_configured", return_value=False), patch(
            "lars.store.local_memory_fallback_allowed", return_value=True
        ), patch("lars.runtime.execute_agent_task") as execute_mock, patch(
            "lars.runtime.retrieve_dc_knowledge"
        ) as rag_mock, patch("lars.runtime.moe_route") as route_mock:
            route_mock.return_value.to_dict.return_value = {
                "expert": "research",
                "confidence": 0.9,
                "execute": True,
                "guardrail_status": "warn",
                "citations": [],
                "route_mode": "dc_research",
            }
            execute_mock.return_value = {
                "selected_agent": "ResearchAgent",
                "agent_result": {"content": "Node action analysis.", "status": "warn"},
                "llm": {"estimated_cost_usd": 0.01},
            }
            rag_mock.return_value = {
                "results": [
                    {
                        "summary": "Candidate authority.",
                        "citation": {"label": "D.C. Code § 2-510", "verification_status": "candidate"},
                        "jurisdiction": "District of Columbia",
                    }
                ]
            }
            created = create_and_start_job(
                {
                    "query": "Analyze D.C. administrative notice requirements.",
                    "matter_id": "matter-node",
                    "factual_assumptions": ["Notice was mailed."],
                    "auto_approve_assignment": True,
                    "max_model_calls": 16,
                    "max_steps_per_tick": 2,
                },
                tenant_id="tenant-a",
                user_id="user-a",
            )
            job_id = created["job"]["job_id"]
            root_id = created["job"]["root_node_id"]
            acted = apply_node_action(
                job_id,
                tenant_id="tenant-a",
                user_id="user-a",
                node_id=root_id,
                action="DEEPEN",
                notes="Attorney-directed deepen",
            )
            self.assertEqual(acted["mode"], "lars_job")
            self.assertIn("tree", acted)
            noted = add_attorney_note(
                job_id,
                tenant_id="tenant-a",
                user_id="user-a",
                text="Confirm service proof before relying on mailing assumption.",
                node_id=root_id,
            )
            self.assertTrue(any("Confirm service" in str(n.get("text")) for n in noted.get("attorney_notes") or []))
            events = get_events(job_id, tenant_id="tenant-a")
            self.assertGreaterEqual(events["total_events"], 1)
            insert = get_office_insert(job_id, tenant_id="tenant-a", kind="executive_summary")
            self.assertIn("text", insert)
            self.assertTrue(insert["attorney_review_required"])

            # Seed a contradiction and resolve it
            from lars.models import ContradictionRecord, ContradictionType, new_id
            from lars.runtime import get_job
            from lars.store import save_job as store_save

            job = get_job(job_id, tenant_id="tenant-a")
            assert job is not None
            cid = new_id("ctr")
            job.contradictions[cid] = ContradictionRecord(
                contradiction_id=cid,
                contradiction_type=ContradictionType.AUTHORITY_VS_DRAFT.value,
                conflicting_items=[{"type": "draft", "text": "Broad claim"}, {"type": "authority", "text": "Narrow statute"}],
                severity="high",
                impacted_branch_ids=list(job.active_branch_ids[:1]),
                proposed_resolution="Narrow the claim",
                resolution_evidence=[],
                resolution_status="open",
            )
            store_save(job)
            resolved = resolve_contradiction(
                job_id,
                tenant_id="tenant-a",
                user_id="user-a",
                contradiction_id=cid,
                resolution_status="resolved",
                notes="Attorney accepted narrowed formulation",
            )
            self.assertTrue(
                all(
                    item.get("resolution_status") != "open"
                    for item in (resolved.get("unresolved_contradictions") or [])
                    if item.get("contradiction_id") == cid
                )
            )

            # Full action set: preserve both, immaterial, reopen, challenge, revise, research
            for action in (
                "preserve_both",
                "immaterial",
                "reopen",
                "needs_research",
                "challenge_path",
                "revise_conclusion",
                "escalated",
            ):
                # re-open seed for each action that is terminal
                job = get_job(job_id, tenant_id="tenant-a")
                assert job is not None
                job.contradictions[cid].resolution_status = "open"
                store_save(job)
                out = resolve_contradiction(
                    job_id,
                    tenant_id="tenant-a",
                    user_id="user-a",
                    contradiction_id=cid,
                    resolution_status=action,
                    notes=f"Decision: {action}",
                )
                history = (out.get("job") or {}).get("metadata", {}).get("contradiction_resolution_history") or []
                self.assertTrue(
                    any(item.get("requested_action") == action or item.get("resolution_status") in {action, "open"} for item in history),
                    f"expected history entry for {action}",
                )
            # Aliases accepted
            job = get_job(job_id, tenant_id="tenant-a")
            assert job is not None
            job.contradictions[cid].resolution_status = "open"
            store_save(job)
            aliased = resolve_contradiction(
                job_id,
                tenant_id="tenant-a",
                user_id="user-a",
                contradiction_id=cid,
                resolution_status="mark_immaterial",
                notes="Immaterial conflict",
            )
            job_after = aliased.get("job") or {}
            ctr = (job_after.get("contradictions") or {}).get(cid) or {}
            self.assertEqual(ctr.get("resolution_status"), "immaterial")

    def test_gate_revision_request_path(self) -> None:
        from lars.runtime import approve_gate, create_and_start_job, get_job

        with patch("lars.store.persistent_storage_configured", return_value=False), patch(
            "lars.store.local_memory_fallback_allowed", return_value=True
        ), patch("lars.runtime.execute_agent_task") as execute_mock, patch(
            "lars.runtime.retrieve_dc_knowledge"
        ) as rag_mock, patch("lars.runtime.moe_route") as route_mock:
            route_mock.return_value.to_dict.return_value = {
                "expert": "research",
                "confidence": 0.85,
                "execute": True,
                "guardrail_status": "warn",
                "citations": [],
            }
            execute_mock.return_value = {
                "selected_agent": "ResearchAgent",
                "agent_result": {"content": "Revision path.", "status": "warn"},
                "llm": {"estimated_cost_usd": 0.01},
            }
            rag_mock.return_value = {"results": []}
            created = create_and_start_job(
                {
                    "query": "Outline D.C. service issues for revision gate test.",
                    "matter_id": "matter-rev",
                    "factual_assumptions": ["Service affidavit incomplete."],
                    "auto_approve_assignment": False,
                },
                tenant_id="tenant-a",
                user_id="user-a",
            )
            job = get_job(created["job"]["job_id"], tenant_id="tenant-a")
            assert job is not None
            gate = next(g for g in job.gates if g.gate_type == "assignment_approval")
            revised = approve_gate(
                job.job_id,
                tenant_id="tenant-a",
                gate_id=gate.gate_id,
                decision="revision_requested",
                user_id="user-a",
                notes="Clarify service facts before research.",
                continue_steps=1,
            )
            history = revised["job"]["metadata"].get("gate_decision_history") or []
            self.assertTrue(any(item.get("decision") == "revision_requested" for item in history))

    def test_worker_lease_recover_and_out_of_process_claim(self) -> None:
        from lars.runtime import create_and_start_job, get_events, get_job, recover_abandoned_jobs
        from lars.store import save_job
        from lars.worker import claim_job, list_claimable_jobs, process_claimed_job, run_once

        with patch("lars.store.persistent_storage_configured", return_value=False), patch(
            "lars.store.local_memory_fallback_allowed", return_value=True
        ), patch("lars.runtime.execute_agent_task") as execute_mock, patch(
            "lars.runtime.retrieve_dc_knowledge"
        ) as rag_mock, patch("lars.runtime.moe_route") as route_mock, patch(
            "lars.runtime.schedule_background_run", return_value={"scheduled": False, "reason": "test_stub"}
        ):
            route_mock.return_value.to_dict.return_value = {
                "expert": "research",
                "confidence": 0.9,
                "execute": True,
                "guardrail_status": "warn",
                "citations": [],
            }
            execute_mock.return_value = {
                "selected_agent": "ResearchAgent",
                "agent_result": {"content": "Worker lease analysis.", "status": "warn"},
                "llm": {"estimated_cost_usd": 0.01},
            }
            rag_mock.return_value = {"results": []}
            created = create_and_start_job(
                {
                    "query": "Worker lease recovery for D.C. notice research.",
                    "matter_id": "matter-worker",
                    "factual_assumptions": ["Notice mailed."],
                    "auto_approve_assignment": True,
                    "max_model_calls": 6,
                },
                tenant_id="tenant-worker",
                user_id="user-worker",
            )
            job_id = created["job"]["job_id"]
            job = get_job(job_id, tenant_id="tenant-worker")
            assert job is not None
            # Simulate abandoned lease from a dead worker.
            job.status = "running"
            job.metadata["worker_lease"] = {
                "owner_id": "dead-worker-1",
                "acquired_at": "2000-01-01T00:00:00+00:00",
                "heartbeat_at": "2000-01-01T00:00:00+00:00",
                "expires_at": "2000-01-01T00:01:00+00:00",
                "ttl_seconds": 90,
            }
            save_job(job)

            recovered = recover_abandoned_jobs(tenant_id="tenant-worker", limit=20)
            self.assertIn(job_id, recovered["recovered"])

            claimable = list_claimable_jobs(tenant_id="tenant-worker", limit=10)
            self.assertIn(job_id, claimable)
            claim = claim_job(job_id, tenant_id="tenant-worker", owner_id="live-worker-1")
            self.assertTrue(claim["claimed"])
            # Second claim by another owner must fail while lease is live.
            denied = claim_job(job_id, tenant_id="tenant-worker", owner_id="live-worker-2")
            self.assertFalse(denied["claimed"])
            self.assertEqual(denied["reason"], "lease_held")

            outcome = process_claimed_job(
                job_id,
                tenant_id="tenant-worker",
                owner_id="live-worker-1",
                max_ticks=1,
                steps_per_tick=1,
            )
            self.assertEqual(outcome["job_id"], job_id)
            self.assertGreaterEqual(outcome["ticks"], 1)

            batch = run_once(tenant_id="tenant-worker", limit=3, max_ticks=1)
            self.assertEqual(batch["tenant_id"], "tenant-worker")
            self.assertIn("results", batch)

            events = get_events(job_id, tenant_id="tenant-worker", since_index=0, limit=200)
            self.assertGreaterEqual(events["total_events"], 1)
            # Sequence cursor advances and event ids are unique (dedupe source of truth).
            ids = [str(evt.get("event_id")) for evt in events["events"] if evt.get("event_id")]
            self.assertEqual(len(ids), len(set(ids)))
            self.assertEqual(events["next_index"], events["since_index"] + len(events["events"]))

    def test_artifact_protection_blocks_automatic_replacement(self) -> None:
        from lars.runtime import (
            create_and_start_job,
            merge_protected_artifact_content,
            protect_artifact,
        )
        from lars.store import get_job as store_get_job
        from lars.store import save_job

        with patch("lars.store.persistent_storage_configured", return_value=False), patch(
            "lars.store.local_memory_fallback_allowed", return_value=True
        ), patch("lars.runtime.execute_agent_task") as execute_mock, patch(
            "lars.runtime.retrieve_dc_knowledge"
        ) as rag_mock, patch("lars.runtime.moe_route") as route_mock:
            route_mock.return_value.to_dict.return_value = {
                "expert": "research",
                "confidence": 0.9,
                "execute": True,
                "guardrail_status": "warn",
                "citations": [],
            }
            execute_mock.return_value = {
                "selected_agent": "ResearchAgent",
                "agent_result": {"content": "Protection test analysis.", "status": "warn"},
                "llm": {"estimated_cost_usd": 0.01},
            }
            rag_mock.return_value = {"results": []}
            created = create_and_start_job(
                {
                    "query": "Protect manual edits on D.C. research memo.",
                    "matter_id": "matter-protect",
                    "factual_assumptions": ["Client provided edited draft language."],
                    "auto_approve_assignment": True,
                },
                tenant_id="tenant-protect",
                user_id="user-protect",
            )
            job_id = created["job"]["job_id"]
            job = store_get_job(job_id, tenant_id="tenant-protect")
            assert job is not None
            artifact_id = "art_manual_1"
            job.artifacts.append(
                {
                    "artifact_id": artifact_id,
                    "deliverable_type": "research_memorandum",
                    "title": "Attorney edited memo",
                    "content_markdown": "ATTORNEY LOCKED TEXT — do not replace.",
                    "version": 1,
                    "created_at": "2026-01-01T00:00:00+00:00",
                }
            )
            save_job(job)
            protected = protect_artifact(
                job_id,
                tenant_id="tenant-protect",
                user_id="user-protect",
                artifact_id=artifact_id,
                protected=True,
                notes="Preserve manually edited introduction.",
            )
            arts = protected["job"]["artifacts"]
            locked = next(a for a in arts if a.get("artifact_id") == artifact_id)
            self.assertTrue(locked.get("protection", {}).get("manual_lock"))
            merged = merge_protected_artifact_content(locked, "AUTOMATIC REVISION SHOULD LOSE")
            self.assertEqual(merged, "ATTORNEY LOCKED TEXT — do not replace.")

    def test_event_stream_sequence_and_sse_endpoint(self) -> None:
        import asyncio
        import json as json_lib
        from unittest.mock import AsyncMock

        from fastapi.testclient import TestClient

        from main import app

        with patch("lars.store.persistent_storage_configured", return_value=False), patch(
            "lars.store.local_memory_fallback_allowed", return_value=True
        ), patch("lars.runtime.execute_agent_task") as execute_mock, patch(
            "lars.runtime.retrieve_dc_knowledge"
        ) as rag_mock, patch("lars.runtime.moe_route") as route_mock, patch(
            "lars.runtime.schedule_background_run", return_value={"scheduled": False, "reason": "test_stub"}
        ), patch("main.asyncio.sleep", new_callable=AsyncMock):
            route_mock.return_value.to_dict.return_value = {
                "expert": "research",
                "confidence": 0.9,
                "execute": True,
                "guardrail_status": "warn",
                "citations": [],
            }
            execute_mock.return_value = {
                "selected_agent": "ResearchAgent",
                "agent_result": {"content": "SSE event analysis.", "status": "warn"},
                "llm": {"estimated_cost_usd": 0.01},
            }
            rag_mock.return_value = {"results": []}
            client = TestClient(app)
            headers = {
                "X-Mercy-Tenant-Id": "tenant-sse",
                "X-Mercy-User-Id": "user-sse",
                "X-Mercy-Roles": "attorney",
            }
            create = client.post(
                "/v1/lars/jobs",
                headers=headers,
                json={
                    "query": "SSE sequence test for D.C. research.",
                    "matter_id": "matter-sse",
                    "factual_assumptions": ["Record incomplete."],
                    "auto_approve_assignment": True,
                    "max_model_calls": 4,
                },
            )
            self.assertIn(create.status_code, {200, 201})
            job_id = create.json()["job"]["job_id"]
            # Terminalize so SSE generator exits after draining events (not infinite idle).
            cancel = client.post(f"/v1/lars/jobs/{job_id}/cancel", headers=headers, json={})
            self.assertEqual(cancel.status_code, 200)

            # Poll path: cursor + unique event ids
            events = client.get(f"/v1/lars/jobs/{job_id}/events?since_index=0&limit=50", headers=headers)
            self.assertEqual(events.status_code, 200)
            body = events.json()
            self.assertIn("next_index", body)
            first_batch = body["events"]
            ids = [e.get("event_id") for e in first_batch]
            self.assertEqual(len(ids), len(set(ids)))
            again = client.get(f"/v1/lars/jobs/{job_id}/events?since_index=0&limit=50", headers=headers)
            self.assertEqual(again.status_code, 200)
            again_ids = [e.get("event_id") for e in again.json()["events"]]
            self.assertEqual(ids, again_ids)

            # SSE stream path: real GET /events/stream — event: lars, unique event_id, sequence/next_index
            with client.stream(
                "GET",
                f"/v1/lars/jobs/{job_id}/events/stream?since_index=0",
                headers=headers,
            ) as stream_resp:
                self.assertEqual(stream_resp.status_code, 200)
                content_type = stream_resp.headers.get("content-type", "")
                self.assertIn("text/event-stream", content_type)
                lines: list[str] = []
                for line in stream_resp.iter_lines():
                    if line is None:
                        continue
                    lines.append(line)
            stream_text = "\n".join(lines)
            self.assertIn("event: lars", stream_text)
            self.assertTrue(
                "event: terminal" in stream_text or "event: heartbeat" in stream_text,
                "stream should emit terminal or heartbeat frames",
            )
            data_lines = [ln[len("data: ") :] for ln in lines if ln.startswith("data: ")]
            stream_event_ids: list[str] = []
            for raw in data_lines:
                try:
                    parsed = json_lib.loads(raw)
                except json_lib.JSONDecodeError:
                    continue
                if isinstance(parsed, dict) and parsed.get("event_id"):
                    stream_event_ids.append(str(parsed["event_id"]))
            self.assertTrue(stream_event_ids, "SSE stream must deliver at least one lars event with event_id")
            self.assertEqual(len(stream_event_ids), len(set(stream_event_ids)), "SSE generator must dedupe event_id")
            self.assertTrue(
                any("next_index" in ln for ln in data_lines) or any(ln.startswith("id: ") for ln in lines),
                "SSE frames must include sequence id or next_index cursor",
            )

            # Cross-tenant denied on poll and stream
            other = {
                "X-Mercy-Tenant-Id": "tenant-other",
                "X-Mercy-User-Id": "user-other",
                "X-Mercy-Roles": "attorney",
            }
            denied = client.get(f"/v1/lars/jobs/{job_id}/events", headers=other)
            self.assertEqual(denied.status_code, 404)
            denied_stream = client.get(f"/v1/lars/jobs/{job_id}/events/stream", headers=other)
            self.assertEqual(denied_stream.status_code, 404)


if __name__ == "__main__":
    unittest.main()
