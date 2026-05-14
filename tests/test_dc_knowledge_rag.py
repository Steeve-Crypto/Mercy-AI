from __future__ import annotations

import os
import unittest
from unittest.mock import patch

os.environ.setdefault("MERCY_ENV", "local")
for _key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY"):
    os.environ[_key] = ""

from dc_knowledge_rag import (  # noqa: E402
    DCKnowledgeRAG,
    KnowledgeChunk,
    RetrievalConfig,
    RetrievalHit,
    SourceValidationError,
    ingest_dc_sources,
    rag_backend_status,
    retrieve_dc_knowledge,
)
from legal_task_router import moe_route  # noqa: E402


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
        self.assertTrue(result["backend_status"]["local_demo_allowed"])

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

    def test_non_local_without_external_backends_blocks_seeded_demo_retrieval(self) -> None:
        with patch.dict(os.environ, {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "", "MERCY_RAG_VECTOR_BACKEND": "local", "MERCY_RAG_GRAPH_BACKEND": "local"}):
            result = retrieve_dc_knowledge(
                query="What D.C. ethics rules apply?",
                matter_context={
                    "jurisdiction": "District of Columbia",
                    "auth_context": {"tenant_id": "tenant-a", "user_id": "user-a"},
                    "surface_context": "unit_test_prod",
                },
                route={"expert": "research"},
            )

        self.assertEqual(result["verification"]["status"], "block")
        self.assertIn("external_backend_required_in_non_local_mode", result["verification"]["issues"])
        self.assertFalse(result["results"])

    def test_configured_external_adapters_are_invoked(self) -> None:
        chunk = KnowledgeChunk(
            chunk_id="external-dc-source",
            source_id="local_demo_dc_ethics_opinion_388",
            text="External D.C. source text.",
            summary="External source summary.",
            source_title="External Source",
            citation_label="External Cite",
            source_type="official_source",
            authority_type="rule",
            jurisdiction="District of Columbia",
            official_locator="External locator",
        )

        class FakeVector:
            def search(self, *_args, **_kwargs):
                return [RetrievalHit(chunk, 0.9, "qdrant")]

            def status(self):
                return {"backend": "qdrant", "connected": True, "mode": "external_vector", "fallback": False}

        class FakeGraph:
            def search(self, *_args, **_kwargs):
                return [RetrievalHit(chunk, 0.8, "neo4j")]

            def status(self):
                return {"backend": "neo4j", "connected": True, "mode": "external_graph", "fallback": False}

        config = RetrievalConfig(vector_backend="qdrant", graph_backend="neo4j", qdrant_url="http://qdrant", neo4j_uri="bolt://neo4j")
        with patch("dc_knowledge_rag.QdrantVectorAdapter", return_value=FakeVector()) as vector_adapter:
            with patch("dc_knowledge_rag.Neo4jGraphAdapter", return_value=FakeGraph()) as graph_adapter:
                result = DCKnowledgeRAG(config=config).retrieve(
                    "External D.C. query",
                    {
                        "jurisdiction": "District of Columbia",
                        "auth_context": {"tenant_id": "tenant-a", "user_id": "user-a"},
                        "surface_context": "unit_test_external",
                    },
                    route={"expert": "research"},
                )

        self.assertTrue(vector_adapter.called)
        self.assertTrue(graph_adapter.called)
        self.assertEqual(result["backend_status"]["vector_backend"], "qdrant")
        self.assertEqual(result["backend_status"]["graph_backend"], "neo4j")
        self.assertTrue(result["results"])

    def test_rag_backend_status_reports_package_and_tenant_metadata(self) -> None:
        status = rag_backend_status({"auth_context": {"tenant_id": "tenant-a", "user_id": "user-a"}})

        self.assertEqual(status["rag_version"], "dc-knowledge-rag-1.0")
        self.assertTrue(status["tenant_isolated"])
        self.assertIn("qdrant_client", status["packages"])
        self.assertIn("ingestion_contract", status)
        self.assertTrue(status["ingestion_contract"]["local_demo_active"])

    def test_ingest_accepts_registered_official_dc_source(self) -> None:
        result = ingest_dc_sources(
            {
                "source": {
                    "source_id": "official-dc-rule-test",
                    "title": "Official D.C. Rule Test",
                    "source_type": "rule",
                    "authority_type": "rule",
                    "jurisdiction": "District of Columbia",
                    "citation_label": "D.C. R. Test",
                    "official_locator": "Official D.C. rules locator",
                    "url": "https://example.dc.gov/rule",
                    "last_checked": "2026-05-12",
                    "verification_status": "official_verified",
                    "refresh_cadence": "monthly",
                },
                "chunks": [
                    {
                        "chunk_id": "official-dc-rule-test-chunk",
                        "source_id": "official-dc-rule-test",
                        "text": "Official D.C. rule text metadata for retrieval.",
                    }
                ],
            },
            {"auth_context": {"tenant_id": "tenant-a", "user_id": "user-a"}, "surface_context": "unit_test_ingest"},
        )

        self.assertTrue(result["accepted"])
        self.assertEqual(result["chunk_count"], 1)

    def test_ingest_rejects_non_dc_or_unofficial_source(self) -> None:
        with self.assertRaises(SourceValidationError):
            ingest_dc_sources(
                {
                    "source": {
                        "source_id": "bad-source",
                        "title": "Bad Source",
                        "source_type": "blog",
                        "authority_type": "rule",
                        "jurisdiction": "Maryland",
                        "citation_label": "Bad Cite",
                        "official_locator": "No official locator",
                        "url": "https://example.com",
                        "last_checked": "2026-05-12",
                        "verification_status": "official_verified",
                        "refresh_cadence": "monthly",
                    }
                },
                {"auth_context": {"tenant_id": "tenant-a", "user_id": "user-a"}},
            )


if __name__ == "__main__":
    unittest.main()
