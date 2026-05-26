from __future__ import annotations

import asyncio
from io import BytesIO
import os
import tempfile
import unittest
from pathlib import Path
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import patch

from starlette.datastructures import Headers, UploadFile

from dc_knowledge_rag import (
    DCKnowledgeRAG,
    KnowledgeChunk,
    FallbackVectorAdapter,
    PgVectorAdapter,
    RetrievalBackendError,
    RetrievalConfig,
    RetrievalHit,
    neo4j_relationship_rows_from_chunks,
    _qdrant_payload,
    _result_source_scope,
    _search_document_vectors,
    _search_legal_source_vectors,
)
from mercy_config import get_config
from mercy_storage import (
    DocumentChunkRecord,
    DocumentRecord,
    EmbeddingJobRecord,
    ReliabilitySnapshotRecord,
    RetrievalRunRecord,
    configured_database_url,
    record_retrieval_run,
    record_vault_document,
    reset_storage_for_tests,
    session_scope,
    validate_configured_database_url,
)


DB_ENV_KEYS = {
    "POSTGRES_URL": "",
    "MERCY_POSTGRES_URL": "",
    "DATABASE_URL": "",
    "MERCY_DATABASE_URL": "",
    "SUPABASE_DB_URL": "",
    "MERCY_SUPABASE_DB_URL": "",
    "MERCY_PGVECTOR_DSN": "",
    "SUPABASE_URL": "",
    "MERCY_RAG_VECTOR_BACKEND": "auto",
}


def _criterion_field_and_value(criterion: object) -> tuple[str | None, object]:
    left = getattr(criterion, "left", None)
    right = getattr(criterion, "right", None)
    return getattr(left, "name", None), getattr(right, "value", None)


class _FakePgVectorQuery:
    def __init__(self, rows: list[object]) -> None:
        self._rows = rows
        self._criteria: list[object] = []
        self._limit = len(rows)

    def filter(self, *criteria: object) -> "_FakePgVectorQuery":
        self._criteria.extend(criteria)
        return self

    def order_by(self, *_args: object) -> "_FakePgVectorQuery":
        return self

    def limit(self, value: int) -> "_FakePgVectorQuery":
        self._limit = value
        return self

    def all(self) -> list[tuple[object, float]]:
        records = list(self._rows)
        for criterion in self._criteria:
            field, expected = _criterion_field_and_value(criterion)
            if not field or expected is None:
                continue
            if isinstance(expected, list):
                records = [record for record in records if getattr(record, field, None) in expected]
            elif field in {"tenant_id", "matter_id", "document_id", "jurisdiction", "practice_area", "authority_type", "source_date"}:
                records = [record for record in records if getattr(record, field, None) == expected]
        return [(record, 0.1) for record in records[: self._limit]]


class _FakePgVectorSession:
    def __init__(self, rows: list[object]) -> None:
        self.rows = rows

    def query(self, *_args: object) -> _FakePgVectorQuery:
        return _FakePgVectorQuery(self.rows)


def _legal_chunk_record(**overrides: object) -> SimpleNamespace:
    values = {
        "chunk_id": "legal-chunk",
        "source_id": "legal-source",
        "text": "D.C. legal source text",
        "summary": "D.C. source summary",
        "source_title": "D.C. source",
        "citation_label": "D.C. source",
        "source_type": "statute",
        "authority_type": "statute",
        "jurisdiction": "District of Columbia",
        "official_locator": "Official locator",
        "url": "https://example.test/source",
        "entities": [],
        "relationships": [],
        "verification_status": "official_metadata_unquoted",
        "citation_required": True,
        "last_checked": "2026-05-26",
        "practice_area": "civil_procedure",
        "source_date": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _document_chunk_record(tenant_id: str, matter_id: str, document_id: str, text: str) -> SimpleNamespace:
    return SimpleNamespace(
        chunk_id=f"{document_id}_chunk_0000",
        tenant_id=tenant_id,
        firm_id="firm-a",
        matter_id=matter_id,
        document_id=document_id,
        chunk_index=0,
        text=text,
        summary=text,
    )


class PgVectorStorageFoundationTests(unittest.TestCase):
    def tearDown(self) -> None:
        reset_storage_for_tests()

    def test_supabase_project_url_is_not_treated_as_database_url(self) -> None:
        env = DB_ENV_KEYS | {
            "MERCY_ENV": "prod",
            "SUPABASE_URL": "https://mercy-test.supabase.co",
        }
        with patch.dict(os.environ, env, clear=False):
            reset_storage_for_tests()
            get_config.cache_clear()

            self.assertIsNone(configured_database_url())
            ok, issue = validate_configured_database_url()
            self.assertFalse(ok)
            self.assertIn("required", issue or "")
            self.assertEqual(RetrievalConfig.from_env().vector_backend, "local")

    def test_database_url_alias_normalizes_to_psycopg_driver(self) -> None:
        env = DB_ENV_KEYS | {
            "MERCY_ENV": "prod",
            "DATABASE_URL": "postgresql://user:pass@example.invalid:5432/mercy",
        }
        with patch.dict(os.environ, env, clear=False):
            reset_storage_for_tests()
            get_config.cache_clear()

            self.assertEqual(
                configured_database_url(),
                "postgresql+psycopg://user:pass@example.invalid:5432/mercy",
            )
            self.assertEqual(validate_configured_database_url(), (True, None))
            config = RetrievalConfig.from_env()
            self.assertEqual(config.vector_backend, "pgvector")
            self.assertEqual(config.pgvector_dsn, configured_database_url())

    def test_sqlite_persistent_storage_uses_local_retrieval_fallback_in_auto_mode(self) -> None:
        env = DB_ENV_KEYS | {
            "MERCY_ENV": "prod",
            "POSTGRES_URL": "sqlite+pysqlite:///:memory:",
        }
        with patch.dict(os.environ, env, clear=False):
            reset_storage_for_tests()
            get_config.cache_clear()

            config = RetrievalConfig.from_env()
            self.assertEqual(config.vector_backend, "local")
            self.assertEqual(config.pgvector_dsn, "sqlite+pysqlite:///:memory:")

    def test_malformed_database_url_reports_safe_key_class(self) -> None:
        env = DB_ENV_KEYS | {
            "MERCY_ENV": "prod",
            "MERCY_DATABASE_URL": "not-a-database-url",
        }
        with patch.dict(os.environ, env, clear=False):
            reset_storage_for_tests()
            get_config.cache_clear()

            self.assertIsNone(configured_database_url())
            ok, issue = validate_configured_database_url()
            self.assertFalse(ok)
            self.assertIn("MERCY_DATABASE_URL", issue or "")
            self.assertNotIn("not-a-database-url", issue or "")

    def test_vault_document_metadata_and_chunks_persist_with_tenant_scope(self) -> None:
        env = DB_ENV_KEYS | {
            "MERCY_ENV": "prod",
            "POSTGRES_URL": "sqlite+pysqlite:///:memory:",
        }
        with patch.dict(os.environ, env, clear=False):
            reset_storage_for_tests()
            get_config.cache_clear()

            result = record_vault_document(
                {
                    "document_id": "doc-test",
                    "matter_id": "matter-a",
                    "filename": "test.pdf",
                    "mime_type": "application/pdf",
                    "storage_path": "managed://doc-test",
                    "sha256": "a" * 64,
                    "size": 123,
                    "status": "ready",
                    "extraction_status": "ready",
                },
                tenant_context={"tenant_id": "tenant-a", "firm_id": "firm-a", "user_id": "user-a"},
                document_text="This is a D.C. agency record. " * 200,
            )

            self.assertTrue(result["persisted"])
            self.assertGreater(result["chunk_count"], 1)
            with session_scope() as session:
                document = session.get(DocumentRecord, "doc-test")
                self.assertIsNotNone(document)
                self.assertEqual(document.tenant_id, "tenant-a")
                chunks = session.query(DocumentChunkRecord).filter(DocumentChunkRecord.tenant_id == "tenant-a").all()
                self.assertEqual(len(chunks), result["chunk_count"])
                self.assertTrue(all(chunk.document_id == "doc-test" for chunk in chunks))
                self.assertTrue(all(chunk.embedding_vector is not None for chunk in chunks))
                jobs = session.query(EmbeddingJobRecord).filter(EmbeddingJobRecord.target_id == "doc-test").all()
                self.assertEqual(len(jobs), 1)
                self.assertEqual(jobs[0].status, "completed")

    def test_vault_document_without_extractable_text_records_limited_lifecycle(self) -> None:
        env = DB_ENV_KEYS | {
            "MERCY_ENV": "prod",
            "POSTGRES_URL": "sqlite+pysqlite:///:memory:",
        }
        with patch.dict(os.environ, env, clear=False):
            reset_storage_for_tests()
            get_config.cache_clear()

            result = record_vault_document(
                {
                    "document_id": "doc-limited",
                    "matter_id": "matter-a",
                    "filename": "scanned.pdf",
                    "mime_type": "application/pdf",
                    "storage_path": "managed://doc-limited",
                    "sha256": "b" * 64,
                    "size": 456,
                    "status": "ready",
                    "extraction_status": "ready",
                },
                tenant_context={"tenant_id": "tenant-a", "firm_id": "firm-a", "user_id": "user-a"},
                document_text="",
            )

            self.assertTrue(result["persisted"])
            self.assertEqual(result["chunk_count"], 0)
            self.assertEqual(result["document_status"], "extraction_limited")
            self.assertEqual(result["extraction_status"], "extraction_limited")
            with session_scope() as session:
                document = session.get(DocumentRecord, "doc-limited")
                self.assertIsNotNone(document)
                self.assertEqual(document.status, "extraction_limited")
                self.assertEqual(document.extraction_status, "extraction_limited")
                chunks = session.query(DocumentChunkRecord).filter(DocumentChunkRecord.document_id == "doc-limited").all()
                self.assertEqual(chunks, [])

    def test_vault_document_id_cannot_be_reassigned_across_tenants(self) -> None:
        env = DB_ENV_KEYS | {
            "MERCY_ENV": "prod",
            "POSTGRES_URL": "sqlite+pysqlite:///:memory:",
        }
        document = {
            "document_id": "doc-shared",
            "matter_id": "matter-a",
            "filename": "shared.pdf",
            "mime_type": "application/pdf",
            "storage_path": "managed://doc-shared",
            "sha256": "c" * 64,
            "size": 789,
            "status": "ready",
            "extraction_status": "ready",
        }
        with patch.dict(os.environ, env, clear=False):
            reset_storage_for_tests()
            get_config.cache_clear()

            record_vault_document(
                document,
                tenant_context={"tenant_id": "tenant-a", "firm_id": "firm-a", "user_id": "user-a"},
                document_text="Tenant A private document text.",
            )
            with self.assertRaisesRegex(RuntimeError, "different tenant"):
                record_vault_document(
                    document,
                    tenant_context={"tenant_id": "tenant-b", "firm_id": "firm-b", "user_id": "user-b"},
                    document_text="Tenant B private document text.",
                )

    def test_pgvector_adapter_uses_sql_vector_search_on_postgres_path(self) -> None:
        hit = RetrievalHit(
            KnowledgeChunk(
                chunk_id="legal-chunk",
                source_id="legal-source",
                text="D.C. source text",
                summary="D.C. source summary",
                source_title="D.C. source",
                citation_label="D.C. source",
                source_type="statute",
                authority_type="statute",
                jurisdiction="District of Columbia",
                official_locator="official locator",
                verification_status="official_metadata_unquoted",
                practice_area="civil_procedure",
            ),
            0.9,
            "pgvector",
        )

        @contextmanager
        def fake_session_scope():
            yield object()

        with (
            patch("dc_knowledge_rag.persistent_storage_configured", return_value=True),
            patch("dc_knowledge_rag.get_engine", return_value=SimpleNamespace(dialect=SimpleNamespace(name="postgresql"))),
            patch("dc_knowledge_rag.session_scope", fake_session_scope),
            patch("dc_knowledge_rag._search_legal_source_vectors", return_value=[hit]) as legal_search,
            patch("dc_knowledge_rag._search_document_vectors", return_value=[]) as document_search,
            patch("dc_knowledge_rag._persistent_chunks") as persistent_chunks,
        ):
            results = PgVectorAdapter(RetrievalConfig(vector_backend="pgvector", pgvector_dsn="postgresql://db")).search(
                "agency record",
                {"auth_context": {"tenant_id": "tenant-a", "user_id": "user-a"}},
                {"tenant_id": "tenant-a", "matter_id": "matter-a"},
                5,
            )

        self.assertEqual(results, [hit])
        legal_search.assert_called_once()
        document_search.assert_called_once()
        persistent_chunks.assert_not_called()

    def test_pgvector_adapter_rejects_non_postgres_engine_instead_of_local_scoring(self) -> None:
        with (
            patch("dc_knowledge_rag.persistent_storage_configured", return_value=True),
            patch("dc_knowledge_rag.get_engine", return_value=SimpleNamespace(dialect=SimpleNamespace(name="sqlite"))),
            patch("dc_knowledge_rag._persistent_chunks") as persistent_chunks,
        ):
            with self.assertRaisesRegex(RetrievalBackendError, "PostgreSQL/Supabase Postgres is required"):
                PgVectorAdapter(RetrievalConfig(vector_backend="pgvector", pgvector_dsn="sqlite+pysqlite:///:memory:")).search(
                    "agency record",
                    {"auth_context": {"tenant_id": "tenant-a", "user_id": "user-a"}},
                    {"tenant_id": "tenant-a"},
                    5,
                )

        persistent_chunks.assert_not_called()

    def test_sql_pgvector_public_source_retrieval_maps_public_legal_chunks(self) -> None:
        session = _FakePgVectorSession(
            [
                _legal_chunk_record(
                    chunk_id="public-chunk",
                    source_id="dc-source",
                    text="D.C. official source text",
                )
            ]
        )

        hits = _search_legal_source_vectors(
            session,
            [0.1, 0.2, 0.3],
            {"jurisdiction": "District of Columbia"},
            5,
        )

        self.assertEqual([hit.chunk.chunk_id for hit in hits], ["public-chunk"])
        self.assertEqual(hits[0].chunk.tenant_id, "public")
        self.assertEqual(hits[0].chunk.source_type, "statute")

    def test_sql_pgvector_document_retrieval_filters_tenant_matter_and_document_scope(self) -> None:
        session = _FakePgVectorSession(
            [
                _document_chunk_record("tenant-a", "matter-a", "doc-a", "tenant-a hit"),
                _document_chunk_record("tenant-a", "matter-b", "doc-b", "wrong matter"),
                _document_chunk_record("tenant-b", "matter-a", "doc-a", "wrong tenant"),
            ]
        )

        hits = _search_document_vectors(
            session,
            [0.1, 0.2, 0.3],
            {"tenant_id": "tenant-a", "matter_id": "matter-a", "document_id": "doc-a"},
            5,
        )

        self.assertEqual([hit.chunk.text for hit in hits], ["tenant-a hit"])
        self.assertEqual(hits[0].chunk.source_type, "tenant_document")
        self.assertEqual(hits[0].chunk.tenant_id, "tenant-a")

    def test_sql_pgvector_cross_tenant_document_retrieval_returns_no_private_hits(self) -> None:
        session = _FakePgVectorSession(
            [
                _document_chunk_record("tenant-a", "matter-a", "doc-a", "tenant-a private text"),
            ]
        )

        hits = _search_document_vectors(
            session,
            [0.1, 0.2, 0.3],
            {"tenant_id": "tenant-b", "matter_id": "matter-a", "document_id": "doc-a"},
            5,
        )

        self.assertEqual(hits, [])

    def test_qdrant_payload_separates_public_sources_and_tenant_documents(self) -> None:
        public_chunk = KnowledgeChunk(
            chunk_id="public-chunk",
            source_id="dc-source",
            text="D.C. source text",
            summary="D.C. source summary",
            source_title="D.C. Source",
            citation_label="D.C. Source",
            source_type="statute",
            authority_type="statute",
            jurisdiction="District of Columbia",
            official_locator="Official locator",
        )
        private_chunk = KnowledgeChunk(
            chunk_id="doc-a_chunk_0000",
            source_id="document:doc-a",
            text="Tenant private text",
            summary="Tenant private summary",
            source_title="Vault document doc-a",
            citation_label="Vault document doc-a",
            source_type="tenant_document",
            authority_type="record",
            jurisdiction="Tenant private document",
            official_locator="tenant:tenant-a/document:doc-a/chunk:0",
            relationships=[{"type": "matter_document", "from": "matter-a", "to": "doc-a"}],
            tenant_id="tenant-a",
        )

        public_payload = _qdrant_payload(public_chunk)
        private_payload = _qdrant_payload(private_chunk)

        self.assertEqual(public_payload["scope"], "public_dc_source")
        self.assertEqual(public_payload["tenant_id"], "public")
        self.assertEqual(private_payload["scope"], "tenant_document")
        self.assertEqual(private_payload["tenant_id"], "tenant-a")
        self.assertEqual(private_payload["matter_id"], "matter-a")
        self.assertEqual(private_payload["document_id"], "doc-a")

    def test_qdrant_primary_falls_back_to_pgvector_adapter(self) -> None:
        fallback_hit = RetrievalHit(
            KnowledgeChunk(
                chunk_id="fallback-chunk",
                source_id="dc-source",
                text="Fallback D.C. text",
                summary="Fallback D.C. summary",
                source_title="D.C. Source",
                citation_label="D.C. Source",
                source_type="statute",
                authority_type="statute",
                jurisdiction="District of Columbia",
                official_locator="Official locator",
            ),
            0.77,
            "pgvector",
        )

        class BrokenPrimary:
            name = "qdrant"

            def search(self, *_args: object) -> list[RetrievalHit]:
                raise RetrievalBackendError("qdrant unavailable")

            def status(self) -> dict[str, object]:
                return {"backend": "qdrant", "connected": False}

        class WorkingFallback:
            name = "pgvector"

            def search(self, *_args: object) -> list[RetrievalHit]:
                return [fallback_hit]

            def status(self) -> dict[str, object]:
                return {"backend": "pgvector", "connected": True}

        adapter = FallbackVectorAdapter(BrokenPrimary(), WorkingFallback())
        hits = adapter.search("query", {}, {"tenant_id": "tenant-a"}, 5)

        self.assertEqual(hits, [fallback_hit])
        self.assertTrue(adapter.status()["fallback"])
        self.assertEqual(adapter.status()["last_backend"], "pgvector")

    def test_neo4j_relationship_rows_do_not_cross_tenant_scope(self) -> None:
        chunks = [
            KnowledgeChunk(
                chunk_id="doc-a",
                source_id="document:doc-a",
                text="Tenant A",
                summary="Tenant A",
                source_title="Doc A",
                citation_label="Doc A",
                source_type="tenant_document",
                authority_type="record",
                jurisdiction="Tenant private document",
                official_locator="tenant:tenant-a/document:doc-a/chunk:0",
                tenant_id="tenant-a",
            ),
            KnowledgeChunk(
                chunk_id="doc-b",
                source_id="document:doc-b",
                text="Tenant B",
                summary="Tenant B",
                source_title="Doc B",
                citation_label="Doc B",
                source_type="tenant_document",
                authority_type="record",
                jurisdiction="Tenant private document",
                official_locator="tenant:tenant-b/document:doc-b/chunk:0",
                tenant_id="tenant-b",
            ),
        ]

        rows = neo4j_relationship_rows_from_chunks(chunks, tenant_id="tenant-a")

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["tenant_id"], "tenant-a")

    def test_workbench_document_scope_is_verified_against_stored_matter_documents(self) -> None:
        env = DB_ENV_KEYS | {"MERCY_ENV": "local", "MERCY_AUTH_MODE": "dev"}
        with patch.dict(os.environ, env, clear=False):
            reset_storage_for_tests()
            get_config.cache_clear()
            from auth_context import TenantUser
            from main import _scoped_matter_context

            tenant_user = TenantUser(tenant_id="tenant-a", user_id="user-a", auth_mode="unit_test")
            stored = {
                "matter_id": "matter-a",
                "documents": [
                    {"document_id": "doc-allowed", "filename": "allowed.pdf"},
                ],
            }
            with patch("main._matter_context", return_value=stored):
                context = _scoped_matter_context(
                    tenant_user,
                    matter_id="matter-a",
                    client_context={"attached_document_ids": ["doc-allowed", "doc-other"], "document_id": "doc-other"},
                    surface_context="unit_test",
                )

        self.assertEqual(context["attached_document_ids"], ["doc-allowed"])
        self.assertEqual(context["document_id"], "doc-allowed")
        self.assertEqual(context["auth_context"]["tenant_id"], "tenant-a")

    def test_retrieval_source_scope_distinguishes_public_private_and_mixed_results(self) -> None:
        public_result = {
            "chunk_id": "public-chunk",
            "source_id": "dc-code-source",
            "provenance": {"source_type": "statute"},
        }
        document_result = {
            "chunk_id": "doc-chunk",
            "source_id": "document:doc-a",
            "provenance": {"source_type": "tenant_document"},
        }

        self.assertEqual(_result_source_scope([public_result]), "public_dc_sources")
        self.assertEqual(_result_source_scope([document_result]), "tenant_documents")
        self.assertEqual(_result_source_scope([public_result, document_result]), "mixed")

    def test_retrieval_run_persists_safe_source_references_without_raw_query(self) -> None:
        env = DB_ENV_KEYS | {
            "MERCY_ENV": "prod",
            "POSTGRES_URL": "sqlite+pysqlite:///:memory:",
        }
        with patch.dict(os.environ, env, clear=False):
            reset_storage_for_tests()
            get_config.cache_clear()

            retrieval_run_id = record_retrieval_run(
                tenant_context={"tenant_id": "tenant-a", "firm_id": "firm-a", "user_id": "user-a"},
                query="raw confidential question about a client document",
                source_scope="mixed",
                filters={"tenant_id": "tenant-a", "matter_id": "matter-a", "document_ids": ["doc-a"]},
                matter_id="matter-a",
                document_id="doc-a",
                results=[
                    {
                        "chunk_id": "doc-a_chunk_0000",
                        "source_id": "document:doc-a",
                        "combined_score": 0.91,
                        "verification_status": "tenant_document_unverified",
                        "citation": {"label": "Vault document doc-a"},
                        "provenance": {"source_type": "tenant_document"},
                    }
                ],
            )

            self.assertIsNotNone(retrieval_run_id)
            with session_scope() as session:
                record = session.get(RetrievalRunRecord, retrieval_run_id)
                self.assertIsNotNone(record)
                self.assertEqual(record.source_scope, "mixed")
                self.assertEqual(record.tenant_id, "tenant-a")
                self.assertNotEqual(record.query_hash, "raw confidential question about a client document")
                self.assertEqual(record.result_refs_json[0]["chunk_id"], "doc-a_chunk_0000")
                self.assertEqual(record.result_refs_json[0]["source_type"], "tenant_document")

    def test_workbench_retrieval_persists_scoped_document_reliability_metadata(self) -> None:
        env = DB_ENV_KEYS | {
            "MERCY_ENV": "local",
            "POSTGRES_URL": "sqlite+pysqlite:///:memory:",
            "MERCY_RAG_VECTOR_BACKEND": "local",
        }
        with patch.dict(os.environ, env, clear=False):
            reset_storage_for_tests()
            get_config.cache_clear()
            tenant_context = {"tenant_id": "tenant-a", "firm_id": "firm-a", "user_id": "user-a"}
            record_vault_document(
                {
                    "document_id": "doc-allowed",
                    "matter_id": "matter-a",
                    "filename": "allowed.txt",
                    "mime_type": "text/plain",
                    "status": "ready",
                    "extraction_status": "ready",
                },
                tenant_context=tenant_context,
                document_text="agency record support for relocation damages " * 60,
            )
            record_vault_document(
                {
                    "document_id": "doc-other",
                    "matter_id": "matter-b",
                    "filename": "other.txt",
                    "mime_type": "text/plain",
                    "status": "ready",
                    "extraction_status": "ready",
                },
                tenant_context=tenant_context,
                document_text="agency record support for relocation damages " * 60,
            )

            retrieval = DCKnowledgeRAG(RetrievalConfig(vector_backend="local", graph_backend="local")).retrieve(
                "Which private document mentions relocation damages?",
                {
                    "jurisdiction": "District of Columbia",
                    "matter_id": "matter-a",
                    "document_id": "doc-allowed",
                    "attached_document_ids": ["doc-allowed"],
                    "auth_context": tenant_context,
                    "surface_context": "workbench",
                },
                top_k=5,
                agentic=False,
            )

            document_results = [
                result
                for result in retrieval["results"]
                if result["provenance"]["source_type"] == "tenant_document"
            ]
            self.assertGreater(len(document_results), 0)
            self.assertTrue(all(result["document_id"] == "doc-allowed" for result in document_results))
            self.assertNotIn("document:doc-other", {result["source_id"] for result in retrieval["results"]})
            self.assertEqual(retrieval["metadata_filters"]["matter_id"], "matter-a")
            self.assertEqual(retrieval["metadata_filters"]["document_ids"], ["doc-allowed"])

            persistence = retrieval.get("persistence") or {}
            self.assertTrue(persistence.get("retrieval_run_id"))
            self.assertTrue(persistence.get("reliability_snapshot_id"))
            with session_scope() as session:
                retrieval_record = session.get(RetrievalRunRecord, persistence["retrieval_run_id"])
                snapshot_record = session.get(ReliabilitySnapshotRecord, persistence["reliability_snapshot_id"])
                self.assertIsNotNone(retrieval_record)
                self.assertIsNotNone(snapshot_record)
                self.assertEqual(retrieval_record.tenant_id, "tenant-a")
                self.assertEqual(retrieval_record.matter_id, "matter-a")
                self.assertEqual(retrieval_record.document_id, "doc-allowed")
                self.assertEqual(retrieval_record.source_scope, "tenant_documents")
                self.assertEqual(retrieval_record.filters_json["document_ids"], ["doc-allowed"])
                self.assertNotEqual(
                    retrieval_record.query_hash,
                    "Which private document mentions relocation damages?",
                )
                self.assertEqual(snapshot_record.retrieval_run_id, retrieval_record.retrieval_run_id)
                self.assertEqual(snapshot_record.matter_id, "matter-a")
                self.assertEqual(snapshot_record.document_id, "doc-allowed")

    def test_upload_route_persists_general_vault_document_and_limited_status(self) -> None:
        env = DB_ENV_KEYS | {
            "MERCY_ENV": "local",
            "POSTGRES_URL": "sqlite+pysqlite:///:memory:",
            "MERCY_AUTH_MODE": "dev",
        }
        with tempfile.TemporaryDirectory() as temp_dir, patch.dict(os.environ, env, clear=False):
            reset_storage_for_tests()
            get_config.cache_clear()
            from auth_context import TenantUser
            import main

            tenant_user = TenantUser(tenant_id="tenant-upload", user_id="user-upload", auth_mode="unit_test")

            async def exercise_upload(filename: str, content: bytes, document_text: str | None) -> dict[str, object]:
                upload = UploadFile(
                    file=BytesIO(content),
                    filename=filename,
                    headers=Headers({"content-type": "application/pdf"}),
                )
                return await main.workspace_discovery_upload(
                    file=upload,
                    document_text=document_text,
                    matter_id=None,
                    tenant_user=tenant_user,
                )

            with (
                patch.object(main, "UPLOAD_DIR", Path(temp_dir)),
                patch.object(main, "_matter_context", return_value={}),
                patch.object(main, "moe_route", return_value={"expert": "discovery", "confidence": 0.9}),
                patch.object(main, "run_discovery", return_value={"facts": {}, "citations": []}),
            ):
                readable = asyncio.run(
                    exercise_upload(
                        "readable.pdf",
                        b"%PDF-readable",
                        "Readable tenant upload text for durable chunk storage. " * 80,
                    )
                )
                limited = asyncio.run(exercise_upload("limited.pdf", b"%PDF-limited", None))

            readable_doc = readable["document"]
            limited_doc = limited["document"]
            self.assertIsInstance(readable_doc, dict)
            self.assertIsInstance(limited_doc, dict)
            self.assertEqual(readable_doc["status"], "ready")
            self.assertEqual(readable_doc["extraction_status"], "ready")
            self.assertEqual(limited_doc["status"], "extraction_limited")
            self.assertEqual(limited_doc["extraction_status"], "extraction_limited")
            self.assertEqual(limited_doc["extraction_progress"], 0)
            self.assertIsNone(readable_doc["matter_id"])
            self.assertTrue(readable_doc["persistent_storage"]["persisted"])

            with session_scope() as session:
                readable_record = session.get(DocumentRecord, readable_doc["document_id"])
                limited_record = session.get(DocumentRecord, limited_doc["document_id"])
                readable_chunks = (
                    session.query(DocumentChunkRecord)
                    .filter(DocumentChunkRecord.tenant_id == "tenant-upload")
                    .filter(DocumentChunkRecord.document_id == readable_doc["document_id"])
                    .all()
                )
                limited_chunks = (
                    session.query(DocumentChunkRecord)
                    .filter(DocumentChunkRecord.tenant_id == "tenant-upload")
                    .filter(DocumentChunkRecord.document_id == limited_doc["document_id"])
                    .all()
                )
                self.assertIsNotNone(readable_record)
                self.assertIsNotNone(limited_record)
                self.assertEqual(readable_record.status, "ready")
                self.assertEqual(limited_record.status, "extraction_limited")
                self.assertGreater(len(readable_chunks), 0)
                self.assertTrue(all(chunk.embedding_vector is not None for chunk in readable_chunks))
                self.assertEqual(limited_chunks, [])


if __name__ == "__main__":
    unittest.main()
