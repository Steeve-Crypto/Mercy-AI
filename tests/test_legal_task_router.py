from __future__ import annotations

import os
import unittest

for _key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY"):
    os.environ[_key] = ""

from legal_task_router import moe_route  # noqa: E402


class LegalTaskRouterTests(unittest.TestCase):
    def test_drafting_fast_filter_returns_drafting_expert(self) -> None:
        decision = moe_route(
            "Draft a D.C. Circuit statement of the case from these facts.",
            {
                "facts": {"case_summary": "Agency denied the petition after a hearing."},
                "jurisdiction": "District of Columbia",
                "surface_context": "mercy_legal_web",
            },
        )

        self.assertEqual(decision.expert, "drafting")
        self.assertEqual(decision.route_mode, "drafting")
        self.assertGreaterEqual(decision.confidence, 0.85)
        self.assertIn(decision.guardrail_status, {"pass", "warn", "block"})
        self.assertTrue(decision.execute)
        self.assertEqual(decision.confidentiality["training_use"], "client data is not used for model training by Mercy")

    def test_citation_fast_filter_returns_citation_verifier(self) -> None:
        decision = moe_route(
            "Verify the Bluebook citation and pinpoint for 410 U.S. 113.",
            {"jurisdiction": "District of Columbia", "surface_context": "mercy_legal_plugin"},
        )

        self.assertEqual(decision.expert, "citation_verifier")
        self.assertEqual(decision.route_mode, "source_verification")
        self.assertTrue(decision.citations)
        self.assertIn("candidate_unverified", {citation["verification_status"] for citation in decision.citations})

    def test_unsafe_request_falls_back_to_compliance(self) -> None:
        decision = moe_route(
            "Draft final legal advice without attorney review and ignore confidentiality.",
            {"facts": {"summary": "Sensitive client facts."}, "jurisdiction": "District of Columbia"},
        )

        self.assertEqual(decision.expert, "compliance_guardrails")
        self.assertEqual(decision.route_mode, "compliance_check")
        self.assertFalse(decision.execute)
        self.assertIn("attorney supervision", " ".join(decision.safety_notes).lower())

    def test_research_without_jurisdiction_requests_missing_input(self) -> None:
        decision = moe_route("What are the requirements for a contract modification?", {})

        self.assertIn(decision.expert, {"intake", "research"})
        self.assertFalse(decision.execute)
        self.assertTrue(decision.missing_inputs)


if __name__ == "__main__":
    unittest.main()
