from __future__ import annotations

import argparse
from datetime import UTC, datetime
import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from mercy_storage import (  # noqa: E402
    DEFAULT_EMBEDDING_DIMENSIONS,
    DocumentChunkRecord,
    DocumentRecord,
    chunk_text_for_storage,
    configured_database_url,
    get_engine,
    validate_configured_database_url,
)


TENANT_A = "vault-check-tenant-a"
TENANT_B = "vault-check-tenant-b"
DOCUMENT_TEXT = "Readable D.C. tenant document text for Vault chunking verification. " * 80


def _safe_error_summary(exc: Exception) -> str:
    message = str(exc).splitlines()[0].strip()
    message = re.sub(r"postgres(?:ql)?(?:\+psycopg)?://\S+", "[redacted-db-url]", message)
    message = re.sub(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", "[redacted-ip]", message)
    message = re.sub(r"([\w.-]+)\.supabase\.com", "[redacted-supabase-host]", message)
    if len(message) > 500:
        message = f"{message[:497]}..."
    return f"{type(exc).__name__}: {message}"


def _embedding(seed: float) -> list[float]:
    vector = [0.0] * DEFAULT_EMBEDDING_DIMENSIONS
    vector[0] = seed
    vector[1] = 1.0 - seed
    return vector


def _add_document(session: Any, *, tenant_id: str, document_id: str, text: str, status: str) -> int:
    now = datetime.now(UTC)
    chunks = chunk_text_for_storage(text)
    lifecycle = status if chunks else "extraction_limited"
    session.add(
        DocumentRecord(
            document_id=document_id,
            tenant_id=tenant_id,
            firm_id=None,
            matter_id="vault-check-matter",
            uploaded_by_user_id="vault-check-user",
            filename=f"{document_id}.pdf",
            mime_type="application/pdf",
            storage_provider="rollback_fixture",
            storage_key=f"rollback://{document_id}",
            sha256="1" * 64,
            size_bytes=128,
            status=lifecycle,
            extraction_status=lifecycle,
            metadata_json={"source": "rollback_vault_check"},
            created_at=now,
            updated_at=now,
        )
    )
    session.flush()
    for index, chunk in enumerate(chunks):
        session.add(
            DocumentChunkRecord(
                chunk_id=f"{document_id}_chunk_{index:04d}",
                tenant_id=tenant_id,
                firm_id=None,
                matter_id="vault-check-matter",
                document_id=document_id,
                chunk_index=index,
                text=chunk,
                summary=chunk[:500],
                token_count=len(chunk.split()),
                embedding_model="mercy-check-embedding-384",
                embedding_vector=_embedding(0.9),
                metadata_json={"source": "rollback_vault_check"},
                created_at=now,
                updated_at=now,
            )
        )
    session.flush()
    return len(chunks)


def vault_document_storage_readiness() -> dict[str, Any]:
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
            "issues": ["PostgreSQL/Supabase Postgres is required for Vault storage verification."],
            "database_checked": True,
        }

    from mercy_storage import sessionmaker  # noqa: PLC0415

    session_factory = sessionmaker(bind=engine, expire_on_commit=False, future=True)
    session = session_factory()
    transaction = session.begin()
    try:
        tenant_a_chunks = _add_document(
            session,
            tenant_id=TENANT_A,
            document_id="vault-check-readable-a",
            text=DOCUMENT_TEXT,
            status="ready",
        )
        tenant_b_chunks = _add_document(
            session,
            tenant_id=TENANT_B,
            document_id="vault-check-readable-b",
            text=DOCUMENT_TEXT,
            status="ready",
        )
        limited_chunks = _add_document(
            session,
            tenant_id=TENANT_A,
            document_id="vault-check-limited",
            text="",
            status="ready",
        )
        readable_vectors = (
            session.query(DocumentChunkRecord)
            .filter(DocumentChunkRecord.tenant_id == TENANT_A)
            .filter(DocumentChunkRecord.document_id == "vault-check-readable-a")
            .filter(DocumentChunkRecord.embedding_vector.is_not(None))
            .count()
        )
        limited_document = session.get(DocumentRecord, "vault-check-limited")
        if tenant_a_chunks <= 0 or readable_vectors <= 0:
            issues.append("Readable document did not create vectorized chunks.")
        if tenant_b_chunks <= 0:
            issues.append("Same readable bytes in another tenant did not stay independently chunked.")
        if limited_chunks != 0 or not limited_document or limited_document.status != "extraction_limited":
            issues.append("Unextractable document did not persist as extraction_limited with zero chunks.")
        return {
            "ok": not issues,
            "issues": issues,
            "database_checked": True,
            "rollback_fixtures": True,
            "readable_chunk_count": tenant_a_chunks,
            "readable_vector_count": readable_vectors,
            "same_bytes_other_tenant_chunk_count": tenant_b_chunks,
            "limited_chunk_count": limited_chunks,
            "limited_status": limited_document.status if limited_document else None,
        }
    except Exception as exc:
        return {
            "ok": False,
            "issues": [
                "Vault document storage verification failed. Check database connectivity, schema, and pgvector permissions.",
                _safe_error_summary(exc),
            ],
            "database_checked": True,
            "rollback_fixtures": True,
        }
    finally:
        transaction.rollback()
        session.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Rollback-only Vault document storage verification.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    args = parser.parse_args(argv)

    result = vault_document_storage_readiness()
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print("PASS Vault document storage" if result["ok"] else "FAIL Vault document storage")
        for issue in result["issues"]:
            print(f"- {issue}")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
