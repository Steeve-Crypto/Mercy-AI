from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from dc_knowledge_rag import DCKnowledgeRAG, ingest_dc_sources
from mercy_context import DatabaseMatterStore, MatterTenantAccessError
from mercy_storage import LegalSourceChunkRecord, LegalSourceRecord, ReliabilitySnapshotRecord, RetrievalRunRecord, reset_storage_for_tests, session_scope


TENANT_A = {"tenant_id": "tenant-a", "user_id": "user-a", "auth_mode": "unit_test"}
TENANT_B = {"tenant_id": "tenant-b", "user_id": "user-b", "auth_mode": "unit_test"}


class PersistentStorageTests(unittest.TestCase):
    def tearDown(self) -> None:
        reset_storage_for_tests()

    def test_database_matter_store_persists_and_enforces_tenant_scope(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            db_url = f"sqlite+pysqlite:///{Path(temp_dir) / 'mercy-test.db'}"
            with patch.dict(os.environ, {"POSTGRES_URL": db_url, "MERCY_ENV": "prod", "MERCY_AUTH_MODE": ""}, clear=False):
                reset_storage_for_tests()
                store = DatabaseMatterStore()
                created = store.create("Persistent D.C. matter", client_name="Tenant A Client", tenant_context=TENANT_A)
                matter_id = created["matter_id"]
                store.update_context(
                    {
                        "matter_id": matter_id,
                        "matter_name": "Persistent intake matter",
                        "key_facts": {"issue": "Agency record is incomplete."},
                    },
                    tenant_context=TENANT_A,
                )

                reset_storage_for_tests()
                reloaded_store = DatabaseMatterStore()
                stored = reloaded_store.get(matter_id, tenant_context=TENANT_A)

                self.assertIsNotNone(stored)
                self.assertEqual(stored["name"], "Persistent intake matter")
                self.assertEqual(stored["key_facts"]["issue"], "Agency record is incomplete.")
                self.assertEqual([item["matter_id"] for item in reloaded_store.list(TENANT_A)], [matter_id])
                self.assertEqual(reloaded_store.list(TENANT_B), [])
                with self.assertRaises(MatterTenantAccessError):
                    reloaded_store.get(matter_id, tenant_context=TENANT_B)
                reset_storage_for_tests()

    def test_rag_ingestion_persists_chunks_and_retrieves_by_tenant(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            db_url = f"sqlite+pysqlite:///{Path(temp_dir) / 'mercy-rag-test.db'}"
            with patch.dict(os.environ, {"POSTGRES_URL": db_url, "MERCY_ENV": "prod", "MERCY_AUTH_MODE": ""}, clear=False):
                reset_storage_for_tests()
                result = ingest_dc_sources(
                    {
                        "source": {
                            "source_id": "official-dc-admin-test",
                            "title": "Official D.C. Administrative Test Source",
                            "source_type": "official_source",
                            "authority_type": "administrative_order",
                            "jurisdiction": "District of Columbia",
                            "citation_label": "D.C. Admin. Test",
                            "official_locator": "Official D.C. administrative locator",
                            "url": "https://example.dc.gov/admin-test",
                            "last_checked": "2026-05-12",
                            "verification_status": "official_metadata_unquoted",
                            "refresh_cadence": "monthly",
                        },
                        "chunks": [
                            {
                                "chunk_id": "official-dc-admin-test-chunk",
                                "source_id": "official-dc-admin-test",
                                "text": "Official D.C. administrative record guidance requires a complete agency record.",
                                "summary": "D.C. administrative record guidance.",
                                "practice_area": "administrative_order",
                            }
                        ],
                    },
                    {"auth_context": TENANT_A, "surface_context": "unit_test_persistent_rag"},
                )

                self.assertTrue(result["accepted"])
                self.assertEqual(result["tenant_id"], "tenant-a")
                with session_scope() as session:
                    legal_source = session.get(LegalSourceRecord, "official-dc-admin-test")
                    self.assertIsNotNone(legal_source)
                    legal_chunks = session.query(LegalSourceChunkRecord).filter(LegalSourceChunkRecord.source_id == "official-dc-admin-test").all()
                    self.assertEqual(len(legal_chunks), 1)
                    self.assertIsNotNone(legal_chunks[0].embedding_vector)

                reset_storage_for_tests()
                retrieved = DCKnowledgeRAG().retrieve(
                    "complete agency record guidance",
                    {"jurisdiction": "District of Columbia", "auth_context": TENANT_A},
                    top_k=3,
                    route={"expert": "research"},
                )
                other_tenant = DCKnowledgeRAG().retrieve(
                    "complete agency record guidance",
                    {"jurisdiction": "District of Columbia", "auth_context": TENANT_B},
                    top_k=3,
                    route={"expert": "research"},
                )

                self.assertIn(retrieved["verification"]["status"], {"pass", "warn"})
                self.assertEqual(retrieved["results"][0]["chunk_id"], "official-dc-admin-test-chunk")
                self.assertIn("persistence", retrieved)
                with session_scope() as session:
                    runs = session.query(RetrievalRunRecord).filter(RetrievalRunRecord.tenant_id == "tenant-a").all()
                    snapshots = session.query(ReliabilitySnapshotRecord).filter(ReliabilitySnapshotRecord.tenant_id == "tenant-a").all()
                    self.assertEqual(len(runs), 1)
                    self.assertEqual(len(snapshots), 1)
                    self.assertEqual(snapshots[0].retrieval_run_id, runs[0].retrieval_run_id)
                self.assertIn(other_tenant["verification"]["status"], {"pass", "warn"})
                self.assertEqual(other_tenant["results"][0]["chunk_id"], "official-dc-admin-test-chunk")
                reset_storage_for_tests()


if __name__ == "__main__":
    unittest.main()
