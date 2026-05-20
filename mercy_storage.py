from __future__ import annotations

from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any, Iterator
from uuid import uuid4

from observability import trace_event, trace_span
from mercy_config import get_config

try:
    from sqlalchemy import JSON, Boolean, DateTime, Index, String, Text, create_engine, text
    from sqlalchemy.engine import Engine
    from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

    SQLALCHEMY_AVAILABLE = True
except ModuleNotFoundError:
    JSON = Boolean = DateTime = Index = String = Text = create_engine = text = None  # type: ignore[assignment]
    Engine = Session = Any  # type: ignore[misc,assignment]
    DeclarativeBase = object  # type: ignore[assignment]
    Mapped = Any  # type: ignore[assignment]
    mapped_column = sessionmaker = None  # type: ignore[assignment]
    SQLALCHEMY_AVAILABLE = False


STORAGE_VERSION = "mercy-storage-pgvector-1.0"
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
        "required_env": ["POSTGRES_URL", "MERCY_DATABASE_URL", "SUPABASE_DB_URL"],
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


if SQLALCHEMY_AVAILABLE:

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
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
        updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


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


    Index("ix_mercy_dc_chunks_tenant_source", DCRagChunkRecord.tenant_id, DCRagChunkRecord.source_id)
else:

    class Base:
        metadata: Any = None


    class MatterRecord:
        pass


    class DCRagSourceRecord:
        pass


    class DCRagChunkRecord:
        pass


    class LangGraphCheckpointRecord:
        pass


    class AuditLogRecord:
        pass


def get_engine() -> Engine:
    global _ENGINE, _SESSION_FACTORY
    if not SQLALCHEMY_AVAILABLE:
        raise RuntimeError("SQLAlchemy is required for persistent Mercy storage.")
    url = configured_database_url()
    if not url:
        raise RuntimeError("POSTGRES_URL or SUPABASE_URL is required for persistent Mercy storage.")
    if _ENGINE is None:
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
        raise RuntimeError("Persistent storage is required outside MERCY_ENV=local. Set POSTGRES_URL or SUPABASE_URL.")
    with trace_span("storage_init", "core_storage", "storage", metadata=storage_status()) as span:
        engine = get_engine()
        if engine.dialect.name.startswith("postgres"):
            with engine.begin() as connection:
                connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        Base.metadata.create_all(engine)
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
