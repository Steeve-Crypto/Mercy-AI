from __future__ import annotations

import unittest

from client_intake_flow import run_full_intake_flow
from legal_task_router import moe_route
from prompts.intake import build_intake_prompt_library

TEST_AUTH = {"tenant_id": "tenant-intake", "user_id": "user-intake", "auth_mode": "unit_test"}


class ClientIntakeFlowTests(unittest.TestCase):
    def test_prompt_library_contains_required_dc_intake_prompts(self) -> None:
        library = build_intake_prompt_library({"matter_name": "D.C. tenant matter"})
        prompt_names = {prompt["name"] for prompt in library["prompts"]}

        self.assertEqual(library["jurisdiction"], "District of Columbia")
        self.assertIn("initial_client_intake", prompt_names)
        self.assertIn("matter_fact_gathering", prompt_names)
        self.assertIn("conflict_check", prompt_names)
        self.assertIn("scope_confirmation", prompt_names)
        for prompt in library["prompts"]:
            self.assertIn("D.C. Bar Ethics Opinion 388", prompt["ethics_note"])
            self.assertTrue(prompt["required_fields"])

    def test_full_intake_flow_populates_matter_context_and_summary(self) -> None:
        result = run_full_intake_flow(
            {
                "matter_id": "test-full-intake-flow",
                "client": {"client_id": "client-full-001", "client_name": "Test Tenant"},
                "matter": {
                    "matter_name": "D.C. lease intake",
                    "matter_type": "lease review",
                    "client_role": "tenant",
                    "opposing_parties": ["Landlord LLC"],
                },
                "facts": {
                    "summary": "Client received an amendment with broad indemnity language.",
                    "chronology": [{"date": "2026-05-10", "event": "Amendment received"}],
                },
                "documents": [{"document_id": "lease-amendment", "title": "Lease amendment"}],
                "deadlines": [{"label": "Response deadline", "date": "2026-05-20"}],
                "conflicts": {"checked": False, "status": "ready_for_review", "related_parties": ["Broker"]},
                "scope": {
                    "confirmed": False,
                    "scope_of_work": "Review D.C. lease amendment.",
                    "excluded_work": ["tax advice"],
                },
                "requested_relief": "Narrow indemnity and venue provisions.",
                "surface_context": "unit_test_full_intake",
                "auth_context": TEST_AUTH,
            }
        )

        context = result["matter_context"]
        summary = result["intake_summary"]

        self.assertEqual(context["matter_id"], "test-full-intake-flow")
        self.assertEqual(context["client_name"], "Test Tenant")
        self.assertEqual(context["documents"][0]["document_id"], "lease-amendment")
        self.assertEqual(summary["conflict_status"], "ready_for_review")
        self.assertEqual(summary["scope_status"], "needs_attorney_confirmation")
        self.assertEqual(summary["document_count"], 1)
        self.assertTrue(result["prompt_library"]["prompts"])
        self.assertTrue(result["next_steps"])

    def test_router_auto_triggers_intake_for_conflict_and_scope_requests(self) -> None:
        decision = moe_route(
            "Run a conflict check and scope confirmation for this prospective D.C. client.",
            {"surface_context": "unit_test_full_intake", "jurisdiction": "District of Columbia"},
        )

        self.assertEqual(decision.expert, "intake")
        self.assertEqual(decision.selected_capability, "matter_intake")
        self.assertIn("conflict_check", decision.next_action.lower())


if __name__ == "__main__":
    unittest.main()
