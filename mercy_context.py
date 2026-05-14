from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any, NoReturn
from uuid import uuid4

from observability import trace_event
from llm_providers import llm_provider_status
from mercy_storage import (
    MatterRecord,
    init_storage,
    local_memory_fallback_allowed,
    persistent_storage_configured,
    session_scope,
    storage_status,
    trace_storage_event,
)


PRODUCT_NAME = "Mercy"
CORE_NAME = "Mercy Shared Intelligence Core"
DEFAULT_TIER = "free"
_LANGGRAPH_RUNTIME: dict[str, Any] = {
    "available": False,
    "runtime": "not_initialized",
    "version": None,
    "fallback_allowed": False,
}


@dataclass
class MatterContext:
    matter_id: str
    name: str
    client_id: str
    tenant_id: str
    created_by_user_id: str
    tier: str = DEFAULT_TIER
    client_name: str | None = None
    matter_type: str | None = None
    jurisdiction: str = "District of Columbia"
    client_role: str | None = None
    opposing_parties: list[str] = field(default_factory=list)
    deadlines: list[dict[str, Any]] = field(default_factory=list)
    requested_relief: str | None = None
    key_facts: dict[str, Any] = field(default_factory=dict)
    documents: list[dict[str, Any]] = field(default_factory=list)
    sensitivity_flags: list[str] = field(default_factory=list)
    missing_information: list[str] = field(default_factory=list)
    history: list[dict[str, Any]] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    last_updated: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    facts: dict[str, Any] = field(default_factory=dict)
    drafts: list[dict[str, Any]] = field(default_factory=list)
    billing_events: list[dict[str, Any]] = field(default_factory=list)
    route_history: list[dict[str, Any]] = field(default_factory=list)


class MatterTenantAccessError(PermissionError):
    def __init__(self, matter_id: str, tenant_id: str | None, owner_tenant_id: str | None) -> None:
        super().__init__("Matter belongs to a different tenant.")
        self.matter_id = matter_id
        self.tenant_id = tenant_id
        self.owner_tenant_id = owner_tenant_id


def _tenant_id(tenant_context: dict[str, Any] | None) -> str | None:
    return str(tenant_context.get("tenant_id")) if isinstance(tenant_context, dict) and tenant_context.get("tenant_id") else None


def _user_id(tenant_context: dict[str, Any] | None) -> str | None:
    return str(tenant_context.get("user_id")) if isinstance(tenant_context, dict) and tenant_context.get("user_id") else None


def _require_tenant_context(tenant_context: dict[str, Any] | None) -> dict[str, Any]:
    tenant = _tenant_id(tenant_context)
    user = _user_id(tenant_context)
    if not tenant or not user:
        raise MatterTenantAccessError("unknown", tenant, None)
    return {"tenant_id": tenant, "user_id": user, "auth_mode": str((tenant_context or {}).get("auth_mode") or "unknown")}


def tenant_context_payload(tenant_context: dict[str, Any] | None) -> dict[str, Any]:
    auth = _require_tenant_context(tenant_context)
    return {
        "auth_context": auth,
        "tenant_id": auth["tenant_id"],
        "user_id": auth["user_id"],
    }


def set_langgraph_runtime(runtime: dict[str, Any]) -> None:
    _LANGGRAPH_RUNTIME.clear()
    _LANGGRAPH_RUNTIME.update(dict(runtime))


def get_langgraph_runtime() -> dict[str, Any]:
    return dict(_LANGGRAPH_RUNTIME)


def _audit_access_denied(matter_id: str, tenant_context: dict[str, Any] | None, owner_tenant_id: str | None) -> None:
    trace_event(
        name="tenant_access_denied",
        surface_context="core_auth",
        category="auth",
        guardrail_status="block",
        matter_reference=matter_id,
        metadata={
            "matter_id": matter_id,
            "tenant_id": _tenant_id(tenant_context),
            "user_id": _user_id(tenant_context),
            "owner_tenant_id": owner_tenant_id,
            "reason": "cross_tenant_matter_access",
        },
    )


class InMemoryMatterStore:
    """Stateless-by-default case context for local development.

    This keeps product workflow state available to the dashboard and Word add-in
    without creating a persistent client-data vault.
    """

    def __init__(self) -> None:
        self._matters: dict[str, MatterContext] = {}

    def create(
        self,
        name: str,
        tier: str = DEFAULT_TIER,
        client_id: str | None = None,
        client_name: str | None = None,
        matter_type: str | None = None,
        tenant_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        auth = _require_tenant_context(tenant_context)
        now = datetime.now(UTC).isoformat()
        matter = MatterContext(
            matter_id=str(uuid4()),
            name=name,
            client_id=client_id or str(uuid4()),
            tenant_id=auth["tenant_id"],
            created_by_user_id=auth["user_id"],
            tier=tier,
            client_name=client_name,
            matter_type=matter_type,
            created_at=now,
            last_updated=now,
            history=[
                {
                    "event": "matter_created",
                    "timestamp": now,
                    "source": "core",
                }
            ],
        )
        self._matters[matter.matter_id] = matter
        return asdict(matter)

    def _assert_access(self, matter: MatterContext, tenant_context: dict[str, Any] | None) -> None:
        tenant = _tenant_id(tenant_context)
        if not tenant or matter.tenant_id != tenant:
            _audit_access_denied(matter.matter_id, tenant_context, matter.tenant_id)
            raise MatterTenantAccessError(matter.matter_id, tenant, matter.tenant_id)

    def get(self, matter_id: str, tenant_context: dict[str, Any] | None = None) -> dict[str, Any] | None:
        matter = self._matters.get(matter_id)
        if matter:
            self._assert_access(matter, tenant_context)
        return asdict(matter) if matter else None

    def list(self, tenant_context: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        auth = _require_tenant_context(tenant_context)
        return [asdict(matter) for matter in self._matters.values() if matter.tenant_id == auth["tenant_id"]]

    def attach_facts(self, matter_id: str, facts: dict[str, Any], tenant_context: dict[str, Any] | None = None) -> None:
        matter = self._matters.get(matter_id)
        if matter:
            self._assert_access(matter, tenant_context)
            matter.facts = facts
            matter.key_facts = {**matter.key_facts, **facts}
            self._touch(matter, "facts_attached", {"fact_keys": sorted(facts.keys())})

    def attach_draft(self, matter_id: str, draft: dict[str, Any], tenant_context: dict[str, Any] | None = None) -> None:
        matter = self._matters.get(matter_id)
        if matter:
            self._assert_access(matter, tenant_context)
            matter.drafts.append(draft)
            self._touch(matter, "draft_attached", {"draft_type": draft.get("draft_type")})

    def attach_billing_event(self, matter_id: str, event: dict[str, Any], tenant_context: dict[str, Any] | None = None) -> None:
        matter = self._matters.get(matter_id)
        if matter:
            self._assert_access(matter, tenant_context)
            matter.billing_events.append(event)
            self._touch(matter, "billing_event_attached", {"task": event.get("task")})

    def attach_route(self, matter_id: str, route: dict[str, Any], tenant_context: dict[str, Any] | None = None) -> None:
        matter = self._matters.get(matter_id)
        if matter:
            self._assert_access(matter, tenant_context)
            matter.route_history.append(route)
            self._touch(matter, "route_attached", {"expert": route.get("expert"), "route_mode": route.get("route_mode")})

    def update_context(self, intake: dict[str, Any], tenant_context: dict[str, Any] | None = None) -> dict[str, Any]:
        auth = _require_tenant_context(tenant_context)
        matter_id = str(intake.get("matter_id") or uuid4())
        now = datetime.now(UTC).isoformat()
        matter = self._matters.get(matter_id)
        if matter is not None:
            self._assert_access(matter, tenant_context)
        if matter is None:
            matter = MatterContext(
                matter_id=matter_id,
                name=str(intake.get("name") or intake.get("matter_name") or "New Matter"),
                client_id=str(intake.get("client_id") or uuid4()),
                tenant_id=auth["tenant_id"],
                created_by_user_id=auth["user_id"],
                tier=str(intake.get("tier") or DEFAULT_TIER),
                created_at=now,
                last_updated=now,
            )
            self._matters[matter_id] = matter
            self._touch(matter, "matter_created", {"source": intake.get("source") or "intake"})

        scalar_fields = (
            "name",
            "client_id",
            "client_name",
            "matter_type",
            "jurisdiction",
            "client_role",
            "requested_relief",
            "tier",
        )
        for field_name in scalar_fields:
            value = intake.get(field_name)
            if value is not None:
                setattr(matter, field_name, str(value))

        alias_name = intake.get("matter_name")
        if alias_name:
            matter.name = str(alias_name)

        list_fields = ("opposing_parties", "deadlines", "documents", "sensitivity_flags", "missing_information")
        for field_name in list_fields:
            value = intake.get(field_name)
            if isinstance(value, list):
                setattr(matter, field_name, value)

        key_facts = intake.get("key_facts")
        if isinstance(key_facts, dict):
            matter.key_facts = {**matter.key_facts, **key_facts}
            matter.facts = {**matter.facts, **key_facts}

        facts = intake.get("facts")
        if isinstance(facts, dict):
            matter.facts = {**matter.facts, **facts}
            matter.key_facts = {**matter.key_facts, **facts}

        history = intake.get("history")
        if isinstance(history, list):
            matter.history.extend(item for item in history if isinstance(item, dict))

        self._touch(
            matter,
            "matter_context_updated",
            {
                "source": intake.get("source") or "intake",
                "updated_fields": sorted(key for key, value in intake.items() if value is not None),
            },
        )
        return asdict(matter)

    def _touch(self, matter: MatterContext, event: str, details: dict[str, Any] | None = None) -> None:
        timestamp = datetime.now(UTC).isoformat()
        matter.last_updated = timestamp
        matter.history.append(
            {
                "event": event,
                "timestamp": timestamp,
                **(details or {}),
            }
        )


def _iso_to_datetime(value: str | datetime | None) -> datetime:
    if isinstance(value, datetime):
        return value
    if not value:
        return datetime.now(UTC)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(UTC)


def _datetime_to_iso(value: datetime | str | None) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.isoformat()
    if value:
        return str(value)
    return datetime.now(UTC).isoformat()


def _record_to_context(record: MatterRecord) -> dict[str, Any]:
    return {
        "matter_id": record.matter_id,
        "name": record.name,
        "client_id": record.client_id,
        "tenant_id": record.tenant_id,
        "created_by_user_id": record.created_by_user_id,
        "tier": record.tier,
        "client_name": record.client_name,
        "matter_type": record.matter_type,
        "jurisdiction": record.jurisdiction,
        "client_role": record.client_role,
        "opposing_parties": list(record.opposing_parties or []),
        "deadlines": list(record.deadlines or []),
        "requested_relief": record.requested_relief,
        "key_facts": dict(record.key_facts or {}),
        "documents": list(record.documents or []),
        "sensitivity_flags": list(record.sensitivity_flags or []),
        "missing_information": list(record.missing_information or []),
        "history": list(record.history or []),
        "created_at": _datetime_to_iso(record.created_at),
        "last_updated": _datetime_to_iso(record.last_updated),
        "facts": dict(record.facts or {}),
        "drafts": list(record.drafts or []),
        "billing_events": list(record.billing_events or []),
        "route_history": list(record.route_history or []),
    }


class DatabaseMatterStore:
    """Tenant-scoped persistent matter repository backed by SQLAlchemy."""

    def __init__(self) -> None:
        init_storage()
        trace_storage_event("matter_store_ready", "init", metadata={"repository": "sqlalchemy"})

    def create(
        self,
        name: str,
        tier: str = DEFAULT_TIER,
        client_id: str | None = None,
        client_name: str | None = None,
        matter_type: str | None = None,
        tenant_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        auth = _require_tenant_context(tenant_context)
        now = datetime.now(UTC)
        record = MatterRecord(
            matter_id=str(uuid4()),
            name=name,
            client_id=client_id or str(uuid4()),
            tenant_id=auth["tenant_id"],
            created_by_user_id=auth["user_id"],
            tier=tier,
            client_name=client_name,
            matter_type=matter_type,
            jurisdiction="District of Columbia",
            opposing_parties=[],
            deadlines=[],
            key_facts={},
            documents=[],
            sensitivity_flags=[],
            missing_information=[],
            history=[{"event": "matter_created", "timestamp": now.isoformat(), "source": "core"}],
            facts={},
            drafts=[],
            billing_events=[],
            route_history=[],
            created_at=now,
            last_updated=now,
        )
        with session_scope() as session:
            session.add(record)
        trace_storage_event("matter_created_persisted", "matter_create", tenant_id=auth["tenant_id"], matter_id=record.matter_id)
        return _record_to_context(record)

    def _assert_access(self, record: MatterRecord, tenant_context: dict[str, Any] | None) -> None:
        tenant = _tenant_id(tenant_context)
        if not tenant or record.tenant_id != tenant:
            _audit_access_denied(record.matter_id, tenant_context, record.tenant_id)
            raise MatterTenantAccessError(record.matter_id, tenant, record.tenant_id)

    def get(self, matter_id: str, tenant_context: dict[str, Any] | None = None) -> dict[str, Any] | None:
        with session_scope() as session:
            record = session.get(MatterRecord, matter_id)
            if record:
                self._assert_access(record, tenant_context)
                payload = _record_to_context(record)
        trace_storage_event("matter_read", "matter_get", tenant_id=_tenant_id(tenant_context), matter_id=matter_id)
        return payload if "payload" in locals() else None

    def list(self, tenant_context: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        auth = _require_tenant_context(tenant_context)
        with session_scope() as session:
            records = (
                session.query(MatterRecord)
                .filter(MatterRecord.tenant_id == auth["tenant_id"])
                .order_by(MatterRecord.last_updated.desc())
                .all()
            )
            payload = [_record_to_context(record) for record in records]
        trace_storage_event("matters_listed", "matter_list", tenant_id=auth["tenant_id"], metadata={"count": len(payload)})
        return payload

    def attach_facts(self, matter_id: str, facts: dict[str, Any], tenant_context: dict[str, Any] | None = None) -> None:
        self._mutate(matter_id, tenant_context, lambda record: self._attach_facts(record, facts))

    def attach_draft(self, matter_id: str, draft: dict[str, Any], tenant_context: dict[str, Any] | None = None) -> None:
        self._mutate(matter_id, tenant_context, lambda record: self._append(record, "drafts", draft, "draft_attached", {"draft_type": draft.get("draft_type")}))

    def attach_billing_event(self, matter_id: str, event: dict[str, Any], tenant_context: dict[str, Any] | None = None) -> None:
        self._mutate(matter_id, tenant_context, lambda record: self._append(record, "billing_events", event, "billing_event_attached", {"task": event.get("task")}))

    def attach_route(self, matter_id: str, route: dict[str, Any], tenant_context: dict[str, Any] | None = None) -> None:
        self._mutate(
            matter_id,
            tenant_context,
            lambda record: self._append(record, "route_history", route, "route_attached", {"expert": route.get("expert"), "route_mode": route.get("route_mode")}),
        )

    def update_context(self, intake: dict[str, Any], tenant_context: dict[str, Any] | None = None) -> dict[str, Any]:
        auth = _require_tenant_context(tenant_context)
        matter_id = str(intake.get("matter_id") or uuid4())
        now = datetime.now(UTC)
        with session_scope() as session:
            record = session.get(MatterRecord, matter_id)
            if record is not None:
                self._assert_access(record, tenant_context)
            if record is None:
                record = MatterRecord(
                    matter_id=matter_id,
                    name=str(intake.get("name") or intake.get("matter_name") or "New Matter"),
                    client_id=str(intake.get("client_id") or uuid4()),
                    tenant_id=auth["tenant_id"],
                    created_by_user_id=auth["user_id"],
                    tier=str(intake.get("tier") or DEFAULT_TIER),
                    jurisdiction="District of Columbia",
                    opposing_parties=[],
                    deadlines=[],
                    key_facts={},
                    documents=[],
                    sensitivity_flags=[],
                    missing_information=[],
                    history=[],
                    facts={},
                    drafts=[],
                    billing_events=[],
                    route_history=[],
                    created_at=now,
                    last_updated=now,
                )
                session.add(record)
                self._touch(record, "matter_created", {"source": intake.get("source") or "intake"})
            self._apply_intake(record, intake)
            self._touch(
                record,
                "matter_context_updated",
                {
                    "source": intake.get("source") or "intake",
                    "updated_fields": sorted(key for key, value in intake.items() if value is not None),
                },
            )
            payload = _record_to_context(record)
        trace_storage_event("matter_context_persisted", "matter_update", tenant_id=auth["tenant_id"], matter_id=matter_id)
        return payload

    def _mutate(self, matter_id: str, tenant_context: dict[str, Any] | None, mutator: Any) -> None:
        with session_scope() as session:
            record = session.get(MatterRecord, matter_id)
            if not record:
                return
            self._assert_access(record, tenant_context)
            mutator(record)
        trace_storage_event("matter_mutation_persisted", "matter_mutate", tenant_id=_tenant_id(tenant_context), matter_id=matter_id)

    def _attach_facts(self, record: MatterRecord, facts: dict[str, Any]) -> None:
        record.facts = dict(facts)
        record.key_facts = {**dict(record.key_facts or {}), **facts}
        self._touch(record, "facts_attached", {"fact_keys": sorted(facts.keys())})

    def _append(self, record: MatterRecord, field_name: str, value: dict[str, Any], event: str, details: dict[str, Any]) -> None:
        current = list(getattr(record, field_name) or [])
        current.append(value)
        setattr(record, field_name, current)
        self._touch(record, event, details)

    def _apply_intake(self, record: MatterRecord, intake: dict[str, Any]) -> None:
        scalar_fields = (
            "name",
            "client_id",
            "client_name",
            "matter_type",
            "jurisdiction",
            "client_role",
            "requested_relief",
            "tier",
        )
        for field_name in scalar_fields:
            value = intake.get(field_name)
            if value is not None:
                setattr(record, field_name, str(value))
        if intake.get("matter_name"):
            record.name = str(intake["matter_name"])
        for field_name in ("opposing_parties", "deadlines", "documents", "sensitivity_flags", "missing_information"):
            value = intake.get(field_name)
            if isinstance(value, list):
                setattr(record, field_name, value)
        key_facts = intake.get("key_facts")
        if isinstance(key_facts, dict):
            record.key_facts = {**dict(record.key_facts or {}), **key_facts}
            record.facts = {**dict(record.facts or {}), **key_facts}
        facts = intake.get("facts")
        if isinstance(facts, dict):
            record.facts = {**dict(record.facts or {}), **facts}
            record.key_facts = {**dict(record.key_facts or {}), **facts}
        history = intake.get("history")
        if isinstance(history, list):
            record.history = list(record.history or []) + [item for item in history if isinstance(item, dict)]

    def _touch(self, record: MatterRecord, event: str, details: dict[str, Any] | None = None) -> None:
        timestamp = datetime.now(UTC)
        record.last_updated = timestamp
        record.history = [
            *list(record.history or []),
            {
                "event": event,
                "timestamp": timestamp.isoformat(),
                **(details or {}),
            },
        ]


class UnavailableMatterStore:
    def _raise(self) -> NoReturn:
        raise RuntimeError("Persistent matter storage is required outside MERCY_ENV=local. Set POSTGRES_URL or SUPABASE_URL.")

    def create(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        self._raise()

    def get(self, *args: Any, **kwargs: Any) -> dict[str, Any] | None:
        self._raise()

    def list(self, *args: Any, **kwargs: Any) -> list[dict[str, Any]]:
        self._raise()

    def attach_facts(self, *args: Any, **kwargs: Any) -> None:
        self._raise()

    def attach_draft(self, *args: Any, **kwargs: Any) -> None:
        self._raise()

    def attach_billing_event(self, *args: Any, **kwargs: Any) -> None:
        self._raise()

    def attach_route(self, *args: Any, **kwargs: Any) -> None:
        self._raise()

    def update_context(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        self._raise()


def _build_matter_store() -> InMemoryMatterStore | DatabaseMatterStore | UnavailableMatterStore:
    if persistent_storage_configured():
        return DatabaseMatterStore()
    if local_memory_fallback_allowed():
        init_storage()
        return InMemoryMatterStore()
    trace_storage_event("matter_store_unavailable", "init", metadata=storage_status())
    return UnavailableMatterStore()


MATTERS = _build_matter_store()


def _ensure_matter_store() -> InMemoryMatterStore | DatabaseMatterStore | UnavailableMatterStore:
    global MATTERS
    if isinstance(MATTERS, UnavailableMatterStore) and (persistent_storage_configured() or local_memory_fallback_allowed()):
        MATTERS = _build_matter_store()
    return MATTERS


def get_matter_context(matter_id: str | None, tenant_context: dict[str, Any] | None = None) -> dict[str, Any] | None:
    if not matter_id:
        return None
    return _ensure_matter_store().get(matter_id, tenant_context=tenant_context)


def update_matter_context(intake: dict[str, Any], tenant_context: dict[str, Any] | None = None) -> dict[str, Any]:
    updated = _ensure_matter_store().update_context(intake, tenant_context=tenant_context)
    trace_event(
        name="matter_context_update",
        surface_context=str(intake.get("source") or "core_intake"),
        category="matter_context",
        matter_reference=updated.get("matter_id"),
        metadata={
            "matter_id": updated.get("matter_id"),
            "client_id": updated.get("client_id"),
            "tenant_id": updated.get("tenant_id"),
            "user_id": _user_id(tenant_context),
            "document_count": len(updated.get("documents") or []),
            "missing_information_count": len(updated.get("missing_information") or []),
        },
    )
    return updated


def build_billing_report(matter: dict[str, Any]) -> dict[str, Any]:
    events = matter.get("billing_events") or []
    total_minutes = sum(int(event.get("estimated_minutes_saved", 0)) for event in events)
    line_items = [
        {
            "description": f"AI-assisted {event.get('task', 'legal workflow').replace('_', ' ')}",
            "estimated_minutes_saved": event.get("estimated_minutes_saved", 0),
            "client_disbursement_note": "Review client engagement terms before billing.",
        }
        for event in events
    ]
    return {
        "matter_id": matter["matter_id"],
        "matter_name": matter["name"],
        "generated_at": datetime.now(UTC).isoformat(),
        "line_items": line_items,
        "total_estimated_minutes_saved": total_minutes,
        "ethics_note": (
            "D.C. Bar Ethics Opinion 388 requires competent supervision, "
            "confidentiality safeguards, citation verification, and reasonable fees."
        ),
    }


def product_capabilities() -> dict[str, Any]:
    return {
        "product": PRODUCT_NAME,
        "core": CORE_NAME,
        "positioning": "Affordable D.C.-native alternative for appellate and administrative practice.",
        "windows": ["standalone_platform", "word_plugin"],
        "router": {
            "version": "moe-router-1.0",
            "experts": [
                "Research",
                "Drafting",
                "Compliance/Guardrails",
                "Intake",
                "Citation-Verifier",
            ],
            "endpoint": "/v1/router/inspect",
            "rag_endpoint": "/v1/rag/retrieve",
            "rag_status_endpoint": "/v1/rag/status",
            "rag_ingest_endpoint": "/v1/rag/ingest",
            "rag_eval_endpoint": "/v1/rag/evaluate",
            "full_intake_endpoint": "/v1/matter/intake/full",
            "agent_execute_endpoint": "/v1/agent/execute",
            "agent_skills_endpoint": "/v1/agent/skills",
            "retrieval_backbone": "dc-knowledge-rag-1.0",
            "eval_backbone": "ragas-eval-1.0",
            "agent_network": "agent-network-langgraph-1.0",
        },
        "observability": {
            "version": "mercy-observability-1.0",
            "trace_endpoint": "/v1/observability/trace",
            "langsmith_project_env": "LANGSMITH_PROJECT",
            "langsmith_tracing_env": "LANGSMITH_TRACING",
        },
        "llm_providers": llm_provider_status(),
        "tiers": {
            "free": [
                "single-document drafting",
                "basic citation placeholders",
                "basic D.C. guardrail checks",
            ],
            "premium": [
                "multi-document administrative record indexing",
                "audit trail and citation verification workflow",
                "client billing report",
                "project context sync between platform and plugin",
            ],
        },
        "security_posture": {
            "mode": "tenant-scoped persistent storage" if storage_status()["persistent"] else "zero-retention local development",
            "storage": storage_status()["mode"],
            "storage_status": storage_status(),
            "training_use": "client data is not used for model training by Mercy",
        },
    }
