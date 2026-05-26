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
    LegalSourceChunkRecord,
    LegalSourceRecord,
    configured_database_url,
    get_engine,
    validate_configured_database_url,
)


SOURCE_ID = "dc-source-check-rollback"
CHUNK_ID = "dc-source-check-rollback-chunk"


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


def dc_source_ingestion_storage_readiness() -> dict[str, Any]:
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
            "issues": ["PostgreSQL/Supabase Postgres is required for D.C. source ingestion verification."],
            "database_checked": True,
        }

    from mercy_storage import sessionmaker  # noqa: PLC0415

    session_factory = sessionmaker(bind=engine, expire_on_commit=False, future=True)
    session = session_factory()
    transaction = session.begin()
    try:
        now = datetime.now(UTC)
        session.add(
            LegalSourceRecord(
                source_id=SOURCE_ID,
                title="Rollback D.C. source ingestion check",
                source_type="statute",
                authority_type="statute",
                jurisdiction="District of Columbia",
                citation_label="Rollback D.C. Source",
                official_locator="Rollback official locator",
                url="https://example.dc.gov/rollback-source",
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
                chunk_id=CHUNK_ID,
                source_id=SOURCE_ID,
                text="Rollback D.C. public source chunk for ingestion verification.",
                summary="Rollback source chunk.",
                source_title="Rollback D.C. source ingestion check",
                citation_label="Rollback D.C. Source",
                source_type="statute",
                authority_type="statute",
                jurisdiction="District of Columbia",
                official_locator="Rollback official locator",
                url="https://example.dc.gov/rollback-source",
                entities=["district_of_columbia"],
                relationships=[{"type": "source_chunk", "from": SOURCE_ID, "to": CHUNK_ID}],
                verification_status="official_metadata_unquoted",
                citation_required=True,
                last_checked="2026-05-26",
                practice_area="civil_procedure",
                source_date="2026-05-26",
                embedding_model="mercy-check-embedding-384",
                embedding_vector=_embedding(0.95),
                created_at=now,
                updated_at=now,
            )
        )
        session.flush()
        source = session.get(LegalSourceRecord, SOURCE_ID)
        chunk = session.get(LegalSourceChunkRecord, CHUNK_ID)
        if not source:
            issues.append("D.C. legal source row was not persisted.")
        if not chunk:
            issues.append("D.C. legal source chunk row was not persisted.")
        if chunk and chunk.embedding_vector is None:
            issues.append("D.C. legal source chunk embedding_vector was not populated.")
        if source and getattr(source, "tenant_id", None):
            issues.append("Public D.C. legal source unexpectedly has tenant_id.")
        return {
            "ok": not issues,
            "issues": issues,
            "database_checked": True,
            "rollback_fixtures": True,
            "source_id": SOURCE_ID,
            "chunk_count": 1 if chunk else 0,
            "vector_present": bool(chunk and chunk.embedding_vector is not None),
            "public_scope": True,
        }
    except Exception as exc:
        return {
            "ok": False,
            "issues": [
                "D.C. source ingestion storage verification failed. Check schema, pgvector, and table permissions.",
                _safe_error_summary(exc),
            ],
            "database_checked": True,
            "rollback_fixtures": True,
        }
    finally:
        transaction.rollback()
        session.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Rollback-only D.C. legal source ingestion storage verification.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    args = parser.parse_args(argv)

    result = dc_source_ingestion_storage_readiness()
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print("PASS D.C. source ingestion storage" if result["ok"] else "FAIL D.C. source ingestion storage")
        for issue in result["issues"]:
            print(f"- {issue}")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
