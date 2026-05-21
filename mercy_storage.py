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


    class MicrosoftIdentityMappingRecord(Base):
        __tablename__ = "microsoft_identity_mappings"

        id: Mapped[str] = mapped_column(String(128), primary_key=True)
        microsoft_tenant_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        microsoft_object_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        email: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)
        email_domain: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
        mercy_user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        firm_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
        tenant_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
        effective_scope_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
        effective_scope_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
        roles: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
        status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending", index=True)
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
        updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
        last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


    Index("ix_mercy_dc_chunks_tenant_source", DCRagChunkRecord.tenant_id, DCRagChunkRecord.source_id)
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


    class LangGraphCheckpointRecord:
        pass


    class AuditLogRecord:
        pass

    class MicrosoftIdentityMappingRecord:
        pass


def get_engine() -> Engine:
    global _ENGINE, _SESSION_FACTORY
    if not SQLALCHEMY_AVAILABLE:
        raise RuntimeError("SQLAlchemy is required for persistent Mercy storage.")
    url = configured_database_url()
    if not url:
        raise RuntimeError("POSTGRES_URL or SUPABASE_DB_URL is required for persistent Mercy storage.")
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
    if firm:
        return "firm", firm
    if tenant:
        return "solo", tenant
    raise ValueError("Microsoft identity mapping requires firm_id for firm users or tenant_id for solo users.")


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
                tenant_id=tenant,
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
            record.tenant_id = tenant
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
        record.last_login_at = datetime.now(UTC)
        record.updated_at = record.last_login_at
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
