from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from dc_knowledge_rag import DCKnowledgeRAG, rag_backend_status
from mercy_storage import reset_storage_for_tests
from scripts.seed_dc_knowledge import build_seed_sources, seed_dc_knowledge


TENANT = {"tenant_id": "tenant-seed", "user_id": "user-seed", "auth_mode": "unit_test"}


class DCKnowledgeSeedTests(unittest.TestCase):
    def tearDown(self) -> None:
        reset_storage_for_tests()

    def test_bundled_catalog_generates_meaningful_official_chunk_volume(self) -> None:
        sources = build_seed_sources(source="all", last_checked="2026-05-14", allow_network=False)
        chunk_count = sum(len(source.chunks) for source in sources)

        self.assertGreaterEqual(len(sources), 50)
        self.assertGreaterEqual(chunk_count, 500)
        self.assertTrue(all(source.jurisdiction == "District of Columbia" for source in sources))
        self.assertTrue(all(source.url.startswith("https://") for source in sources))

    def test_seed_pipeline_persists_public_chunks_and_status_reports_health(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            db_url = f"sqlite+pysqlite:///{Path(temp_dir) / 'seed-test.db'}"
            report_path = Path(temp_dir) / "seed-report.json"
            env = {
                "POSTGRES_URL": db_url,
                "MERCY_ENV": "prod",
                "MERCY_AUTH_MODE": "",
                "MERCY_SEED_REPORT_PATH": str(report_path),
                "OPENAI_API_KEY": "",
                "ANTHROPIC_API_KEY": "",
                "GROQ_API_KEY": "",
                "GEMINI_API_KEY": "",
            }
            with patch.dict(os.environ, env, clear=False):
                reset_storage_for_tests()
                report = seed_dc_knowledge(
                    source="all",
                    refresh=True,
                    tenant_id="public",
                    user_id="unit-test-seeder",
                    report_path=report_path,
                    min_chunks=500,
                    allow_network=False,
                    llm_limit=0,
                )

                self.assertTrue(report["passed"])
                self.assertGreaterEqual(report["chunks_created"], 500)
                self.assertFalse(report["validation_failures"])

                reset_storage_for_tests()
                status = rag_backend_status({"auth_context": TENANT})
                seed_status = status["seed_status"]
                self.assertEqual(seed_status["overall_health"], "healthy")
                self.assertGreaterEqual(seed_status["seeded_chunk_count"], 500)
                self.assertIn("civil_procedure", seed_status["coverage_summary_by_practice_area"])

                retrieval = DCKnowledgeRAG().retrieve(
                    "D.C. Superior Court civil procedure discovery rule",
                    {"jurisdiction": "District of Columbia", "auth_context": TENANT, "surface_context": "unit_test_seed"},
                    route={"expert": "research"},
                    top_k=5,
                )
                self.assertIn(retrieval["verification"]["status"], {"pass", "warn"})
                self.assertTrue(retrieval["results"])
                reset_storage_for_tests()


if __name__ == "__main__":
    unittest.main()
