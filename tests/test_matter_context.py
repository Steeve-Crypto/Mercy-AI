import unittest

from legal_task_router import moe_route
from mercy_context import get_matter_context, update_matter_context


class MatterContextTests(unittest.TestCase):
    def test_update_and_get_matter_context(self) -> None:
        matter_id = "test-intake-context"

        updated = update_matter_context(
            {
                "matter_id": matter_id,
                "client_id": "client-001",
                "client_name": "Test Client",
                "matter_name": "D.C. lease review",
                "jurisdiction": "District of Columbia",
                "client_role": "tenant",
                "key_facts": {"clause": "Tenant indemnifies landlord regardless of fault."},
                "documents": [{"document_id": "doc-001", "title": "Lease amendment"}],
                "missing_information": ["insurance schedule"],
                "source": "unit_test",
            }
        )

        stored = get_matter_context(matter_id)

        self.assertIsNotNone(stored)
        self.assertEqual(updated["matter_id"], matter_id)
        self.assertEqual(stored["client_id"], "client-001")
        self.assertEqual(stored["name"], "D.C. lease review")
        self.assertEqual(stored["key_facts"]["clause"], "Tenant indemnifies landlord regardless of fault.")
        self.assertEqual(stored["facts"]["clause"], "Tenant indemnifies landlord regardless of fault.")
        self.assertEqual(stored["documents"][0]["document_id"], "doc-001")
        self.assertTrue(stored["last_updated"])
        self.assertTrue(any(event["event"] == "matter_context_updated" for event in stored["history"]))

    def test_router_injects_current_matter_context_by_id(self) -> None:
        matter_id = "test-router-context"
        update_matter_context(
            {
                "matter_id": matter_id,
                "client_id": "client-002",
                "matter_name": "D.C. motion draft",
                "jurisdiction": "District of Columbia",
                "client_role": "petitioner",
                "key_facts": {"agency_action": "Agency denied a benefits application without findings."},
                "documents": [{"document_id": "agency-order", "title": "Final agency order"}],
                "requested_relief": "vacatur and remand",
                "source": "unit_test",
            }
        )

        decision = moe_route(
            query="Draft a concise D.C. Circuit argument section.",
            matter_context={"matter_id": matter_id, "surface_context": "unit_test"},
            user_type="solo",
        )

        self.assertEqual(decision.expert, "drafting")
        self.assertNotIn("facts_or_document_context", decision.missing_inputs)
        self.assertIn(decision.guardrail_status, {"pass", "warn"})


if __name__ == "__main__":
    unittest.main()
