from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from mercy_storage import configured_database_url, get_engine, validate_configured_database_url  # noqa: E402


REQUIRED_TABLES = {
    "mercy_documents": {"tenant_id", "firm_id", "matter_id", "document_id", "status", "extraction_status"},
    "mercy_document_chunks": {"tenant_id", "firm_id", "matter_id", "document_id", "chunk_id", "embedding_vector"},
    "mercy_legal_sources": {"source_id", "jurisdiction", "citation_label", "official_locator", "verification_status"},
    "mercy_legal_source_chunks": {"source_id", "chunk_id", "citation_label", "official_locator", "embedding_vector"},
    "mercy_embedding_jobs": {"job_id", "target_type", "target_id", "status", "dimensions"},
    "mercy_retrieval_runs": {"retrieval_run_id", "tenant_id", "query_hash", "source_scope", "result_refs_json"},
    "mercy_reliability_snapshots": {"snapshot_id", "tenant_id", "retrieval_run_id", "citations_json", "reliability_json"},
}

OPTIONAL_TABLE_COLUMNS = {
    "mercy_work_history": {"retrieval_run_id", "reliability_snapshot_id"},
}

FIRM_TENANT_TABLE_COLUMNS = {
    "mercy_tenants": {"tenant_id", "firm_id", "parent_firm_id"},
    "mercy_firms": {"firm_id", "tenant_id"},
    "mercy_tenant_members": {"tenant_id", "firm_id", "user_id"},
}

FIRM_TENANT_INDEXES = {
    "mercy_tenants_parent_firm_idx",
    "mercy_tenants_firm_workspace_idx",
    "mercy_tenants_parent_workspace_idx",
}


def pgvector_storage_readiness(*, check_database: bool = True) -> dict[str, Any]:
    ok, issue = validate_configured_database_url()
    issues: list[str] = []
    if not ok:
        issues.append(issue or "Database URL is not configured.")
    if not configured_database_url():
        issues.append("No database URL is configured.")
    if not check_database or issues:
        return {"ok": not issues, "issues": issues, "database_checked": False}

    try:
        from sqlalchemy import inspect
    except Exception as exc:
        return {"ok": False, "issues": [f"SQLAlchemy inspection is unavailable: {exc}"], "database_checked": False}

    engine = get_engine()
    if not engine.dialect.name.startswith("postgres"):
        return {
            "ok": False,
            "issues": ["PostgreSQL/Supabase Postgres is required for pgvector readiness verification."],
            "database_checked": True,
        }

    inspector = inspect(engine)
    for table, columns in REQUIRED_TABLES.items():
        if not inspector.has_table(table, schema="public"):
            issues.append(f"Required table public.{table} is missing.")
            continue
        present = {column["name"] for column in inspector.get_columns(table, schema="public")}
        missing = sorted(columns - present)
        if missing:
            issues.append(f"public.{table} is missing columns: {', '.join(missing)}.")
    for table, columns in OPTIONAL_TABLE_COLUMNS.items():
        if not inspector.has_table(table, schema="public"):
            continue
        present = {column["name"] for column in inspector.get_columns(table, schema="public")}
        missing = sorted(columns - present)
        if missing:
            issues.append(f"public.{table} is present but missing storage linkage columns: {', '.join(missing)}.")
    for table, columns in FIRM_TENANT_TABLE_COLUMNS.items():
        if not inspector.has_table(table, schema="public"):
            issues.append(f"Firm/tenant schema table public.{table} is missing.")
            continue
        present = {column["name"] for column in inspector.get_columns(table, schema="public")}
        missing = sorted(columns - present)
        if missing:
            issues.append(f"public.{table} is missing firm/tenant columns: {', '.join(missing)}.")
    if inspector.has_table("mercy_tenants", schema="public"):
        present_indexes = {index["name"] for index in inspector.get_indexes("mercy_tenants", schema="public")}
        missing_indexes = sorted(FIRM_TENANT_INDEXES - present_indexes)
        if missing_indexes:
            issues.append(f"public.mercy_tenants is missing firm/tenant indexes: {', '.join(missing_indexes)}.")

    with engine.connect() as connection:
        vector_extension = connection.exec_driver_sql(
            "select exists (select 1 from pg_extension where extname = 'vector')"
        ).scalar()
        if not vector_extension:
            issues.append("pgvector extension is not enabled.")

        vector_columns = connection.exec_driver_sql(
            """
            select table_name, column_name
            from information_schema.columns
            where table_schema = 'public'
              and table_name in ('mercy_document_chunks', 'mercy_legal_source_chunks')
              and column_name = 'embedding_vector'
              and udt_name = 'vector'
            """
        ).fetchall()
        vector_column_tables = {row[0] for row in vector_columns}
        for table in ("mercy_document_chunks", "mercy_legal_source_chunks"):
            if table not in vector_column_tables:
                issues.append(f"public.{table}.embedding_vector is not a pgvector column.")

        rls_rows = connection.exec_driver_sql(
            """
            select relname, relrowsecurity
            from pg_class
            where relnamespace = 'public'::regnamespace
              and relname in (
                'mercy_documents',
                'mercy_document_chunks',
                'mercy_legal_sources',
                'mercy_legal_source_chunks',
                'mercy_embedding_jobs',
                'mercy_retrieval_runs',
                'mercy_reliability_snapshots'
              )
            """
        ).fetchall()
        for table, enabled in rls_rows:
            if not bool(enabled):
                issues.append(f"public.{table} must have row level security enabled.")

    return {"ok": not issues, "issues": issues, "database_checked": True}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only pgvector storage foundation readiness check.")
    parser.add_argument("--skip-db", action="store_true", help="Only validate DB URL configuration, not live schema.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    args = parser.parse_args(argv)

    result = pgvector_storage_readiness(check_database=not args.skip_db)
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print("PASS pgvector storage foundation" if result["ok"] else "FAIL pgvector storage foundation")
        for issue in result["issues"]:
            print(f"- {issue}")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
