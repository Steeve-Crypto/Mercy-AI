from __future__ import annotations

import unittest

from dc_knowledge_rag import retrieve_dc_knowledge
from legal_task_router import moe_route


class DCKnowledgeRagTests(unittest.TestCase):
    def test_retrieve_returns_provenanced_chunks_and_citations(self) -> None:
        result = retrieve_dc_knowledge(
            query="What D.C. ethics guardrails apply when drafting with AI?",
            matter_context={"jurisdiction": "District of Columbia", "client_role": "tenant"},
            top_k=3,
            route={"expert": "research", "route_mode": "dc_research"},
        )

        self.assertEqual(result["rag_version"], "dc-knowledge-rag-1.0")
        self.assertTrue(result["results"])
        self.assertTrue(result["citations"])
        self.assertIn(result["verification"]["status"], {"pass", "warn"})
        for chunk in result["results"]:
            self.assertTrue(chunk["chunk_id"])
            self.assertTrue(chunk["citation"]["label"])
            self.assertTrue(chunk["citation"]["provenance"]["source_id"])
            self.assertTrue(chunk["provenance"]["official_locator"])

    def test_router_injects_knowledge_for_drafting(self) -> None:
        decision = moe_route(
            query="Draft D.C. attorney review notes for an AI-generated brief.",
            matter_context={
                "jurisdiction": "District of Columbia",
                "facts": {"task": "AI-assisted appellate drafting"},
                "surface_context": "unit_test",
            },
            user_type="solo",
        )

        self.assertEqual(decision.expert, "drafting")
        self.assertTrue(decision.knowledge_context["available"])
        self.assertTrue(decision.knowledge_context["results"])
        self.assertTrue(any(citation["provenance"]["source_id"] for citation in decision.citations))


if __name__ == "__main__":
    unittest.main()
