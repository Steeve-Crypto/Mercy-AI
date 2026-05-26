from __future__ import annotations

import argparse
from datetime import UTC, datetime
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dc_knowledge_rag import _result_source_scope, _search_document_vectors, _search_legal_source_vectors  # noqa: E402
from mercy_storage import (  # noqa: E402
    DEFAULT_EMBEDDING_DIMENSIONS,
    DocumentChunkRecord,
    DocumentRecord,
    LegalSourceChunkRecord,
    LegalSourceRecord,
    ReliabilitySnapshotRecord,
    RetrievalRunRecord,
    configured_database_url,
    get_engine,
    validate_configured_database_url,
)


TENANT_A = "pgvector-check-tenant-a"
TENANT_B = "pgvector-check-tenant-b"
MATTER_ID = "pgvector-check-matter"
DOCUMENT_ID = "pgvector-check-document"
LEGAL_SOURCE_ID = "pgvector-check-dc-source"
LEGAL_CHUNK_ID = "pgvector-check-dc-source-chunk"
DOCUMENT_CHUNK_ID = "pgvector-check-document-chunk"
RETRIEVAL_RUN_ID = "pgvector-check-retrieval-run"
RELIABILITY_SNAPSHOT_ID = "pgvector-check-reliability-snapshot"
RAW_QUERY_TEXT = "Confidential live-check question about a tenant document."


def _embedding(seed: float) -> list[float]:
    vector = [0.0] * DEFAULT_EMBEDDING_DIMENSIONS
    vector[0] = seed
    vector[1] = 1.0 - seed
    return vector


def _safe_error_summary(exc: Exception) -> str:
    message = str(exc).splitlines()[0].strip()
    message = re.sub(r"postgres(?:ql)?(?:\+psycopg)?://\S+", "[redacted-db-url]", message)
    message = re.sub(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", "[redacted-ip]", message)
    message = re.sub(r"([\w.-]+)\.supabase\.com", "[redacted-supabase-host]", message)
    if len(message) > 500:
        message = f"{message[:497]}..."
    return f"{type(exc).__name__}: {message}"


def _result_dict(hit: Any) -> dict[str, Any]:
    return hit.chunk.to_result(hit.score, 0.0, hit.score, retrieval_method="pgvector_live_check")


def _insert_rollback_fixtures(session: Any) -> None:
    now = datetime.now(UTC)
    session.add(
        LegalSourceRecord(
            source_id=LEGAL_SOURCE_ID,
            title="Mercy pgvector live check D.C. source",
            source_type="statute",
            authority_type="statute",
            jurisdiction="District of Columbia",
            citation_label="Mercy pgvector live check",
            official_locator="Rollback-only pgvector live check locator",
            url=None,
            file_anchor=None,
            last_checked="2026-05-26",
            verification_status="official_metadata_unquoted",
            refresh_cadence="manual",
            local_demo=False,
            active=True,
            created_at=now,
            updated_at=now,
        )
    )
    session.flush()
    session.add(
        LegalSourceChunkRecord(
            chunk_id=LEGAL_CHUNK_ID,
            source_id=LEGAL_SOURCE_ID,
            text="Rollback-only D.C. public source chunk for pgvector retrieval verification.",
            summary="Rollback-only public source chunk.",
            source_title="Mercy pgvector live check D.C. source",
            citation_label="Mercy pgvector live check",
            source_type="statute",
            authority_type="statute",
            jurisdiction="District of Columbia",
            official_locator="Rollback-only pgvector live check locator",
            url=None,
            entities=[],
            relationships=[],
            verification_status="official_metadata_unquoted",
            citation_required=True,
            last_checked="2026-05-26",
            practice_area="civil_procedure",
            source_date=None,
            embedding_model="mercy-check-embedding-384",
            embedding_vector=_embedding(0.95),
            created_at=now,
            updated_at=now,
        )
    )
    session.add(
        DocumentRecord(
            document_id=DOCUMENT_ID,
            tenant_id=TENANT_A,
            firm_id=None,
            matter_id=MATTER_ID,
            uploaded_by_user_id="pgvector-check-user",
            filename="pgvector-check.txt",
            mime_type="text/plain",
            storage_provider="rollback_fixture",
            storage_key="rollback://pgvector-check",
            sha256="0" * 64,
            size_bytes=128,
            status="ready",
            extraction_status="ready",
            metadata_json={"source": "rollback_live_check"},
            created_at=now,
            updated_at=now,
        )
    )
    session.flush()
    session.add(
        DocumentChunkRecord(
            chunk_id=DOCUMENT_CHUNK_ID,
            tenant_id=TENANT_A,
            firm_id=None,
            matter_id=MATTER_ID,
            document_id=DOCUMENT_ID,
            chunk_index=0,
            text="Rollback-only tenant private document chunk for pgvector retrieval verification.",
            summary="Rollback-only private document chunk.",
            token_count=10,
            embedding_model="mercy-check-embedding-384",
            embedding_vector=_embedding(0.9),
            metadata_json={"source": "rollback_live_check"},
            created_at=now,
            updated_at=now,
        )
    )
    session.flush()


def _insert_retrieval_metadata_fixture(session: Any, results: list[dict[str, Any]]) -> tuple[bool, bool]:
    now = datetime.now(UTC)
    session.add(
        RetrievalRunRecord(
            retrieval_run_id=RETRIEVAL_RUN_ID,
            tenant_id=TENANT_A,
            firm_id=None,
            user_id="pgvector-check-user",
            matter_id=MATTER_ID,
            document_id=DOCUMENT_ID,
            query_hash=hashlib.sha256(RAW_QUERY_TEXT.encode("utf-8")).hexdigest(),
            source_scope=_result_source_scope(results),
            filters_json={"tenant_id": TENANT_A, "matter_id": MATTER_ID, "document_id": DOCUMENT_ID},
            result_refs_json=[
                {
                    "chunk_id": item.get("chunk_id"),
                    "source_id": item.get("source_id"),
                    "source_type": (item.get("provenance") or {}).get("source_type")
                    if isinstance(item.get("provenance"), dict)
                    else None,
                    "citation_label": (item.get("citation") or {}).get("label")
                    if isinstance(item.get("citation"), dict)
                    else None,
                    "combined_score": item.get("combined_score"),
                }
                for item in results[:20]
            ],
            created_at=now,
        )
    )
    session.flush()
    session.add(
        ReliabilitySnapshotRecord(
            snapshot_id=RELIABILITY_SNAPSHOT_ID,
            tenant_id=TENANT_A,
            firm_id=None,
            user_id="pgvector-check-user",
            matter_id=MATTER_ID,
            document_id=DOCUMENT_ID,
            retrieval_run_id=RETRIEVAL_RUN_ID,
            work_history_id=None,
            confidence_score=0.5,
            guardrail_status="warn",
            attorney_review_required=True,
            citations_json=[item.get("citation") for item in results[:20] if item.get("citation")],
            reliability_json={"status": "warn", "human_review_required": True, "source_scope": _result_source_scope(results)},
            created_at=now,
        )
    )
    session.flush()
    retrieval_record = session.get(RetrievalRunRecord, RETRIEVAL_RUN_ID)
    snapshot_record = session.get(ReliabilitySnapshotRecord, RELIABILITY_SNAPSHOT_ID)
    query_text_stored = bool(retrieval_record and retrieval_record.query_hash == RAW_QUERY_TEXT)
    snapshot_linked = bool(snapshot_record and snapshot_record.retrieval_run_id == RETRIEVAL_RUN_ID)
    return query_text_stored, snapshot_linked


def pgvector_retrieval_readiness(*, rollback_fixtures: bool = False) -> dict[str, Any]:
    ok, issue = validate_configured_database_url()
    issues: list[str] = []
    if not ok:
        issues.append(issue or "Database URL is not configured.")
    if not configured_database_url():
        issues.append("No database URL is configured.")
    if issues:
        return {"ok": False, "issues": issues, "database_checked": False}

    engine = get_engine()
    if not engine.dialect.name.startswith("postgres"):
        return {
            "ok": False,
            "issues": ["PostgreSQL/Supabase Postgres is required for SQL pgvector retrieval verification."],
            "database_checked": True,
        }

    from mercy_storage import sessionmaker  # noqa: PLC0415

    session_factory = sessionmaker(bind=engine, expire_on_commit=False, future=True)
    session = session_factory()
    transaction = session.begin()
    try:
        if rollback_fixtures:
            _insert_rollback_fixtures(session)

        query_embedding = _embedding(1.0)
        public_hits = _search_legal_source_vectors(
            session,
            query_embedding,
            {"jurisdiction": "District of Columbia"},
            5,
        )
        tenant_hits = _search_document_vectors(
            session,
            query_embedding,
            {"tenant_id": TENANT_A, "matter_id": MATTER_ID, "document_id": DOCUMENT_ID},
            5,
        )
        cross_tenant_hits = _search_document_vectors(
            session,
            query_embedding,
            {"tenant_id": TENANT_B, "matter_id": MATTER_ID, "document_id": DOCUMENT_ID},
            5,
        )
        combined_results = [_result_dict(hit) for hit in [*public_hits, *tenant_hits]]
        source_scope = _result_source_scope(combined_results)
        query_text_stored = False
        retrieval_metadata_persisted = False
        reliability_snapshot_linked = False
        if rollback_fixtures and combined_results:
            query_text_stored, reliability_snapshot_linked = _insert_retrieval_metadata_fixture(session, combined_results)
            retrieval_metadata_persisted = bool(session.get(RetrievalRunRecord, RETRIEVAL_RUN_ID))

        if not public_hits:
            issues.append("No public D.C. legal source pgvector hits were returned.")
        if not tenant_hits:
            issues.append("No tenant-private document pgvector hits were returned.")
        if cross_tenant_hits:
            issues.append("Cross-tenant private document pgvector retrieval returned hits.")
        if source_scope != "mixed":
            issues.append(f"Expected mixed retrieval source scope, got {source_scope}.")
        if rollback_fixtures and not retrieval_metadata_persisted:
            issues.append("Retrieval run metadata was not persisted inside rollback transaction.")
        if rollback_fixtures and not reliability_snapshot_linked:
            issues.append("Reliability snapshot did not link to the rollback retrieval run.")
        if query_text_stored:
            issues.append("Raw query text was stored in retrieval metadata.")

        return {
            "ok": not issues,
            "issues": issues,
            "database_checked": True,
            "rollback_fixtures": rollback_fixtures,
            "public_hit_count": len(public_hits),
            "tenant_document_hit_count": len(tenant_hits),
            "cross_tenant_hit_count": len(cross_tenant_hits),
            "source_scope": source_scope,
            "retrieval_metadata_persisted": retrieval_metadata_persisted,
            "reliability_snapshot_linked": reliability_snapshot_linked,
            "query_text_stored": query_text_stored,
        }
    except Exception as exc:
        return {
            "ok": False,
            "issues": [
                "SQL pgvector retrieval verification failed. Check database connectivity, schema, and pgvector permissions.",
                _safe_error_summary(exc),
            ],
            "database_checked": True,
            "rollback_fixtures": rollback_fixtures,
        }
    finally:
        transaction.rollback()
        session.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Rollback-only SQL pgvector retrieval verification.")
    parser.add_argument(
        "--rollback-fixtures",
        action="store_true",
        help="Insert public/private test chunks inside a transaction that is always rolled back.",
    )
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    args = parser.parse_args(argv)

    result = pgvector_retrieval_readiness(rollback_fixtures=args.rollback_fixtures)
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print("PASS pgvector retrieval" if result["ok"] else "FAIL pgvector retrieval")
        for issue in result["issues"]:
            print(f"- {issue}")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
