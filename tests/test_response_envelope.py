from __future__ import annotations

import unittest

from legal_task_router import moe_route
from response_envelope import build_response_envelope, normalize_guardrail_status


class ResponseEnvelopeTests(unittest.TestCase):
    def test_envelope_contains_required_compliance_fields(self) -> None:
        route = moe_route(
            "Draft a D.C. Circuit statement of the case.",
            {"jurisdiction": "District of Columbia", "facts": {"summary": "Agency denial."}, "matter_id": "m-123"},
        ).to_dict()
        envelope = build_response_envelope(route, {"matter_id": "m-123", "document_text": "sensitive"})

        self.assertEqual(envelope["expert"], "drafting")
        self.assertIn(envelope["guardrail_status"], {"pass", "warn", "block"})
        self.assertTrue(envelope["citations"])
        self.assertEqual(envelope["matter_context_snapshot"]["reference"], "m-123")
        self.assertNotIn("sensitive", envelope["matter_context_snapshot"]["hash"])
        self.assertTrue(envelope["dc_ethics_metadata"]["human_review_required"])
        self.assertIn("audit_timestamp", envelope)

    def test_guardrail_status_normalization(self) -> None:
        self.assertEqual(normalize_guardrail_status("pass"), "pass")
        self.assertEqual(normalize_guardrail_status("review_required"), "warn")
        self.assertEqual(normalize_guardrail_status("pass", execute=False), "block")
        self.assertEqual(normalize_guardrail_status("blocked"), "block")


if __name__ == "__main__":
    unittest.main()
