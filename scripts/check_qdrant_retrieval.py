from __future__ import annotations

import argparse
from datetime import UTC, datetime
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dc_knowledge_rag import (  # noqa: E402
    FallbackVectorAdapter,
    KnowledgeChunk,
    PgVectorAdapter,
    QdrantVectorAdapter,
    RetrievalBackendError,
    RetrievalConfig,
    _qdrant_payload,
    _result_source_scope,
)
from mercy_config import get_config  # noqa: E402
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
    session_scope,
    validate_configured_database_url,
)


TENANT_A = "qdrant-check-tenant-a"
TENANT_B = "qdrant-check-tenant-b"
MATTER_A = "qdrant-check-matter-a"
MATTER_B = "qdrant-check-matter-b"
DOCUMENT_A = "qdrant-check-document-a"
DOCUMENT_B = "qdrant-check-document-b"
SOURCE_ID = "qdrant-check-dc-source"
PUBLIC_CHUNK_ID = "qdrant-check-public-chunk"
DOCUMENT_A_CHUNK_ID = "qdrant-check-document-a-chunk"
DOCUMENT_B_CHUNK_ID = "qdrant-check-document-b-chunk"
RAW_QUERY_TEXT = "Confidential Qdrant live-check query."


def _embedding(seed: float) -> list[float]:
    vector = [0.0] * DEFAULT_EMBEDDING_DIMENSIONS
    vector[0] = seed
    vector[1] = 1.0 - seed
    return vector


def _safe_error_summary(exc: Exception) -> str:
    message = str(exc).splitlines()[0].strip()
    message = re.sub(r"postgres(?:ql)?(?:\+psycopg)?://\S+", "[redacted-db-url]", message)
    message = re.sub(r"https?://\S+", "[redacted-url]", message)
    message = re.sub(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", "[redacted-ip]", message)
    message = re.sub(r"([\w.-]+)\.supabase\.com", "[redacted-supabase-host]", message)
    if len(message) > 500:
        message = f"{message[:497]}..."
    return f"{type(exc).__name__}: {message}"


def _test_collection_name() -> str:
    prefix = (get_config().qdrant_collection_prefix or "mercy_check").strip("_") or "mercy_check"
    return f"{prefix}_qdrant_live_check_{uuid4().hex[:12]}"


def _qdrant_credentials() -> tuple[str | None, str | None]:
    config = get_config()
    api_key = config.qdrant_api_key.get_secret_value() if config.qdrant_api_key else None
    return config.qdrant_url, api_key


def _collection_vector_schema(collection_info: Any) -> tuple[str, int | None]:
    config = getattr(collection_info, "config", None)
    params = getattr(config, "params", None)
    vectors = getattr(params, "vectors", None)
    if isinstance(vectors, dict):
        first_vector = next(iter(vectors.values()), None)
        return "named", getattr(first_vector, "size", None)
    return "unnamed", getattr(vectors, "size", None)


def _chunks() -> list[KnowledgeChunk]:
    return [
        KnowledgeChunk(
            chunk_id=PUBLIC_CHUNK_ID,
            source_id=SOURCE_ID,
            text="Rollback-only public D.C. source chunk about administrative record verification.",
            summary="Rollback-only public source chunk.",
            source_title="Qdrant live check D.C. source",
            citation_label="Qdrant D.C. Source",
            source_type="statute",
            authority_type="statute",
            jurisdiction="District of Columbia",
            official_locator="Rollback-only Qdrant live check locator",
            verification_status="official_metadata_unquoted",
            practice_area="civil_procedure",
        ),
        KnowledgeChunk(
            chunk_id=DOCUMENT_A_CHUNK_ID,
            source_id=f"document:{DOCUMENT_A}",
            text="Rollback-only tenant alpha private document chunk about relocation damages.",
            summary="Tenant alpha private document chunk.",
            source_title="Vault document qdrant-check-document-a",
            citation_label="Vault document qdrant-check-document-a",
            source_type="tenant_document",
            authority_type="record",
            jurisdiction="Tenant private document",
            official_locator=f"tenant:{TENANT_A}/document:{DOCUMENT_A}/chunk:0",
            verification_status="tenant_document_unverified",
            practice_area="tenant_document",
            tenant_id=TENANT_A,
            firm_id="qdrant-check-firm-a",
            matter_id=MATTER_A,
            document_id=DOCUMENT_A,
            filename="qdrant-check-a.pdf",
            document_status="ready",
            extraction_status="ready",
        ),
        KnowledgeChunk(
            chunk_id=DOCUMENT_B_CHUNK_ID,
            source_id=f"document:{DOCUMENT_B}",
            text="Rollback-only tenant beta private document chunk about procurement protest timing.",
            summary="Tenant beta private document chunk.",
            source_title="Vault document qdrant-check-document-b",
            citation_label="Vault document qdrant-check-document-b",
            source_type="tenant_document",
            authority_type="record",
            jurisdiction="Tenant private document",
            official_locator=f"tenant:{TENANT_B}/document:{DOCUMENT_B}/chunk:0",
            verification_status="tenant_document_unverified",
            practice_area="tenant_document",
            tenant_id=TENANT_B,
            firm_id="qdrant-check-firm-b",
            matter_id=MATTER_B,
            document_id=DOCUMENT_B,
            filename="qdrant-check-b.pdf",
            document_status="ready",
            extraction_status="ready",
        ),
    ]


def _result_dict(hit: Any) -> dict[str, Any]:
    return hit.chunk.to_result(hit.score, 0.0, hit.score, retrieval_method=hit.backend)


def _insert_pgvector_fixtures() -> None:
    now = datetime.now(UTC)
    with session_scope() as session:
        session.add(
            LegalSourceRecord(
                source_id=SOURCE_ID,
                title="Qdrant fallback D.C. source",
                source_type="statute",
                authority_type="statute",
                jurisdiction="District of Columbia",
                citation_label="Qdrant D.C. Source",
                official_locator="Rollback-only Qdrant fallback locator",
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
                chunk_id=PUBLIC_CHUNK_ID,
                source_id=SOURCE_ID,
                text="Rollback-only public D.C. source chunk about administrative record verification.",
                summary="Rollback-only public source chunk.",
                source_title="Qdrant fallback D.C. source",
                citation_label="Qdrant D.C. Source",
                source_type="statute",
                authority_type="statute",
                jurisdiction="District of Columbia",
                official_locator="Rollback-only Qdrant fallback locator",
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
                document_id=DOCUMENT_A,
                tenant_id=TENANT_A,
                firm_id="qdrant-check-firm-a",
                matter_id=MATTER_A,
                uploaded_by_user_id="qdrant-check-user",
                filename="qdrant-check-a.pdf",
                mime_type="application/pdf",
                storage_provider="qdrant_check",
                storage_key="qdrant-check://document-a",
                sha256="2" * 64,
                size_bytes=128,
                status="ready",
                extraction_status="ready",
                metadata_json={"source": "qdrant_live_check"},
                created_at=now,
                updated_at=now,
            )
        )
        session.flush()
        session.add(
            DocumentChunkRecord(
                chunk_id=DOCUMENT_A_CHUNK_ID,
                tenant_id=TENANT_A,
                firm_id="qdrant-check-firm-a",
                matter_id=MATTER_A,
                document_id=DOCUMENT_A,
                chunk_index=0,
                text="Rollback-only tenant alpha private document chunk about relocation damages.",
                summary="Tenant alpha private document chunk.",
                token_count=10,
                embedding_model="mercy-check-embedding-384",
                embedding_vector=_embedding(0.9),
                metadata_json={"source": "qdrant_live_check"},
                created_at=now,
                updated_at=now,
            )
        )


def _persist_metadata_fixture(*, run_id: str, snapshot_id: str, results: list[dict[str, Any]]) -> tuple[bool, bool, bool]:
    now = datetime.now(UTC)
    with session_scope() as session:
        session.add(
            RetrievalRunRecord(
                retrieval_run_id=run_id,
                tenant_id=TENANT_A,
                firm_id="qdrant-check-firm-a",
                user_id="qdrant-check-user",
                matter_id=MATTER_A,
                document_id=DOCUMENT_A,
                query_hash=hashlib.sha256(RAW_QUERY_TEXT.encode("utf-8")).hexdigest(),
                source_scope=_result_source_scope(results),
                filters_json={"tenant_id": TENANT_A, "matter_id": MATTER_A, "document_id": DOCUMENT_A},
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
                snapshot_id=snapshot_id,
                tenant_id=TENANT_A,
                firm_id="qdrant-check-firm-a",
                user_id="qdrant-check-user",
                matter_id=MATTER_A,
                document_id=DOCUMENT_A,
                retrieval_run_id=run_id,
                confidence_score=0.5,
                guardrail_status="warn",
                attorney_review_required=True,
                citations_json=[item.get("citation") for item in results[:20] if item.get("citation")],
                reliability_json={"status": "warn", "source_scope": _result_source_scope(results)},
                created_at=now,
            )
        )
    with session_scope() as session:
        retrieval_record = session.get(RetrievalRunRecord, run_id)
        snapshot_record = session.get(ReliabilitySnapshotRecord, snapshot_id)
        return (
            bool(retrieval_record),
            bool(snapshot_record and snapshot_record.retrieval_run_id == run_id),
            bool(retrieval_record and retrieval_record.query_hash == RAW_QUERY_TEXT),
        )


def _cleanup_pgvector_fixtures() -> None:
    try:
        with session_scope() as session:
            for snapshot_id in ("qdrant-check-snapshot", "qdrant-check-fallback-snapshot"):
                snapshot = session.get(ReliabilitySnapshotRecord, snapshot_id)
                if snapshot is not None:
                    session.delete(snapshot)
            for run_id in ("qdrant-check-run", "qdrant-check-fallback-run"):
                run = session.get(RetrievalRunRecord, run_id)
                if run is not None:
                    session.delete(run)
            for chunk_id in (DOCUMENT_A_CHUNK_ID, PUBLIC_CHUNK_ID):
                doc_chunk = session.get(DocumentChunkRecord, chunk_id)
                if doc_chunk is not None:
                    session.delete(doc_chunk)
                source_chunk = session.get(LegalSourceChunkRecord, chunk_id)
                if source_chunk is not None:
                    session.delete(source_chunk)
            document = session.get(DocumentRecord, DOCUMENT_A)
            if document is not None:
                session.delete(document)
            source = session.get(LegalSourceRecord, SOURCE_ID)
            if source is not None:
                session.delete(source)
    except Exception:
        pass


class _BrokenQdrant:
    name = "qdrant"

    def search(self, *_args: object) -> list[Any]:
        raise RetrievalBackendError("qdrant unavailable during live fallback check")

    def status(self) -> dict[str, Any]:
        return {"backend": "qdrant", "connected": False}


def qdrant_retrieval_readiness() -> dict[str, Any]:
    qdrant_url, qdrant_api_key = _qdrant_credentials()
    if not qdrant_url:
        return {"ok": False, "issues": ["MERCY_QDRANT_URL is required for live Qdrant verification."], "qdrant_checked": False}
    db_ok, db_issue = validate_configured_database_url()
    if not db_ok or not configured_database_url():
        return {"ok": False, "issues": [db_issue or "Postgres/pgvector database URL is required for fallback proof."], "qdrant_checked": False}
    engine = get_engine()
    if not engine.dialect.name.startswith("postgres"):
        return {"ok": False, "issues": ["PostgreSQL/Supabase Postgres is required for pgvector fallback proof."], "qdrant_checked": False}

    collection = _test_collection_name()
    issues: list[str] = []
    created_collection = False
    try:
        from qdrant_client import QdrantClient  # type: ignore
        from qdrant_client.models import Distance, VectorParams  # type: ignore

        client = QdrantClient(
            url=qdrant_url,
            api_key=qdrant_api_key,
            check_compatibility=False,
        )
        client.create_collection(
            collection_name=collection,
            vectors_config=VectorParams(size=DEFAULT_EMBEDDING_DIMENSIONS, distance=Distance.COSINE),
        )
        created_collection = True
        vector_schema, vector_size = _collection_vector_schema(client.get_collection(collection_name=collection))
        if vector_schema != "unnamed":
            issues.append(f"Expected unnamed Qdrant vectors for checker collection, got {vector_schema}.")
        if vector_size != DEFAULT_EMBEDDING_DIMENSIONS:
            issues.append(f"Expected Qdrant vector size {DEFAULT_EMBEDDING_DIMENSIONS}, got {vector_size}.")
        config = RetrievalConfig(
            vector_backend="qdrant",
            graph_backend="local",
            qdrant_url=qdrant_url,
            qdrant_api_key=qdrant_api_key,
            qdrant_collection=collection,
            pgvector_dsn=configured_database_url(),
        )
        adapter = QdrantVectorAdapter(config)
        chunks = _chunks()
        payload_source_kinds = {_qdrant_payload(chunk).get("source_kind") for chunk in chunks}
        indexed = adapter.upsert_chunks(chunks)

        public_hits = adapter.search(
            "administrative record public source",
            {"auth_context": {"tenant_id": TENANT_A, "user_id": "qdrant-check-user"}},
            {"tenant_id": TENANT_A, "jurisdiction": "District of Columbia"},
            10,
        )
        tenant_hits = adapter.search(
            "relocation damages tenant alpha private document",
            {"auth_context": {"tenant_id": TENANT_A, "user_id": "qdrant-check-user"}},
            {"tenant_id": TENANT_A, "matter_id": MATTER_A, "document_id": DOCUMENT_A},
            10,
        )
        wrong_tenant_hits = adapter.search(
            "relocation damages tenant alpha private document",
            {"auth_context": {"tenant_id": TENANT_B, "user_id": "qdrant-check-user"}},
            {"tenant_id": TENANT_B, "matter_id": MATTER_A, "document_id": DOCUMENT_A},
            10,
        )
        mixed_hits = adapter.search(
            "administrative record relocation damages public private",
            {"auth_context": {"tenant_id": TENANT_A, "user_id": "qdrant-check-user"}},
            {"tenant_id": TENANT_A, "jurisdiction": "District of Columbia"},
            10,
        )
        mixed_results = [_result_dict(hit) for hit in mixed_hits]
        source_scope = _result_source_scope(mixed_results)

        if indexed != 3:
            issues.append(f"Expected 3 Qdrant points indexed, got {indexed}.")
        if payload_source_kinds != {"public_dc_source", "tenant_document"}:
            issues.append(f"Unexpected Qdrant source_kind payloads: {sorted(str(item) for item in payload_source_kinds)}.")
        if not any(hit.chunk.chunk_id == PUBLIC_CHUNK_ID for hit in public_hits):
            issues.append("Public D.C. source chunk was not returned by Qdrant.")
        if not any(hit.chunk.chunk_id == DOCUMENT_A_CHUNK_ID for hit in tenant_hits):
            issues.append("Tenant A private document chunk was not returned by Qdrant.")
        if any(hit.chunk.source_type == "tenant_document" for hit in wrong_tenant_hits):
            issues.append("Wrong-tenant Qdrant retrieval returned a private document chunk.")
        if source_scope != "mixed":
            issues.append(f"Expected mixed Qdrant source scope, got {source_scope}.")

        _insert_pgvector_fixtures()
        fallback_adapter = FallbackVectorAdapter(_BrokenQdrant(), PgVectorAdapter(config))
        fallback_hits = fallback_adapter.search(
            "administrative record relocation damages",
            {"auth_context": {"tenant_id": TENANT_A, "user_id": "qdrant-check-user"}},
            {"tenant_id": TENANT_A, "matter_id": MATTER_A, "document_id": DOCUMENT_A, "jurisdiction": "District of Columbia"},
            10,
        )
        fallback_results = [_result_dict(hit) for hit in fallback_hits]
        metadata_persisted, snapshot_linked, raw_query_stored = _persist_metadata_fixture(
            run_id="qdrant-check-run",
            snapshot_id="qdrant-check-snapshot",
            results=mixed_results,
        )
        fallback_metadata_persisted, fallback_snapshot_linked, fallback_raw_query_stored = _persist_metadata_fixture(
            run_id="qdrant-check-fallback-run",
            snapshot_id="qdrant-check-fallback-snapshot",
            results=fallback_results,
        )

        if not fallback_hits:
            issues.append("pgvector fallback returned no hits after Qdrant failure.")
        if fallback_adapter.status().get("last_backend") != "pgvector":
            issues.append("Fallback adapter did not report pgvector as the last backend.")
        if not metadata_persisted or not snapshot_linked:
            issues.append("Qdrant retrieval metadata or reliability snapshot did not persist.")
        if not fallback_metadata_persisted or not fallback_snapshot_linked:
            issues.append("Fallback retrieval metadata or reliability snapshot did not persist.")
        if raw_query_stored or fallback_raw_query_stored:
            issues.append("Raw query text was stored in retrieval metadata.")

        return {
            "ok": not issues,
            "issues": issues,
            "qdrant_checked": True,
            "collection": collection,
            "vector_schema": vector_schema,
            "vector_size": vector_size,
            "indexed": indexed,
            "public_hit_count": len(public_hits),
            "tenant_document_hit_count": len([hit for hit in tenant_hits if hit.chunk.source_type == "tenant_document"]),
            "wrong_tenant_private_hit_count": len([hit for hit in wrong_tenant_hits if hit.chunk.source_type == "tenant_document"]),
            "source_scope": source_scope,
            "fallback_backend": fallback_adapter.status().get("last_backend"),
            "fallback_hit_count": len(fallback_hits),
            "retrieval_metadata_persisted": metadata_persisted,
            "fallback_metadata_persisted": fallback_metadata_persisted,
            "reliability_snapshot_linked": snapshot_linked,
            "fallback_reliability_snapshot_linked": fallback_snapshot_linked,
            "query_text_stored": raw_query_stored or fallback_raw_query_stored,
        }
    except Exception as exc:
        return {
            "ok": False,
            "issues": ["Live Qdrant retrieval verification failed.", _safe_error_summary(exc)],
            "qdrant_checked": True,
            "collection": collection,
        }
    finally:
        _cleanup_pgvector_fixtures()
        if created_collection:
            try:
                from qdrant_client import QdrantClient  # type: ignore

                cleanup_client = QdrantClient(
                    url=qdrant_url,
                    api_key=qdrant_api_key,
                    check_compatibility=False,
                )
                cleanup_client.delete_collection(collection_name=collection)
            except Exception:
                pass


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Live Qdrant primary retrieval and pgvector fallback verification.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    args = parser.parse_args(argv)

    result = qdrant_retrieval_readiness()
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print("PASS Qdrant retrieval" if result["ok"] else "FAIL Qdrant retrieval")
        for issue in result["issues"]:
            print(f"- {issue}")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
