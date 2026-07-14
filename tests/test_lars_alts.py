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


if __name__ == "__main__":
    unittest.main()
