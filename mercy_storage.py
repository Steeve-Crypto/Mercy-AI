from __future__ import annotations

from contextlib import contextmanager
from datetime import UTC, datetime
import hashlib
import math
import os
import re
from typing import Any, Iterator, TYPE_CHECKING
from uuid import uuid4

from mercy_config import get_config
from observability import trace_event, trace_span

if TYPE_CHECKING:
    from sqlalchemy import JSON, Boolean, CheckConstraint, DateTime, Index, Integer, Numeric, String, Text, Uuid, create_engine, text
    from sqlalchemy.engine import Engine
    from sqlalchemy.engine.url import make_url
    from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
    from pgvector.sqlalchemy import Vector

    SQLALCHEMY_AVAILABLE = True
else:
    try:
        from sqlalchemy import JSON, Boolean, CheckConstraint, DateTime, Index, Integer, Numeric, String, Text, Uuid, create_engine, text
        from sqlalchemy.engine import Engine
        from sqlalchemy.engine.url import make_url
        from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
        from pgvector.sqlalchemy import Vector

        SQLALCHEMY_AVAILABLE = True
    except ModuleNotFoundError:
        JSON = Boolean = CheckConstraint = DateTime = Index = Integer = Numeric = String = Text = Uuid = create_engine = text = None  # type: ignore[assignment]
        Engine = Session = Any  # type: ignore[misc,assignment]
        make_url = Vector = None  # type: ignore[assignment]
        DeclarativeBase = object  # type: ignore[assignment]
        Mapped = Any  # type: ignore[assignment]
        mapped_column = sessionmaker = None  # type: ignore[assignment]
        SQLALCHEMY_AVAILABLE = False


STORAGE_VERSION = "mercy-storage-pgvector-1.0"
DEFAULT_EMBEDDING_DIMENSIONS = 384
TOKEN_PATTERN = re.compile(r"[a-zA-Z][a-zA-Z0-9_.-]{1,}")
_ENGINE: Engine | None = None
_SESSION_FACTORY: sessionmaker[Session] | None = None
_INITIALIZED = False


def configured_database_url() -> str | None:
    raw = get_config().database_url
    if not raw:
        return None
    return _normalize_database_url(raw)


def persistent_storage_configured() -> bool:
    return bool(configured_database_url())


def local_memory_fallback_allowed() -> bool:
    return get_config().mercy_env == "local" and not persistent_storage_configured()


def storage_mode() -> str:
    if persistent_storage_configured():
        return "postgres_pgvector"
    if local_memory_fallback_allowed():
        return "local_in_memory_fallback"
    return "unavailable_requires_postgres"


def storage_status() -> dict[str, Any]:
    url = configured_database_url()
    return {
        "version": STORAGE_VERSION,
        "mode": storage_mode(),
        "persistent": bool(url),
        "sqlalchemy_available": SQLALCHEMY_AVAILABLE,
        "database_configured": bool(url),
        "fallback_allowed": local_memory_fallback_allowed(),
        "required_env": [
            "POSTGRES_URL",
            "DATABASE_URL",
            "MERCY_DATABASE_URL",
            "SUPABASE_DB_URL",
            "MERCY_PGVECTOR_DSN",
        ],
        "optional_backends": ["qdrant", "neo4j"],
        "tenant_isolation": "tenant_id scoped on matters, rag_sources, rag_chunks, and langgraph checkpoints",
    }


def _normalize_database_url(raw: str) -> str:
    value = raw.strip()
    if value.startswith("postgres://"):
        return "postgresql+psycopg://" + value[len("postgres://") :]
    if value.startswith("postgresql://"):
        return "postgresql+psycopg://" + value[len("postgresql://") :]
    return value


def validate_configured_database_url() -> tuple[bool, str | None]:
    url = configured_database_url()
    if not url:
        candidate_names = (
            "POSTGRES_URL",
            "DATABASE_URL",
            "MERCY_POSTGRES_URL",
            "MERCY_DATABASE_URL",
            "SUPABASE_DB_URL",
            "MERCY_SUPABASE_DB_URL",
            "MERCY_PGVECTOR_DSN",
        )
        malformed_candidates = [name for name in candidate_names if str(os.environ.get(name) or "").strip()]
        if malformed_candidates:
            return False, f"Configured database URL is malformed or unsupported in {', '.join(malformed_candidates)}."
        return False, "POSTGRES_URL, DATABASE_URL, MERCY_DATABASE_URL, SUPABASE_DB_URL, or MERCY_PGVECTOR_DSN is required."
    if not SQLALCHEMY_AVAILABLE or make_url is None:
        return False, "SQLAlchemy is required to validate the configured database URL."
    try:
        parsed = make_url(url)
    except Exception:
        return False, "Configured database URL is malformed or uses an unsupported format."
    if parsed.drivername.split("+", 1)[0] not in {"postgresql", "sqlite"}:
        return False, "Configured database URL must use postgresql://, postgres://, or sqlite+pysqlite://."
    return True, None


if TYPE_CHECKING or SQLALCHEMY_AVAILABLE:

    class Base(DeclarativeBase):  # type: ignore[misc]
        pass


    class MatterRecord(Base):
        __tablename__ = "mercy_matters"

        matter_id: Mapped[str] = mapped_column(String(128), primary_key=True)
        tenant_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        created_by_user_id: Mapped[str] = mapped_column(String(128), nullable=False)
        client_id: Mapped[str] = mapped_column(String(128), nullable=False)
        name: Mapped[str] = mapped_column(String(500), nullable=False)
        tier: Mapped[str] = mapped_column(String(64), nullable=False, default="free")
        client_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
        matter_type: Mapped[str | None] = mapped_column(String(200), nullable=True)
        jurisdiction: Mapped[str] = mapped_column(String(200), nullable=False, default="District of Columbia")
        client_role: Mapped[str | None] = mapped_column(String(200), nullable=True)
        requested_relief: Mapped[str | None] = mapped_column(Text, nullable=True)
        opposing_parties: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
        deadlines: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
        key_facts: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
        documents: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
        sensitivity_flags: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
        missing_information: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
        history: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
        facts: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
        drafts: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
        billing_events: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
        route_history: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
        last_updated: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
        deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
        retention_status: Mapped[str] = mapped_column(String(64), nullable=False, default="active", index=True)


    class DCRagSourceRecord(Base):
        __tablename__ = "mercy_dc_sources"

        tenant_id: Mapped[str] = mapped_column(String(128), primary_key=True)
        source_id: Mapped[str] = mapped_column(String(256), primary_key=True)
        title: Mapped[str] = mapped_column(String(1000), nullable=False)
        source_type: Mapped[str] = mapped_column(String(128), nullable=False)
        authority_type: Mapped[str] = mapped_column(String(128), nullable=False)
        jurisdiction: Mapped[str] = mapped_column(String(200), nullable=False)
        citation_label: Mapped[str] = mapped_column(String(500), nullable=False)
        official_locator: Mapped[str] = mapped_column(Text, nullable=False)
        url: Mapped[str | None] = mapped_column(Text, nullable=True)
        file_anchor: Mapped[str | None] = mapped_column(Text, nullable=True)
        last_checked: Mapped[str] = mapped_column(String(32), nullable=False)
        verification_status: Mapped[str] = mapped_column(String(128), nullable=False)
        refresh_cadence: Mapped[str] = mapped_column(String(128), nullable=False)
        local_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
        active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
        updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


    class DCRagChunkRecord(Base):
        __tablename__ = "mercy_dc_chunks"

        tenant_id: Mapped[str] = mapped_column(String(128), primary_key=True)
        chunk_id: Mapped[str] = mapped_column(String(256), primary_key=True)
        source_id: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
        text: Mapped[str] = mapped_column(Text, nullable=False)
        summary: Mapped[str] = mapped_column(Text, nullable=False)
        source_title: Mapped[str] = mapped_column(String(1000), nullable=False)
        citation_label: Mapped[str] = mapped_column(String(500), nullable=False)
        source_type: Mapped[str] = mapped_column(String(128), nullable=False)
        authority_type: Mapped[str] = mapped_column(String(128), nullable=False)
        jurisdiction: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
        official_locator: Mapped[str] = mapped_column(Text, nullable=False)
        url: Mapped[str | None] = mapped_column(Text, nullable=True)
        entities: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
        relationships: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
        verification_status: Mapped[str] = mapped_column(String(128), nullable=False)
        citation_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
        last_checked: Mapped[str] = mapped_column(String(32), nullable=False)
        practice_area: Mapped[str] = mapped_column(String(200), nullable=False)
        source_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
        embedding: Mapped[list[Any] | None] = mapped_column(JSON, nullable=True)
        embedding_vector: Mapped[Any | None] = mapped_column(Vector(DEFAULT_EMBEDDING_DIMENSIONS), nullable=True)
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
        updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


    class LegalSourceRecord(Base):
        __tablename__ = "mercy_legal_sources"

        source_id: Mapped[str] = mapped_column(String(256), primary_key=True)
        title: Mapped[str] = mapped_column(String(1000), nullable=False)
        source_type: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        authority_type: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        jurisdiction: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
        citation_label: Mapped[str] = mapped_column(String(500), nullable=False)
        official_locator: Mapped[str] = mapped_column(Text, nullable=False)
        url: Mapped[str | None] = mapped_column(Text, nullable=True)
        file_anchor: Mapped[str | None] = mapped_column(Text, nullable=True)
        last_checked: Mapped[str] = mapped_column(String(32), nullable=False)
        verification_status: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        refresh_cadence: Mapped[str] = mapped_column(String(128), nullable=False)
        local_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
        active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
        updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


    class LegalSourceChunkRecord(Base):
        __tablename__ = "mercy_legal_source_chunks"

        chunk_id: Mapped[str] = mapped_column(String(256), primary_key=True)
        source_id: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
        text: Mapped[str] = mapped_column(Text, nullable=False)
        summary: Mapped[str] = mapped_column(Text, nullable=False)
        source_title: Mapped[str] = mapped_column(String(1000), nullable=False)
        citation_label: Mapped[str] = mapped_column(String(500), nullable=False)
        source_type: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        authority_type: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        jurisdiction: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
        official_locator: Mapped[str] = mapped_column(Text, nullable=False)
        url: Mapped[str | None] = mapped_column(Text, nullable=True)
        entities: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
        relationships: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
        verification_status: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        citation_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
        last_checked: Mapped[str] = mapped_column(String(32), nullable=False)
        practice_area: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
        source_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
        embedding_model: Mapped[str] = mapped_column(String(200), nullable=False, default="mercy-hash-embedding-384")
        embedding_vector: Mapped[Any | None] = mapped_column(Vector(DEFAULT_EMBEDDING_DIMENSIONS), nullable=True)
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
        updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


    class DocumentRecord(Base):
        __tablename__ = "mercy_documents"

        document_id: Mapped[str] = mapped_column(String(128), primary_key=True)
        tenant_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        firm_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
        matter_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
        uploaded_by_user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        filename: Mapped[str] = mapped_column(String(1000), nullable=False)
        mime_type: Mapped[str] = mapped_column(String(200), nullable=False)
        storage_provider: Mapped[str] = mapped_column(String(64), nullable=False, default="local_upload_dir")
        storage_key: Mapped[str] = mapped_column(Text, nullable=False)
        sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
        size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
        status: Mapped[str] = mapped_column(String(64), nullable=False, default="uploaded", index=True)
        extraction_status: Mapped[str] = mapped_column(String(64), nullable=False, default="uploaded", index=True)
        metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
        updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


    class DocumentChunkRecord(Base):
        __tablename__ = "mercy_document_chunks"

        chunk_id: Mapped[str] = mapped_column(String(256), primary_key=True)
        tenant_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        firm_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
        matter_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
        document_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
        text: Mapped[str] = mapped_column(Text, nullable=False)
        summary: Mapped[str | None] = mapped_column(Text, nullable=True)
        token_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
        embedding_model: Mapped[str] = mapped_column(String(200), nullable=False, default="mercy-hash-embedding-384")
        embedding_vector: Mapped[Any | None] = mapped_column(Vector(DEFAULT_EMBEDDING_DIMENSIONS), nullable=True)
        metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
        updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


    class EmbeddingJobRecord(Base):
        __tablename__ = "mercy_embedding_jobs"

        job_id: Mapped[str] = mapped_column(String(128), primary_key=True)
        tenant_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
        firm_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
        target_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
        target_id: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
        status: Mapped[str] = mapped_column(String(64), nullable=False, default="queued", index=True)
        embedding_model: Mapped[str] = mapped_column(String(200), nullable=False, default="mercy-hash-embedding-384")
        dimensions: Mapped[int] = mapped_column(Integer, nullable=False, default=DEFAULT_EMBEDDING_DIMENSIONS)
        error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
        updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


    class RetrievalRunRecord(Base):
        __tablename__ = "mercy_retrieval_runs"

        retrieval_run_id: Mapped[str] = mapped_column(String(128), primary_key=True)
        tenant_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        firm_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
        user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        matter_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
        document_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
        query_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
        source_scope: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
        filters_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
        result_refs_json: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


    class ReliabilitySnapshotRecord(Base):
        __tablename__ = "mercy_reliability_snapshots"

        snapshot_id: Mapped[str] = mapped_column(String(128), primary_key=True)
        tenant_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        firm_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
        user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        matter_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
        document_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
        retrieval_run_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
        work_history_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), nullable=True, index=True)
        confidence_score: Mapped[float | None] = mapped_column(Numeric, nullable=True)
        guardrail_status: Mapped[str] = mapped_column(String(64), nullable=False, default="warn", index=True)
        attorney_review_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
        citations_json: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
        reliability_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


    class LangGraphCheckpointRecord(Base):
        __tablename__ = "mercy_langgraph_checkpoints"

        checkpoint_id: Mapped[str] = mapped_column(String(256), primary_key=True)
        tenant_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        matter_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
        thread_id: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
        state: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
        updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


    class AuditLogRecord(Base):
        __tablename__ = "mercy_audit_logs"

        audit_id: Mapped[str] = mapped_column(String(128), primary_key=True)
        tenant_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
        user_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
        action: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
        category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
        matter_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
        metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


    class MicrosoftIdentityMappingRecord(Base):
        __tablename__ = "microsoft_identity_mappings"
        __table_args__ = (
            CheckConstraint("status IN ('active', 'disabled', 'pending')", name="ck_microsoft_identity_status"),
            CheckConstraint("account_type IN ('firm', 'solo')", name="ck_microsoft_identity_account_type"),
            CheckConstraint("tenant_id IS NOT NULL AND length(tenant_id) > 0", name="ck_microsoft_identity_tenant_required"),
            CheckConstraint(
                "(account_type = 'solo' AND firm_id IS NULL) OR (account_type = 'firm' AND firm_id IS NOT NULL AND length(firm_id) > 0)",
                name="ck_microsoft_identity_firm_scope",
            ),
            CheckConstraint(
                "(account_type = 'solo' AND attorney_seat_limit >= 1) OR (account_type = 'firm' AND attorney_seat_limit >= 2)",
                name="ck_microsoft_identity_seat_limit",
            ),
        )

        id: Mapped[str] = mapped_column(String(128), primary_key=True)
        microsoft_tenant_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        microsoft_object_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        email: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)
        email_domain: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
        mercy_user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        firm_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
        tenant_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        account_type: Mapped[str] = mapped_column(String(32), nullable=False, default="solo", index=True)
        attorney_seat_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
        effective_scope_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
        effective_scope_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        roles: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
        status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending", index=True)
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
        updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
        last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


    Index("ix_mercy_dc_chunks_tenant_source", DCRagChunkRecord.tenant_id, DCRagChunkRecord.source_id)
    Index("ix_mercy_legal_source_chunks_source", LegalSourceChunkRecord.source_id)
    Index("ix_mercy_legal_source_chunks_filter", LegalSourceChunkRecord.jurisdiction, LegalSourceChunkRecord.practice_area, LegalSourceChunkRecord.authority_type)
    Index("ix_mercy_documents_tenant_matter", DocumentRecord.tenant_id, DocumentRecord.matter_id)
    Index("ix_mercy_document_chunks_tenant_document", DocumentChunkRecord.tenant_id, DocumentChunkRecord.document_id)
    Index("ix_mercy_document_chunks_tenant_matter", DocumentChunkRecord.tenant_id, DocumentChunkRecord.matter_id)
    Index("ix_mercy_retrieval_runs_tenant_created", RetrievalRunRecord.tenant_id, RetrievalRunRecord.created_at)
    Index("ix_mercy_reliability_snapshots_tenant_created", ReliabilitySnapshotRecord.tenant_id, ReliabilitySnapshotRecord.created_at)
    Index(
        "ix_microsoft_identity_mappings_tid_oid",
        MicrosoftIdentityMappingRecord.microsoft_tenant_id,
        MicrosoftIdentityMappingRecord.microsoft_object_id,
        unique=True,
    )
else:

    class Base:
        metadata: Any = None


    class MatterRecord:
        pass


    class DCRagSourceRecord:
        pass


    class DCRagChunkRecord:
        pass

    class LegalSourceRecord:
        pass

    class LegalSourceChunkRecord:
        pass


    class LangGraphCheckpointRecord:
        pass


    class AuditLogRecord:
        pass

    class DocumentRecord:
        pass

    class DocumentChunkRecord:
        pass

    class EmbeddingJobRecord:
        pass

    class RetrievalRunRecord:
        pass

    class ReliabilitySnapshotRecord:
        pass

    class MicrosoftIdentityMappingRecord:
        pass


def get_engine() -> Engine:
    global _ENGINE, _SESSION_FACTORY
    if not SQLALCHEMY_AVAILABLE:
        raise RuntimeError("SQLAlchemy is required for persistent Mercy storage.")
    url = configured_database_url()
    if not url:
        raise RuntimeError(
            "POSTGRES_URL, DATABASE_URL, MERCY_DATABASE_URL, SUPABASE_DB_URL, or MERCY_PGVECTOR_DSN "
            "is required for persistent Mercy storage."
        )
    if _ENGINE is None:
        ok, issue = validate_configured_database_url()
        if not ok:
            raise RuntimeError(issue or "Configured database URL is invalid.")
        _ENGINE = create_engine(url, pool_pre_ping=True, future=True)
        _SESSION_FACTORY = sessionmaker(bind=_ENGINE, expire_on_commit=False, future=True)
    return _ENGINE


def init_storage() -> dict[str, Any]:
    global _INITIALIZED
    if _INITIALIZED:
        return storage_status()
    if not persistent_storage_configured():
        if local_memory_fallback_allowed():
            trace_storage_event("storage_local_memory_fallback", "init", metadata=storage_status())
            _INITIALIZED = True
            return storage_status()
        raise RuntimeError(
            "Persistent storage is required outside MERCY_ENV=local. Set POSTGRES_URL, DATABASE_URL, "
            "MERCY_DATABASE_URL, SUPABASE_DB_URL, or MERCY_PGVECTOR_DSN."
        )
    with trace_span("storage_init", "core_storage", "storage", metadata=storage_status()) as span:
        engine = get_engine()
        if engine.dialect.name.startswith("postgres"):
            with engine.begin() as connection:
                connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        if get_config().is_local or engine.dialect.name == "sqlite" or get_config().auto_init_storage_schema:
            Base.metadata.create_all(engine)
        else:
            raise RuntimeError(
                "Persistent storage schema is not auto-created in production. "
                "Run: py -3 scripts\\microsoft_identity_db.py apply"
            )
        _INITIALIZED = True
        span["metadata"] = {**storage_status(), "initialized": True}
    return storage_status()


@contextmanager
def session_scope() -> Iterator[Session]:
    init_storage()
    if _SESSION_FACTORY is None:
        raise RuntimeError("Persistent storage session factory is unavailable.")
    session = _SESSION_FACTORY()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def trace_storage_event(
    name: str,
    operation: str,
    tenant_id: str | None = None,
    matter_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    trace_event(
        name=name,
        surface_context="core_storage",
        category="storage",
        matter_reference=matter_id,
        metadata={
            "operation": operation,
            "tenant_id": tenant_id,
            "storage_mode": storage_mode(),
            **(metadata or {}),
        },
    )


def _tokens(text_value: str) -> list[str]:
    return [
        token.lower().strip(".,;:()[]{}")
        for token in TOKEN_PATTERN.findall(text_value)
        if len(token) > 2
    ]


def _stable_text_embedding(text_value: str, dimensions: int = DEFAULT_EMBEDDING_DIMENSIONS) -> list[float]:
    vector = [0.0] * dimensions
    for token in _tokens(text_value):
        index = int(hashlib.sha256(token.encode("utf-8")).hexdigest()[:8], 16) % dimensions
        vector[index] += 1.0
    length = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / length for value in vector]


def chunk_text_for_storage(text_value: str, *, max_chars: int = 1800, overlap_chars: int = 200) -> list[str]:
    cleaned = re.sub(r"\s+", " ", text_value).strip()
    if not cleaned:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(cleaned):
        end = min(len(cleaned), start + max_chars)
        chunks.append(cleaned[start:end].strip())
        if end >= len(cleaned):
            break
        start = max(0, end - overlap_chars)
    return [chunk for chunk in chunks if chunk]


def _storage_status_value(value: Any, fallback: str) -> str:
    status = str(value or fallback).strip().lower().replace(" ", "_")
    return status or fallback


def _document_lifecycle_status(document: dict[str, Any], chunk_count: int) -> tuple[str, str]:
    status = _storage_status_value(document.get("status"), "uploaded")
    extraction_status = _storage_status_value(document.get("extraction_status") or document.get("status"), status)
    if status == "ready" and chunk_count == 0:
        status = "extraction_limited"
    if extraction_status == "ready" and chunk_count == 0:
        extraction_status = "extraction_limited"
    return status, extraction_status


def record_vault_document(
    document: dict[str, Any],
    *,
    tenant_context: dict[str, Any],
    document_text: str | None = None,
) -> dict[str, Any]:
    if not persistent_storage_configured():
        return {"persisted": False, "chunk_count": 0, "storage_mode": storage_mode()}
    tenant_id = str(tenant_context.get("tenant_id") or "").strip()
    user_id = str(tenant_context.get("user_id") or "").strip()
    if not tenant_id or not user_id:
        raise RuntimeError("tenant_id and user_id are required to persist Vault document metadata.")
    document_id = str(document.get("document_id") or "").strip()
    if not document_id:
        raise RuntimeError("document_id is required to persist Vault document metadata.")
    now = datetime.now(UTC)
    chunks = chunk_text_for_storage(document_text or "")
    status, extraction_status = _document_lifecycle_status(document, len(chunks))
    with session_scope() as session:
        record = session.get(DocumentRecord, document_id)
        if record is not None and record.tenant_id != tenant_id:
            raise RuntimeError("document_id already exists for a different tenant.")
        if record is None:
            record = DocumentRecord(
                document_id=document_id,
                tenant_id=tenant_id,
                firm_id=tenant_context.get("firm_id"),
                matter_id=document.get("matter_id"),
                uploaded_by_user_id=user_id,
                filename=str(document.get("filename") or document_id),
                mime_type=str(document.get("mime_type") or "application/octet-stream"),
                storage_provider=str(document.get("storage_provider") or "local_upload_dir"),
                storage_key=str(document.get("storage_path") or document.get("storage_key") or ""),
                sha256=str(document.get("sha256") or ""),
                size_bytes=int(document.get("size") or document.get("size_bytes") or 0),
                status=status,
                extraction_status=extraction_status,
                metadata_json=document,
                created_at=now,
                updated_at=now,
            )
            session.add(record)
        else:
            record.tenant_id = tenant_id
            record.firm_id = tenant_context.get("firm_id")
            record.matter_id = document.get("matter_id")
            record.uploaded_by_user_id = user_id
            record.filename = str(document.get("filename") or record.filename)
            record.mime_type = str(document.get("mime_type") or record.mime_type)
            record.storage_provider = str(document.get("storage_provider") or record.storage_provider)
            record.storage_key = str(document.get("storage_path") or document.get("storage_key") or record.storage_key)
            record.sha256 = str(document.get("sha256") or record.sha256)
            record.size_bytes = int(document.get("size") or document.get("size_bytes") or record.size_bytes)
            record.status = status
            record.extraction_status = extraction_status
            record.metadata_json = document
            record.updated_at = now
        session.query(DocumentChunkRecord).filter(DocumentChunkRecord.document_id == document_id, DocumentChunkRecord.tenant_id == tenant_id).delete(synchronize_session=False)
        for index, chunk in enumerate(chunks):
            session.add(
                DocumentChunkRecord(
                    chunk_id=f"{document_id}_chunk_{index:04d}",
                    tenant_id=tenant_id,
                    firm_id=tenant_context.get("firm_id"),
                    matter_id=document.get("matter_id"),
                    document_id=document_id,
                    chunk_index=index,
                    text=chunk,
                    summary=chunk[:500],
                    token_count=len(_tokens(chunk)),
                    embedding_model="mercy-hash-embedding-384",
                    embedding_vector=_stable_text_embedding(chunk),
                    metadata_json={"source": "workspace_discovery_upload"},
                    created_at=now,
                    updated_at=now,
                )
            )
        session.add(
            EmbeddingJobRecord(
                job_id=f"embed_{document_id}_{hashlib.sha256(str(now.timestamp()).encode()).hexdigest()[:12]}",
                tenant_id=tenant_id,
                firm_id=tenant_context.get("firm_id"),
                target_type="document",
                target_id=document_id,
                status="completed" if chunks else "skipped",
                embedding_model="mercy-hash-embedding-384",
                dimensions=DEFAULT_EMBEDDING_DIMENSIONS,
                error_message=None if chunks else "No extracted text was available for chunk embedding.",
                created_at=now,
                updated_at=now,
            )
        )
    trace_storage_event(
        "vault_document_persisted",
        "document_ingest",
        tenant_id=tenant_id,
        matter_id=str(document.get("matter_id") or "") or None,
        metadata={"document_id": document_id, "chunk_count": len(chunks), "storage_provider": document.get("storage_provider") or "local_upload_dir"},
    )
    return {
        "persisted": True,
        "chunk_count": len(chunks),
        "storage_mode": storage_mode(),
        "document_status": status,
        "extraction_status": extraction_status,
    }


def record_retrieval_run(
    *,
    tenant_context: dict[str, Any],
    query: str,
    source_scope: str,
    filters: dict[str, Any],
    results: list[dict[str, Any]],
    matter_id: str | None = None,
    document_id: str | None = None,
) -> str | None:
    if not persistent_storage_configured():
        return None
    tenant_id = str(tenant_context.get("tenant_id") or "").strip()
    user_id = str(tenant_context.get("user_id") or "").strip()
    if not tenant_id or not user_id:
        return None
    now = datetime.now(UTC)
    retrieval_run_id = f"retr_{hashlib.sha256(f'{tenant_id}:{user_id}:{now.timestamp()}'.encode()).hexdigest()[:24]}"
    result_refs = [
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
            "verification_status": item.get("verification_status"),
        }
        for item in results[:20]
    ]
    with session_scope() as session:
        session.add(
            RetrievalRunRecord(
                retrieval_run_id=retrieval_run_id,
                tenant_id=tenant_id,
                firm_id=tenant_context.get("firm_id"),
                user_id=user_id,
                matter_id=matter_id,
                document_id=document_id,
                query_hash=hashlib.sha256(query.encode("utf-8")).hexdigest(),
                source_scope=source_scope,
                filters_json=filters,
                result_refs_json=result_refs,
                created_at=now,
            )
        )
    trace_storage_event(
        "retrieval_run_persisted",
        "retrieval",
        tenant_id=tenant_id,
        matter_id=matter_id,
        metadata={"retrieval_run_id": retrieval_run_id, "source_scope": source_scope, "result_count": len(result_refs)},
    )
    return retrieval_run_id


def record_reliability_snapshot(
    *,
    tenant_context: dict[str, Any],
    reliability: dict[str, Any],
    citations: list[Any],
    matter_id: str | None = None,
    document_id: str | None = None,
    retrieval_run_id: str | None = None,
    work_history_id: str | None = None,
) -> str | None:
    if not persistent_storage_configured():
        return None
    tenant_id = str(tenant_context.get("tenant_id") or "").strip()
    user_id = str(tenant_context.get("user_id") or "").strip()
    if not tenant_id or not user_id:
        return None
    now = datetime.now(UTC)
    snapshot_id = f"rel_{hashlib.sha256(f'{tenant_id}:{user_id}:{now.timestamp()}'.encode()).hexdigest()[:24]}"
    confidence = reliability.get("confidence_score") or reliability.get("confidence")
    try:
        confidence_score = float(confidence) if confidence is not None else None
    except (TypeError, ValueError):
        confidence_score = None
    with session_scope() as session:
        session.add(
            ReliabilitySnapshotRecord(
                snapshot_id=snapshot_id,
                tenant_id=tenant_id,
                firm_id=tenant_context.get("firm_id"),
                user_id=user_id,
                matter_id=matter_id,
                document_id=document_id,
                retrieval_run_id=retrieval_run_id,
                work_history_id=work_history_id,
                confidence_score=confidence_score,
                guardrail_status=str(reliability.get("guardrail_status") or reliability.get("status") or "warn"),
                attorney_review_required=bool(reliability.get("human_review_required", True)),
                citations_json=citations,
                reliability_json=reliability,
                created_at=now,
            )
        )
    trace_storage_event(
        "reliability_snapshot_persisted",
        "reliability_snapshot",
        tenant_id=tenant_id,
        matter_id=matter_id,
        metadata={"snapshot_id": snapshot_id, "retrieval_run_id": retrieval_run_id, "citation_count": len(citations)},
    )
    return snapshot_id


def record_langgraph_checkpoint(
    checkpoint_id: str,
    tenant_id: str,
    thread_id: str,
    state: dict[str, Any],
    matter_id: str | None = None,
) -> None:
    if not persistent_storage_configured():
        return
    now = datetime.now(UTC)
    with session_scope() as session:
        record = session.get(LangGraphCheckpointRecord, checkpoint_id)
        if record is None:
            record = LangGraphCheckpointRecord(
                checkpoint_id=checkpoint_id,
                tenant_id=tenant_id,
                matter_id=matter_id,
                thread_id=thread_id,
                state=state,
                created_at=now,
                updated_at=now,
            )
            session.add(record)
        else:
            if record.tenant_id != tenant_id:
                raise PermissionError("LangGraph checkpoint belongs to a different tenant.")
            record.matter_id = matter_id
            record.thread_id = thread_id
            record.state = state
            record.updated_at = now
    trace_storage_event("langgraph_checkpoint_persisted", "checkpoint_upsert", tenant_id=tenant_id, matter_id=matter_id)


def record_audit_log(
    *,
    audit_id: str | None = None,
    tenant_id: str | None = None,
    user_id: str | None = None,
    action: str,
    category: str,
    matter_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    created_at: str | datetime | None = None,
) -> None:
    if not persistent_storage_configured():
        return
    timestamp = created_at if isinstance(created_at, datetime) else None
    if timestamp is None and created_at:
        try:
            timestamp = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
        except ValueError:
            timestamp = None
    with session_scope() as session:
        session.add(
            AuditLogRecord(
                audit_id=audit_id or str(uuid4()),
                tenant_id=tenant_id,
                user_id=user_id,
                action=action,
                category=category,
                matter_id=matter_id,
                metadata_json=metadata or {},
                created_at=timestamp or datetime.now(UTC),
            )
        )


def _normalized_email(value: str | None) -> str | None:
    email = (value or "").strip().lower()
    return email or None


def _email_domain(email: str | None) -> str | None:
    if email and "@" in email:
        return email.rsplit("@", 1)[1].strip().lower() or None
    return None


def _normalized_roles(value: list[str] | tuple[str, ...] | str | None) -> list[str]:
    if isinstance(value, str):
        roles = [role.strip() for role in value.split(",") if role.strip()]
    elif value:
        roles = [str(role).strip() for role in value if str(role).strip()]
    else:
        roles = []
    return list(dict.fromkeys(roles or ["attorney"]))


def derive_microsoft_identity_scope(*, firm_id: str | None, tenant_id: str | None) -> tuple[str, str]:
    firm = (firm_id or "").strip()
    tenant = (tenant_id or "").strip()
    if not tenant:
        raise ValueError("Microsoft identity mapping requires tenant_id for all accounts.")
    if firm:
        return "firm", firm
    return "solo", tenant


def validate_microsoft_identity_mapping_scope(
    *,
    firm_id: str | None,
    tenant_id: str | None,
    effective_scope_type: str | None = None,
    effective_scope_id: str | None = None,
) -> tuple[str, str]:
    scope_type, scope_id = derive_microsoft_identity_scope(firm_id=firm_id, tenant_id=tenant_id)
    if effective_scope_type and effective_scope_type != scope_type:
        raise ValueError("effective_scope_type conflicts with server-derived Microsoft identity scope.")
    if effective_scope_id and effective_scope_id != scope_id:
        raise ValueError("effective_scope_id conflicts with server-derived Microsoft identity scope.")
    return scope_type, scope_id


def validate_attorney_seat_limit(*, firm_id: str | None, attorney_seat_limit: int | None) -> tuple[str, int]:
    account_type = "firm" if (firm_id or "").strip() else "solo"
    seats = attorney_seat_limit if attorney_seat_limit is not None else (2 if account_type == "firm" else 1)
    try:
        normalized = int(seats)
    except (TypeError, ValueError) as exc:
        raise ValueError("attorney_seat_limit must be an integer.") from exc
    if account_type == "firm" and normalized < 2:
        raise ValueError("Firm account mappings require an attorney seat limit of at least 2.")
    if account_type == "solo" and normalized < 1:
        raise ValueError("Solo account mappings require an attorney seat limit of at least 1.")
    return account_type, normalized


def upsert_microsoft_identity_mapping(
    *,
    microsoft_tenant_id: str,
    microsoft_object_id: str,
    mercy_user_id: str,
    email: str | None = None,
    firm_id: str | None = None,
    tenant_id: str | None = None,
    roles: list[str] | tuple[str, ...] | str | None = None,
    status: str = "pending",
    attorney_seat_limit: int | None = None,
) -> dict[str, Any]:
    if not persistent_storage_configured():
        raise RuntimeError("PostgreSQL/Supabase Postgres is required for Microsoft identity provisioning.")
    tid = microsoft_tenant_id.strip()
    oid = microsoft_object_id.strip()
    user_id = mercy_user_id.strip()
    normalized_status = status.strip().lower()
    if normalized_status not in {"active", "disabled", "pending"}:
        raise ValueError("status must be active, disabled, or pending.")
    if not tid or not oid or not user_id:
        raise ValueError("microsoft_tenant_id, microsoft_object_id, and mercy_user_id are required.")
    firm = (firm_id or "").strip() or None
    tenant = (tenant_id or "").strip() or None
    scope_type, scope_id = validate_microsoft_identity_mapping_scope(firm_id=firm, tenant_id=tenant)
    account_type, seats = validate_attorney_seat_limit(firm_id=firm, attorney_seat_limit=attorney_seat_limit)
    normalized_email = _normalized_email(email)
    now = datetime.now(UTC)
    with session_scope() as session:
        record = (
            session.query(MicrosoftIdentityMappingRecord)
            .filter(
                MicrosoftIdentityMappingRecord.microsoft_tenant_id == tid,
                MicrosoftIdentityMappingRecord.microsoft_object_id == oid,
            )
            .one_or_none()
        )
        if record is None:
            record = MicrosoftIdentityMappingRecord(
                id=str(uuid4()),
                microsoft_tenant_id=tid,
                microsoft_object_id=oid,
                email=normalized_email,
                email_domain=_email_domain(normalized_email),
                mercy_user_id=user_id,
                firm_id=firm,
                tenant_id=tenant or "",
                account_type=account_type,
                attorney_seat_limit=seats,
                effective_scope_type=scope_type,
                effective_scope_id=scope_id,
                roles=_normalized_roles(roles),
                status=normalized_status,
                created_at=now,
                updated_at=now,
                last_login_at=None,
            )
            session.add(record)
        else:
            record.email = normalized_email
            record.email_domain = _email_domain(normalized_email)
            record.mercy_user_id = user_id
            record.firm_id = firm
            record.tenant_id = tenant or ""
            record.account_type = account_type
            record.attorney_seat_limit = seats
            record.effective_scope_type = scope_type
            record.effective_scope_id = scope_id
            record.roles = _normalized_roles(roles)
            record.status = normalized_status
            record.updated_at = now
        result = microsoft_identity_mapping_to_dict(record)
    trace_storage_event("microsoft_identity_mapping_upserted", "identity_mapping_upsert", tenant_id=result["effective_scope_id"], metadata={"status": normalized_status, "scope_type": scope_type})
    return result


def microsoft_identity_mapping_to_dict(record: MicrosoftIdentityMappingRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "microsoft_tenant_id": record.microsoft_tenant_id,
        "microsoft_object_id": record.microsoft_object_id,
        "email": record.email,
        "email_domain": record.email_domain,
        "mercy_user_id": record.mercy_user_id,
        "firm_id": record.firm_id,
        "tenant_id": record.tenant_id,
        "account_type": record.account_type,
        "attorney_seat_limit": record.attorney_seat_limit,
        "effective_scope_type": record.effective_scope_type,
        "effective_scope_id": record.effective_scope_id,
        "roles": list(record.roles or []),
        "status": record.status,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "updated_at": record.updated_at.isoformat() if record.updated_at else None,
        "last_login_at": record.last_login_at.isoformat() if record.last_login_at else None,
    }


def get_microsoft_identity_mapping(microsoft_tenant_id: str, microsoft_object_id: str) -> dict[str, Any] | None:
    if not persistent_storage_configured():
        return None
    with session_scope() as session:
        record = (
            session.query(MicrosoftIdentityMappingRecord)
            .filter(
                MicrosoftIdentityMappingRecord.microsoft_tenant_id == microsoft_tenant_id.strip(),
                MicrosoftIdentityMappingRecord.microsoft_object_id == microsoft_object_id.strip(),
            )
            .one_or_none()
        )
        return microsoft_identity_mapping_to_dict(record) if record else None


def list_microsoft_identity_mappings() -> list[dict[str, Any]]:
    if not persistent_storage_configured():
        raise RuntimeError("PostgreSQL/Supabase Postgres is required for Microsoft identity provisioning.")
    with session_scope() as session:
        records = (
            session.query(MicrosoftIdentityMappingRecord)
            .order_by(MicrosoftIdentityMappingRecord.created_at.desc())
            .all()
        )
        return [microsoft_identity_mapping_to_dict(record) for record in records]


def set_microsoft_identity_mapping_status(microsoft_tenant_id: str, microsoft_object_id: str, status: str) -> dict[str, Any]:
    normalized_status = status.strip().lower()
    if normalized_status not in {"active", "disabled", "pending"}:
        raise ValueError("status must be active, disabled, or pending.")
    with session_scope() as session:
        record = (
            session.query(MicrosoftIdentityMappingRecord)
            .filter(
                MicrosoftIdentityMappingRecord.microsoft_tenant_id == microsoft_tenant_id.strip(),
                MicrosoftIdentityMappingRecord.microsoft_object_id == microsoft_object_id.strip(),
            )
            .one_or_none()
        )
        if record is None:
            raise KeyError("Microsoft identity mapping was not found.")
        record.status = normalized_status
        record.updated_at = datetime.now(UTC)
        result = microsoft_identity_mapping_to_dict(record)
    trace_storage_event("microsoft_identity_mapping_status_changed", "identity_mapping_status", tenant_id=result["effective_scope_id"], metadata={"status": normalized_status})
    return result


def mark_microsoft_identity_login(microsoft_tenant_id: str, microsoft_object_id: str) -> dict[str, Any]:
    with session_scope() as session:
        record = (
            session.query(MicrosoftIdentityMappingRecord)
            .filter(
                MicrosoftIdentityMappingRecord.microsoft_tenant_id == microsoft_tenant_id.strip(),
                MicrosoftIdentityMappingRecord.microsoft_object_id == microsoft_object_id.strip(),
            )
            .one_or_none()
        )
        if record is None:
            raise KeyError("Microsoft identity mapping was not found.")
        now = datetime.now(UTC)
        record.last_login_at = now
        record.updated_at = now
        result = microsoft_identity_mapping_to_dict(record)
    return result


def soft_delete_tenant_records(tenant_id: str, *, user_id: str | None = None) -> dict[str, Any]:
    if not persistent_storage_configured():
        return {
            "storage_mode": storage_mode(),
            "matters_soft_deleted": 0,
            "tenant_rag_chunks_deleted": 0,
            "tenant_rag_sources_deactivated": 0,
            "checkpoints_deleted": 0,
        }
    now = datetime.now(UTC)
    with session_scope() as session:
        matters = (
            session.query(MatterRecord)
            .filter(MatterRecord.tenant_id == tenant_id, MatterRecord.retention_status != "deleted")
            .all()
        )
        for record in matters:
            record.retention_status = "deleted"
            record.deleted_at = now
            record.last_updated = now
            record.history = [
                *list(record.history or []),
                {
                    "event": "tenant_data_soft_deleted",
                    "timestamp": now.isoformat(),
                    "source": "privacy_request",
                    "requested_by_user_id": user_id,
                    "retention_policy": "soft delete; retained only for legal/security retention review before purge",
                },
            ]
        sources = session.query(DCRagSourceRecord).filter(DCRagSourceRecord.tenant_id == tenant_id).all()
        for source in sources:
            source.active = False
            source.updated_at = now
        chunks_deleted = session.query(DCRagChunkRecord).filter(DCRagChunkRecord.tenant_id == tenant_id).delete(synchronize_session=False)
        checkpoints_deleted = (
            session.query(LangGraphCheckpointRecord)
            .filter(LangGraphCheckpointRecord.tenant_id == tenant_id)
            .delete(synchronize_session=False)
        )
        result = {
            "storage_mode": storage_mode(),
            "matters_soft_deleted": len(matters),
            "tenant_rag_chunks_deleted": chunks_deleted,
            "tenant_rag_sources_deactivated": len(sources),
            "checkpoints_deleted": checkpoints_deleted,
        }
    trace_storage_event("tenant_data_soft_deleted", "privacy_delete", tenant_id=tenant_id, metadata=result)
    return result


def reset_storage_for_tests() -> None:
    global _ENGINE, _SESSION_FACTORY, _INITIALIZED
    if _ENGINE is not None:
        _ENGINE.dispose()
    _ENGINE = None
    _SESSION_FACTORY = None
    _INITIALIZED = False
    get_config.cache_clear()
