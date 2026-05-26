from __future__ import annotations

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "mercy-legal-web" / "supabase" / "migrations" / "202605260001_pgvector_storage_foundation.sql"
PROVISIONING = ROOT / "mercy-legal-web" / "src" / "lib" / "signup" / "provisioning.ts"
CHECK_SCRIPT = ROOT / "scripts" / "check_pgvector_storage_foundation.py"
RETRIEVAL_CHECK_SCRIPT = ROOT / "scripts" / "check_pgvector_retrieval.py"
VAULT_CHECK_SCRIPT = ROOT / "scripts" / "check_vault_document_storage.py"
DC_SOURCE_CHECK_SCRIPT = ROOT / "scripts" / "check_dc_source_ingestion_storage.py"
WORK_HISTORY_MIGRATION = ROOT / "mercy-legal-web" / "supabase" / "migrations" / "202605250001_work_history.sql"


class PgVectorStorageFoundationSqlTests(unittest.TestCase):
    def test_migration_declares_pgvector_and_separated_public_private_tables(self) -> None:
        sql = MIGRATION.read_text(encoding="utf-8")

        self.assertIn("create extension if not exists vector", sql)
        self.assertIn("create table if not exists public.mercy_documents", sql)
        self.assertIn("create table if not exists public.mercy_document_chunks", sql)
        self.assertIn("create table if not exists public.mercy_legal_sources", sql)
        self.assertIn("create table if not exists public.mercy_legal_source_chunks", sql)
        self.assertIn("embedding_vector vector(384)", sql)
        self.assertIn("using hnsw (embedding_vector vector_cosine_ops)", sql)
        self.assertIn("references public.mercy_documents", sql)
        self.assertIn("references public.mercy_legal_sources", sql)

    def test_legacy_dc_chunk_pgvector_index_is_guarded_for_fresh_databases(self) -> None:
        sql = MIGRATION.read_text(encoding="utf-8")

        self.assertIn("if to_regclass('public.mercy_dc_chunks') is not null then", sql)
        self.assertIn("create index if not exists mercy_dc_chunks_embedding_hnsw_idx", sql)

    def test_migration_preserves_firm_parent_tenant_child_compatibility(self) -> None:
        sql = MIGRATION.read_text(encoding="utf-8")

        self.assertIn("add column if not exists parent_firm_id text", sql)
        self.assertIn("set parent_firm_id = firm_id", sql)
        self.assertIn("mercy_tenants_parent_workspace_idx", sql)
        self.assertIn("mercy_tenants_firm_workspace_idx", sql)
        self.assertIn("firm home workspace for compatibility", sql)
        self.assertNotIn("drop table", sql.lower())

    def test_signup_provisioning_writes_parent_firm_id_without_changing_seat_rules(self) -> None:
        source = PROVISIONING.read_text(encoding="utf-8")

        self.assertIn("parent_firm_id: firmId", source)
        self.assertIn('signup.accountType === "firm" ? ["admin", "firm_admin", "attorney"] : ["admin", "attorney"]', source)
        self.assertIn("attorney_seat_limit: signup.seats", source)
        self.assertNotIn("minimum", source.lower())

    def test_read_only_pgvector_foundation_checker_covers_required_tables(self) -> None:
        source = CHECK_SCRIPT.read_text(encoding="utf-8")

        self.assertIn("pgvector_storage_readiness", source)
        self.assertIn("mercy_documents", source)
        self.assertIn("mercy_document_chunks", source)
        self.assertIn("mercy_legal_sources", source)
        self.assertIn("mercy_legal_source_chunks", source)
        self.assertIn("FIRM_TENANT_TABLE_COLUMNS", source)
        self.assertIn('"mercy_tenants": {"tenant_id", "firm_id", "parent_firm_id"}', source)
        self.assertIn("mercy_tenants_parent_workspace_idx", source)
        self.assertIn("mercy_tenants_firm_workspace_idx", source)
        self.assertIn("pg_extension where extname = 'vector'", source)
        self.assertIn("relrowsecurity", source)
        self.assertNotIn("create table", source.lower())
        self.assertNotIn("drop table", source.lower())

    def test_pgvector_retrieval_checker_uses_rollback_fixtures_and_scope_checks(self) -> None:
        source = RETRIEVAL_CHECK_SCRIPT.read_text(encoding="utf-8")

        self.assertIn("pgvector_retrieval_readiness", source)
        self.assertIn("_search_legal_source_vectors", source)
        self.assertIn("_search_document_vectors", source)
        self.assertIn("transaction.rollback()", source)
        self.assertIn("cross_tenant_hit_count", source)
        self.assertIn("RetrievalRunRecord", source)
        self.assertIn("ReliabilitySnapshotRecord", source)
        self.assertIn("retrieval_metadata_persisted", source)
        self.assertIn("reliability_snapshot_linked", source)
        self.assertIn("Raw query text was stored in retrieval metadata.", source)
        self.assertNotIn("commit()", source)
        self.assertNotIn("drop table", source.lower())

    def test_vault_and_dc_source_checkers_are_rollback_only(self) -> None:
        for script in (VAULT_CHECK_SCRIPT, DC_SOURCE_CHECK_SCRIPT):
            source = script.read_text(encoding="utf-8")

            self.assertIn("transaction.rollback()", source)
            self.assertIn("rollback_fixtures", source)
            self.assertNotIn("commit()", source)
            self.assertNotIn("drop table", source.lower())
        vault_source = VAULT_CHECK_SCRIPT.read_text(encoding="utf-8")
        dc_source = DC_SOURCE_CHECK_SCRIPT.read_text(encoding="utf-8")
        self.assertIn("extraction_limited", vault_source)
        self.assertIn("same_bytes_other_tenant_chunk_count", vault_source)
        self.assertIn("LegalSourceRecord", dc_source)
        self.assertIn("LegalSourceChunkRecord", dc_source)

    def test_work_history_can_link_to_retrieval_and_reliability_records(self) -> None:
        work_history_sql = WORK_HISTORY_MIGRATION.read_text(encoding="utf-8")
        pgvector_sql = MIGRATION.read_text(encoding="utf-8")
        checker = CHECK_SCRIPT.read_text(encoding="utf-8")

        for source in (work_history_sql, pgvector_sql):
            self.assertIn("retrieval_run_id text", source)
            self.assertIn("reliability_snapshot_id text", source)
            self.assertIn("mercy_work_history_retrieval_idx", source)
            self.assertIn("mercy_work_history_reliability_idx", source)
        self.assertIn("mercy_work_history_retrieval_fk", pgvector_sql)
        self.assertIn("mercy_work_history_reliability_fk", pgvector_sql)
        self.assertIn("mercy_reliability_snapshots_work_history_fk", pgvector_sql)
        self.assertIn('"mercy_work_history": {"retrieval_run_id", "reliability_snapshot_id"}', checker)


if __name__ == "__main__":
    unittest.main()
