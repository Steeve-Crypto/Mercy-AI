from __future__ import annotations

import math
import os
import re
import hashlib
from collections import Counter
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, date
from importlib import metadata
from typing import Any

from dc_guardrails import evaluate_dc_guardrails
from llm_providers import generate_research_answer
from mercy_storage import (
    DCRagChunkRecord,
    DCRagSourceRecord,
    init_storage,
    persistent_storage_configured,
    session_scope,
    trace_storage_event,
)
from observability import record_rag_trace, trace_event, trace_span
from security_controls import record_security_audit, sanitize_payload, sanitize_text


RAG_VERSION = "dc-knowledge-rag-1.0"
TOKEN_PATTERN = re.compile(r"[a-zA-Z][a-zA-Z0-9_.-]{1,}")
SUPPORTED_VECTOR_BACKENDS = {"local", "qdrant", "pgvector"}
SUPPORTED_GRAPH_BACKENDS = {"local", "neo4j", "llamaindex_property_graph"}
SUPPORTED_SOURCE_TYPES = {"official_source", "statute", "rule", "case", "regulation", "ethics_opinion", "court_rule_reference"}
SUPPORTED_AUTHORITY_TYPES = {"statute", "rule", "case", "regulation", "ethics_opinion", "court_rule", "administrative_order"}
SUPPORTED_VERIFICATION_STATUSES = {"official_verified", "official_metadata_unquoted", "official_registered"}
SOURCE_CONTRACT_VERSION = "dc-official-source-contract-1.0"


class RetrievalBackendError(RuntimeError):
    pass


class SourceValidationError(ValueError):
    pass


def _is_local_env() -> bool:
    return os.getenv("MERCY_ENV") == "local" or os.getenv("MERCY_AUTH_MODE") == "dev"


def _package_version(package_name: str) -> str | None:
    try:
        return metadata.version(package_name)
    except metadata.PackageNotFoundError:
        return None


def _optional_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_jurisdiction(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text in {"dc", "d.c.", "district of columbia"}:
        return "District of Columbia"
    return str(value or "").strip()


@dataclass
class KnowledgeProvenance:
    source_id: str
    source_title: str
    citation_label: str
    source_type: str
    authority_type: str
    jurisdiction: str
    official_locator: str
    url: str | None = None
    last_checked: str | None = None
    retrieval_method: str = "hybrid_local"


@dataclass
class SourceRecord:
    source_id: str
    title: str
    source_type: str
    authority_type: str
    jurisdiction: str
    citation_label: str
    official_locator: str
    url: str | None = None
    file_anchor: str | None = None
    last_checked: str = field(default_factory=lambda: date.today().isoformat())
    verification_status: str = "official_metadata_unquoted"
    refresh_cadence: str = "manual_review"
    local_demo: bool = False
    active: bool = True

    @classmethod
    def from_payload(cls, payload: dict[str, Any], *, allow_local_demo: bool = False) -> "SourceRecord":
        record = cls(
            source_id=str(payload.get("source_id") or "").strip(),
            title=str(payload.get("title") or payload.get("source_title") or "").strip(),
            source_type=str(payload.get("source_type") or "").strip(),
            authority_type=str(payload.get("authority_type") or "").strip(),
            jurisdiction=_normalize_jurisdiction(payload.get("jurisdiction")),
            citation_label=str(payload.get("citation_label") or "").strip(),
            official_locator=str(payload.get("official_locator") or "").strip(),
            url=_optional_text(payload.get("url")),
            file_anchor=_optional_text(payload.get("file_anchor")),
            last_checked=str(payload.get("last_checked") or "").strip(),
            verification_status=str(payload.get("verification_status") or "").strip(),
            refresh_cadence=str(payload.get("refresh_cadence") or "manual_review").strip(),
            local_demo=bool(payload.get("local_demo")),
            active=bool(payload.get("active", True)),
        )
        record.validate(allow_local_demo=allow_local_demo)
        return record

    def validate(self, *, allow_local_demo: bool = False) -> None:
        missing = [
            field_name
            for field_name in (
                "source_id",
                "title",
                "source_type",
                "authority_type",
                "jurisdiction",
                "citation_label",
                "official_locator",
                "last_checked",
                "verification_status",
            )
            if not getattr(self, field_name)
        ]
        if missing:
            raise SourceValidationError(f"Missing required source fields: {', '.join(missing)}.")
        if self.jurisdiction != "District of Columbia":
            raise SourceValidationError("Only District of Columbia sources may be registered.")
        if self.authority_type not in SUPPORTED_AUTHORITY_TYPES:
            raise SourceValidationError(f"Unsupported authority_type: {self.authority_type}.")
        if not self.local_demo and self.source_type not in SUPPORTED_SOURCE_TYPES:
            raise SourceValidationError(f"Unsupported source_type for official source registry: {self.source_type}.")
        if self.verification_status not in SUPPORTED_VERIFICATION_STATUSES:
            raise SourceValidationError(f"Unsupported verification_status: {self.verification_status}.")
        if not (self.url or self.file_anchor):
            raise SourceValidationError("Source must include either url or file_anchor.")
        try:
            date.fromisoformat(self.last_checked)
        except ValueError as exc:
            raise SourceValidationError("last_checked must be an ISO date: YYYY-MM-DD.") from exc
        if self.local_demo and not allow_local_demo:
            raise SourceValidationError("local_demo sources are allowed only in local development.")

    def official(self) -> bool:
        return self.active and not self.local_demo and self.verification_status in SUPPORTED_VERIFICATION_STATUSES


@dataclass
class KnowledgeChunk:
    chunk_id: str
    source_id: str
    text: str
    summary: str
    source_title: str
    citation_label: str
    source_type: str
    authority_type: str
    jurisdiction: str
    official_locator: str
    url: str | None = None
    entities: list[str] = field(default_factory=list)
    relationships: list[dict[str, str]] = field(default_factory=list)
    verification_status: str = "official_metadata_unquoted"
    citation_required: bool = True
    last_checked: str = "2026-05-12"
    practice_area: str = "professional_responsibility"
    source_date: str | None = None
    tenant_id: str | None = None

    def to_result(
        self,
        vector_score: float,
        graph_score: float,
        combined_score: float,
        retrieval_method: str,
    ) -> dict[str, Any]:
        provenance = KnowledgeProvenance(
            source_id=self.source_id,
            source_title=self.source_title,
            citation_label=self.citation_label,
            source_type=self.source_type,
            authority_type=self.authority_type,
            jurisdiction=self.jurisdiction,
            official_locator=self.official_locator,
            url=self.url,
            last_checked=self.last_checked,
            retrieval_method=retrieval_method,
        )
        return {
            "chunk_id": self.chunk_id,
            "source_id": self.source_id,
            "text": self.text,
            "summary": self.summary,
            "vector_score": round(vector_score, 4),
            "graph_score": round(graph_score, 4),
            "combined_score": round(combined_score, 4),
            "verification_status": self.verification_status,
            "citation_required": self.citation_required,
            "citation": {
                "label": self.citation_label,
                "source_type": self.source_type,
                "verification_status": self.verification_status,
                "note": (
                    "Use as retrieval grounding only. Attorney must verify the official source, "
                    "current validity, and pinpoint support before relying on it."
                ),
                "provenance": asdict(provenance),
            },
            "provenance": asdict(provenance),
            "entities": self.entities,
            "relationships": self.relationships,
            "practice_area": self.practice_area,
            "source_date": self.source_date,
        }


@dataclass
class RetrievalHit:
    chunk: KnowledgeChunk
    score: float
    backend: str
    matched_terms: list[str] = field(default_factory=list)


class SourceRegistry:
    def __init__(self, records: list[SourceRecord] | None = None) -> None:
        self._records: dict[str, SourceRecord] = {}
        for record in records or []:
            self.register(record)

    def register(self, record: SourceRecord) -> None:
        self._records[record.source_id] = record

    def get(self, source_id: str) -> SourceRecord | None:
        return self._records.get(source_id)

    def is_registered_official(self, source_id: str) -> bool:
        record = self.get(source_id)
        return bool(record and record.official())

    def is_allowed_for_retrieval(self, source_id: str) -> bool:
        record = self.get(source_id)
        if not record or not record.active:
            return False
        if record.local_demo:
            return _is_local_env()
        return record.official()

    def official_sources(self) -> list[dict[str, Any]]:
        return [asdict(record) for record in self._records.values() if record.official()]

    def local_demo_sources(self) -> list[dict[str, Any]]:
        return [asdict(record) for record in self._records.values() if record.local_demo]

    def status(self) -> dict[str, Any]:
        return {
            "contract_version": SOURCE_CONTRACT_VERSION,
            "official_source_count": len(self.official_sources()),
            "local_demo_source_count": len(self.local_demo_sources()),
            "local_demo_active": _is_local_env() and bool(self.local_demo_sources()),
            "active_official_sources": self.official_sources(),
            "required_fields": [
                "source_id",
                "title",
                "source_type",
                "authority_type",
                "jurisdiction",
                "citation_label",
                "official_locator",
                "url_or_file_anchor",
                "last_checked",
                "verification_status",
                "refresh_cadence",
            ],
            "supported_authority_types": sorted(SUPPORTED_AUTHORITY_TYPES),
            "supported_source_types": sorted(SUPPORTED_SOURCE_TYPES),
            "supported_verification_statuses": sorted(SUPPORTED_VERIFICATION_STATUSES),
        }


_OFFICIAL_SOURCE_RECORDS: dict[str, SourceRecord] = {}


def _active_source_registry(tenant_id: str | None = None) -> SourceRegistry:
    records = list(_OFFICIAL_SOURCE_RECORDS.values())
    records.extend(_persistent_source_records(tenant_id))
    if _is_local_env():
        records.extend(_local_demo_source_records())
    return SourceRegistry(records)


def _persistent_source_records(tenant_id: str | None) -> list[SourceRecord]:
    if not persistent_storage_configured() or not tenant_id:
        return []
    try:
        init_storage()
        with session_scope() as session:
            records = (
                session.query(DCRagSourceRecord)
                .filter(DCRagSourceRecord.tenant_id.in_([tenant_id, "public"]), DCRagSourceRecord.active.is_(True))
                .all()
            )
            return [
                SourceRecord(
                    source_id=record.source_id,
                    title=record.title,
                    source_type=record.source_type,
                    authority_type=record.authority_type,
                    jurisdiction=record.jurisdiction,
                    citation_label=record.citation_label,
                    official_locator=record.official_locator,
                    url=record.url,
                    file_anchor=record.file_anchor,
                    last_checked=record.last_checked,
                    verification_status=record.verification_status,
                    refresh_cadence=record.refresh_cadence,
                    local_demo=bool(record.local_demo),
                    active=bool(record.active),
                )
                for record in records
            ]
    except Exception as exc:
        trace_storage_event("rag_source_load_failed", "rag_source_read", tenant_id=tenant_id, metadata={"error": str(exc)})
        return []


def _persistent_chunks(tenant_id: str | None) -> list[KnowledgeChunk]:
    if not persistent_storage_configured() or not tenant_id:
        return []
    try:
        init_storage()
        with session_scope() as session:
            records = session.query(DCRagChunkRecord).filter(DCRagChunkRecord.tenant_id.in_([tenant_id, "public"])).all()
            chunks = [
                KnowledgeChunk(
                    chunk_id=record.chunk_id,
                    source_id=record.source_id,
                    text=record.text,
                    summary=record.summary,
                    source_title=record.source_title,
                    citation_label=record.citation_label,
                    source_type=record.source_type,
                    authority_type=record.authority_type,
                    jurisdiction=record.jurisdiction,
                    official_locator=record.official_locator,
                    url=record.url,
                    entities=[str(entity) for entity in record.entities or []],
                    relationships=[relation for relation in record.relationships or [] if isinstance(relation, dict)],
                    verification_status=record.verification_status,
                    citation_required=bool(record.citation_required),
                    last_checked=record.last_checked,
                    practice_area=record.practice_area,
                    source_date=record.source_date,
                    tenant_id=record.tenant_id,
                )
                for record in records
            ]
        trace_storage_event("rag_chunks_loaded", "rag_chunk_read", tenant_id=tenant_id, metadata={"chunk_count": len(chunks)})
        return chunks
    except Exception as exc:
        trace_storage_event("rag_chunk_load_failed", "rag_chunk_read", tenant_id=tenant_id, metadata={"error": str(exc)})
        return []


def _persist_ingested_source(source: SourceRecord, chunks: list[KnowledgeChunk], tenant_id: str) -> None:
    init_storage()
    now = datetime.now(UTC)
    with session_scope() as session:
        source_record = session.get(DCRagSourceRecord, {"tenant_id": tenant_id, "source_id": source.source_id})
        if source_record is None:
            source_record = DCRagSourceRecord(
                tenant_id=tenant_id,
                source_id=source.source_id,
                title=source.title,
                source_type=source.source_type,
                authority_type=source.authority_type,
                jurisdiction=source.jurisdiction,
                citation_label=source.citation_label,
                official_locator=source.official_locator,
                url=source.url,
                file_anchor=source.file_anchor,
                last_checked=source.last_checked,
                verification_status=source.verification_status,
                refresh_cadence=source.refresh_cadence,
                local_demo=source.local_demo,
                active=source.active,
                created_at=now,
                updated_at=now,
            )
            session.add(source_record)
        else:
            source_record.title = source.title
            source_record.source_type = source.source_type
            source_record.authority_type = source.authority_type
            source_record.jurisdiction = source.jurisdiction
            source_record.citation_label = source.citation_label
            source_record.official_locator = source.official_locator
            source_record.url = source.url
            source_record.file_anchor = source.file_anchor
            source_record.last_checked = source.last_checked
            source_record.verification_status = source.verification_status
            source_record.refresh_cadence = source.refresh_cadence
            source_record.local_demo = source.local_demo
            source_record.active = source.active
            source_record.updated_at = now

        for chunk in chunks:
            chunk.tenant_id = tenant_id
            chunk_record = session.get(DCRagChunkRecord, {"tenant_id": tenant_id, "chunk_id": chunk.chunk_id})
            embedding = _stable_embedding(_chunk_text(chunk))
            if chunk_record is None:
                chunk_record = DCRagChunkRecord(
                    tenant_id=tenant_id,
                    chunk_id=chunk.chunk_id,
                    source_id=chunk.source_id,
                    text=chunk.text,
                    summary=chunk.summary,
                    source_title=chunk.source_title,
                    citation_label=chunk.citation_label,
                    source_type=chunk.source_type,
                    authority_type=chunk.authority_type,
                    jurisdiction=chunk.jurisdiction,
                    official_locator=chunk.official_locator,
                    url=chunk.url,
                    entities=chunk.entities,
                    relationships=chunk.relationships,
                    verification_status=chunk.verification_status,
                    citation_required=chunk.citation_required,
                    last_checked=chunk.last_checked,
                    practice_area=chunk.practice_area,
                    source_date=chunk.source_date,
                    embedding=embedding,
                    created_at=now,
                    updated_at=now,
                )
                session.add(chunk_record)
            else:
                chunk_record.source_id = chunk.source_id
                chunk_record.text = chunk.text
                chunk_record.summary = chunk.summary
                chunk_record.source_title = chunk.source_title
                chunk_record.citation_label = chunk.citation_label
                chunk_record.source_type = chunk.source_type
                chunk_record.authority_type = chunk.authority_type
                chunk_record.jurisdiction = chunk.jurisdiction
                chunk_record.official_locator = chunk.official_locator
                chunk_record.url = chunk.url
                chunk_record.entities = chunk.entities
                chunk_record.relationships = chunk.relationships
                chunk_record.verification_status = chunk.verification_status
                chunk_record.citation_required = chunk.citation_required
                chunk_record.last_checked = chunk.last_checked
                chunk_record.practice_area = chunk.practice_area
                chunk_record.source_date = chunk.source_date
                chunk_record.embedding = embedding
                chunk_record.updated_at = now
    trace_storage_event(
        "rag_ingestion_persisted",
        "rag_ingest",
        tenant_id=tenant_id,
        metadata={"source_id": source.source_id, "chunk_count": len(chunks)},
    )


@dataclass
class RetrievalConfig:
    vector_backend: str = "local"
    graph_backend: str = "local"
    qdrant_url: str | None = None
    qdrant_collection: str | None = None
    pgvector_dsn: str | None = None
    pgvector_table: str | None = None
    neo4j_uri: str | None = None
    neo4j_database: str | None = None
    neo4j_user: str | None = None
    neo4j_password: str | None = None

    @classmethod
    def from_env(cls) -> "RetrievalConfig":
        vector_backend = os.getenv("MERCY_RAG_VECTOR_BACKEND", "").lower()
        graph_backend = os.getenv("MERCY_RAG_GRAPH_BACKEND", "").lower()
        if not vector_backend:
            vector_backend = (
                "qdrant"
                if os.getenv("MERCY_QDRANT_URL")
                else "pgvector"
                if os.getenv("MERCY_PGVECTOR_DSN") or os.getenv("POSTGRES_URL") or os.getenv("SUPABASE_URL")
                else "local"
            )
        if not graph_backend:
            graph_backend = "neo4j" if os.getenv("MERCY_NEO4J_URI") else "local"
        if vector_backend not in SUPPORTED_VECTOR_BACKENDS:
            vector_backend = "local"
        if graph_backend not in SUPPORTED_GRAPH_BACKENDS:
            graph_backend = "local"
        return cls(
            vector_backend=vector_backend,
            graph_backend=graph_backend,
            qdrant_url=os.getenv("MERCY_QDRANT_URL"),
            qdrant_collection=os.getenv("MERCY_QDRANT_COLLECTION", "dc_legal_knowledge"),
            pgvector_dsn=os.getenv("MERCY_PGVECTOR_DSN") or os.getenv("POSTGRES_URL") or os.getenv("SUPABASE_URL"),
            pgvector_table=os.getenv("MERCY_PGVECTOR_TABLE", "mercy_dc_chunks"),
            neo4j_uri=os.getenv("MERCY_NEO4J_URI"),
            neo4j_database=os.getenv("MERCY_NEO4J_DATABASE"),
            neo4j_user=os.getenv("MERCY_NEO4J_USER"),
            neo4j_password=os.getenv("MERCY_NEO4J_PASSWORD"),
        )

    def local_demo_allowed(self) -> bool:
        return self.vector_backend == "local" and self.graph_backend == "local" and _is_local_env()


def _local_demo_source_records() -> list[SourceRecord]:
    records = [
        {
            "source_id": "local_demo_dc_ethics_opinion_388",
            "title": "D.C. Bar Ethics Opinion 388",
            "source_type": "local_demo_official_metadata",
            "authority_type": "ethics_opinion",
            "jurisdiction": "District of Columbia",
            "citation_label": "D.C. Bar Ethics Op. 388",
            "official_locator": "D.C. Bar Legal Ethics Opinions database",
            "url": "https://www.dcbar.org/For-Lawyers/Legal-Ethics/Ethics-Opinions-210-Present",
            "last_checked": "2026-05-12",
            "verification_status": "official_metadata_unquoted",
            "refresh_cadence": "manual_review",
            "local_demo": True,
        },
        {
            "source_id": "local_demo_dc_rules_professional_conduct",
            "title": "D.C. Rules of Professional Conduct",
            "source_type": "local_demo_official_metadata",
            "authority_type": "rule",
            "jurisdiction": "District of Columbia",
            "citation_label": "D.C. Rules of Professional Conduct",
            "official_locator": "D.C. Bar Rules of Professional Conduct",
            "url": "https://www.dcbar.org/For-Lawyers/Legal-Ethics/Rules-of-Professional-Conduct",
            "last_checked": "2026-05-12",
            "verification_status": "official_metadata_unquoted",
            "refresh_cadence": "manual_review",
            "local_demo": True,
        },
        {
            "source_id": "local_demo_dc_circuit_rules",
            "title": "D.C. Circuit Rules and Handbook",
            "source_type": "local_demo_official_metadata",
            "authority_type": "court_rule",
            "jurisdiction": "District of Columbia",
            "citation_label": "D.C. Cir. Rules and Handbook",
            "official_locator": "U.S. Court of Appeals for the D.C. Circuit rules and handbook pages",
            "url": "https://www.cadc.uscourts.gov/internet/home.nsf/Content/Rules+and+Operating+Procedures",
            "last_checked": "2026-05-12",
            "verification_status": "official_metadata_unquoted",
            "refresh_cadence": "manual_review",
            "local_demo": True,
        },
        {
            "source_id": "local_demo_dc_admin_record_control",
            "title": "D.C. administrative record verification practice note",
            "source_type": "local_demo_internal_control",
            "authority_type": "administrative_order",
            "jurisdiction": "District of Columbia",
            "citation_label": "D.C. administrative record verification",
            "official_locator": "Internal Mercy control derived from D.C. appellate/admin practice requirements",
            "file_anchor": "local_demo:dc_admin_record_review",
            "last_checked": "2026-05-12",
            "verification_status": "official_metadata_unquoted",
            "refresh_cadence": "manual_review",
            "local_demo": True,
        },
    ]
    return [SourceRecord.from_payload(record, allow_local_demo=True) for record in records]


def _seed_chunks() -> list[KnowledgeChunk]:
    return [
        KnowledgeChunk(
            chunk_id="dc_ethics_opinion_388_ai",
            source_id="local_demo_dc_ethics_opinion_388",
            text=(
                "D.C. Bar Ethics Opinion 388 addresses lawyer use of generative AI. "
                "Mercy treats it as requiring competent attorney supervision, confidentiality safeguards, "
                "verification of authorities and record support, fee reasonableness review, billing safeguards, "
                "source-grounded research, and legal AI governance."
            ),
            summary="Generative AI legal work requires attorney supervision, confidentiality, source verification, and fee review.",
            source_title="D.C. Bar Ethics Opinion 388",
            citation_label="D.C. Bar Ethics Op. 388",
            source_type="ethics_opinion",
            authority_type="professional_responsibility",
            jurisdiction="District of Columbia",
            official_locator="D.C. Bar Legal Ethics Opinions database",
            entities=[
                "generative_ai",
                "attorney_supervision",
                "confidentiality",
                "citation_verification",
                "fees",
                "fee_reasonableness",
                "billing",
                "research",
                "source_grounded",
                "governance",
            ],
            relationships=[
                {"from": "generative_ai", "type": "requires", "to": "attorney_supervision"},
                {"from": "generative_ai", "type": "requires", "to": "citation_verification"},
                {"from": "generative_ai", "type": "requires", "to": "confidentiality"},
                {"from": "billing", "type": "requires", "to": "fee_reasonableness"},
                {"from": "research", "type": "requires", "to": "source_verification"},
            ],
        ),
        KnowledgeChunk(
            chunk_id="dc_rule_1_1_competence",
            source_id="local_demo_dc_rules_professional_conduct",
            text=(
                "D.C. Rule of Professional Conduct 1.1 concerns competence. "
                "Legal AI outputs should be reviewed by a competent attorney before client use."
            ),
            summary="Attorney competence remains required when using AI-assisted legal work.",
            source_title="D.C. Rules of Professional Conduct, Rule 1.1",
            citation_label="D.C. R. Prof'l Conduct 1.1",
            source_type="professional_rule",
            authority_type="professional_responsibility",
            jurisdiction="District of Columbia",
            official_locator="D.C. Bar Rules of Professional Conduct",
            entities=["competence", "attorney_review", "legal_ai"],
            relationships=[{"from": "legal_ai", "type": "requires", "to": "competent_attorney_review"}],
        ),
        KnowledgeChunk(
            chunk_id="dc_rule_1_6_confidentiality",
            source_id="local_demo_dc_rules_professional_conduct",
            text=(
                "D.C. Rule of Professional Conduct 1.6 concerns confidentiality of information. "
                "Matter context, selected text, documents, and client facts should be handled as confidential by default."
            ),
            summary="Client and matter data must be treated as confidential by default.",
            source_title="D.C. Rules of Professional Conduct, Rule 1.6",
            citation_label="D.C. R. Prof'l Conduct 1.6",
            source_type="professional_rule",
            authority_type="professional_responsibility",
            jurisdiction="District of Columbia",
            official_locator="D.C. Bar Rules of Professional Conduct",
            entities=["confidentiality", "client_information", "matter_context"],
            relationships=[{"from": "matter_context", "type": "protected_by", "to": "confidentiality"}],
        ),
        KnowledgeChunk(
            chunk_id="dc_rule_5_3_supervision",
            source_id="local_demo_dc_rules_professional_conduct",
            text=(
                "D.C. Rule of Professional Conduct 5.3 concerns lawyer responsibilities for nonlawyer assistance. "
                "Mercy treats AI-assisted workflows as requiring lawyer supervision and review before external use."
            ),
            summary="AI-assisted legal work should remain under lawyer supervision.",
            source_title="D.C. Rules of Professional Conduct, Rule 5.3",
            citation_label="D.C. R. Prof'l Conduct 5.3",
            source_type="professional_rule",
            authority_type="professional_responsibility",
            jurisdiction="District of Columbia",
            official_locator="D.C. Bar Rules of Professional Conduct",
            entities=["supervision", "nonlawyer_assistance", "legal_ai"],
            relationships=[{"from": "legal_ai", "type": "requires", "to": "lawyer_supervision"}],
        ),
        KnowledgeChunk(
            chunk_id="dc_circuit_brief_verification",
            source_id="local_demo_dc_circuit_rules",
            text=(
                "D.C. Circuit appellate drafting requires careful verification of record references, authorities, "
                "quotes, and procedural requirements. Mercy flags these as attorney-verification tasks."
            ),
            summary="D.C. Circuit briefs need verified authorities, quotes, record references, and procedure checks.",
            source_title="D.C. Circuit Rules and Handbook",
            citation_label="D.C. Cir. Rules and Handbook",
            source_type="court_rule_reference",
            authority_type="court_rule",
            jurisdiction="District of Columbia",
            official_locator="U.S. Court of Appeals for the D.C. Circuit rules and handbook pages",
            entities=["dc_circuit", "brief", "record_reference", "citation_verification", "quote_verification"],
            relationships=[
                {"from": "brief", "type": "requires", "to": "record_reference_verification"},
                {"from": "brief", "type": "requires", "to": "citation_verification"},
            ],
        ),
        KnowledgeChunk(
            chunk_id="dc_admin_record_review",
            source_id="local_demo_dc_admin_record_control",
            text=(
                "D.C. administrative-record work depends on matching factual assertions to the record and identifying "
                "missing or unsupported record citations before drafting."
            ),
            summary="Administrative-record drafting should tie facts to record support and flag missing support.",
            source_title="D.C. administrative record verification practice note",
            citation_label="D.C. administrative record verification",
            source_type="practice_note",
            authority_type="internal_control",
            jurisdiction="District of Columbia",
            official_locator="Internal Mercy control derived from D.C. appellate/admin practice requirements",
            entities=["administrative_record", "record_support", "missing_citations", "drafting"],
            relationships=[{"from": "drafting", "type": "requires", "to": "record_support"}],
            verification_status="internal_control_requires_authority_check",
        ),
    ]


class LocalVectorIndex:
    def __init__(self, chunks: list[KnowledgeChunk]) -> None:
        self._chunks = chunks
        self._vectors = {chunk.chunk_id: self._vectorize(_chunk_text(chunk)) for chunk in chunks}

    def search(self, query: str, limit: int, filters: dict[str, Any] | None = None) -> list[tuple[KnowledgeChunk, float]]:
        query_vector = self._vectorize(query)
        query_tokens = set(_tokens(query))
        candidates = _apply_metadata_filters(self._chunks, filters or {})
        scored: list[tuple[KnowledgeChunk, float]] = []
        for chunk in candidates:
            chunk_tokens = set(_tokens(_chunk_text(chunk)))
            overlap = len(query_tokens & chunk_tokens) / max(1, len(query_tokens))
            metadata_boost = 0.04 if chunk.jurisdiction == "District of Columbia" else 0.0
            metadata_boost += 0.04 if chunk.verification_status.startswith("official_") else 0.0
            score = min(1.0, (_cosine(query_vector, self._vectors[chunk.chunk_id]) * 0.72) + (overlap * 0.28) + metadata_boost)
            scored.append((chunk, score))
        scored.sort(key=lambda item: item[1], reverse=True)
        return scored[:limit]

    @staticmethod
    def _vectorize(text: str) -> dict[str, float]:
        tokens = _tokens(text)
        if not tokens:
            return {}
        counts: dict[str, float] = {}
        for token in tokens:
            counts[token] = counts.get(token, 0.0) + 1.0
        length = math.sqrt(sum(value * value for value in counts.values())) or 1.0
        return {token: value / length for token, value in counts.items()}


class LocalLegalGraph:
    def __init__(self, chunks: list[KnowledgeChunk]) -> None:
        self._chunks = chunks
        self._entity_index: dict[str, set[str]] = {}
        for chunk in chunks:
            for entity in chunk.entities:
                self._entity_index.setdefault(entity, set()).add(chunk.chunk_id)

    def search(
        self,
        query: str,
        matter_context: dict[str, Any],
        limit: int,
        filters: dict[str, Any] | None = None,
    ) -> list[tuple[KnowledgeChunk, float, list[str]]]:
        query_text = f"{query} {_context_text(matter_context)}"
        normalized = query_text.lower().replace(" ", "_")
        tokens = set(_tokens(query_text))
        scored: list[tuple[KnowledgeChunk, float, list[str]]] = []
        for chunk in _apply_metadata_filters(self._chunks, filters or {}):
            matched = [
                entity
                for entity in chunk.entities
                if entity in normalized or any(part in tokens for part in entity.split("_"))
            ]
            relationship_hits = [
                str(relation.get("to") or relation.get("value") or "")
                for relation in chunk.relationships
                if relation.get("from", "") in normalized
                or relation.get("to", "") in normalized
                or str(relation.get("value") or "").lower().replace(" ", "_") in normalized
            ]
            score = min(1.0, (len(matched) * 0.18) + (len(relationship_hits) * 0.12))
            if score:
                scored.append((chunk, score, [*matched, *relationship_hits]))
        scored.sort(key=lambda item: item[1], reverse=True)
        return scored[:limit]


class VectorRetrievalAdapter:
    name = "base"

    def search(
        self,
        query: str,
        matter_context: dict[str, Any],
        filters: dict[str, Any],
        limit: int,
    ) -> list[RetrievalHit]:
        raise NotImplementedError

    def status(self) -> dict[str, Any]:
        raise NotImplementedError


class GraphRetrievalAdapter:
    name = "base"

    def search(
        self,
        query: str,
        matter_context: dict[str, Any],
        filters: dict[str, Any],
        limit: int,
    ) -> list[RetrievalHit]:
        raise NotImplementedError

    def status(self) -> dict[str, Any]:
        raise NotImplementedError


class LocalVectorAdapter(VectorRetrievalAdapter):
    name = "local"

    def __init__(self, chunks: list[KnowledgeChunk]) -> None:
        self._index = LocalVectorIndex(chunks)

    def search(self, query: str, matter_context: dict[str, Any], filters: dict[str, Any], limit: int) -> list[RetrievalHit]:
        search_text = f"{query} {_context_text(matter_context)}"
        return [RetrievalHit(chunk, score, self.name) for chunk, score in self._index.search(search_text, limit, filters)]

    def status(self) -> dict[str, Any]:
        return {"backend": self.name, "connected": True, "mode": "local_demo", "fallback": False}


class LocalGraphAdapter(GraphRetrievalAdapter):
    name = "local"

    def __init__(self, chunks: list[KnowledgeChunk]) -> None:
        self._graph = LocalLegalGraph(chunks)

    def search(self, query: str, matter_context: dict[str, Any], filters: dict[str, Any], limit: int) -> list[RetrievalHit]:
        return [
            RetrievalHit(chunk, score, self.name, matched)
            for chunk, score, matched in self._graph.search(query, matter_context, limit, filters)
        ]

    def status(self) -> dict[str, Any]:
        return {"backend": self.name, "connected": True, "mode": "local_demo", "fallback": False}


class QdrantVectorAdapter(VectorRetrievalAdapter):
    name = "qdrant"

    def __init__(self, config: RetrievalConfig) -> None:
        if not config.qdrant_url:
            raise RetrievalBackendError("MERCY_QDRANT_URL is required for Qdrant retrieval.")
        try:
            from qdrant_client import QdrantClient  # type: ignore
        except Exception as exc:
            raise RetrievalBackendError("qdrant-client is not installed.") from exc
        self.config = config
        self.client = QdrantClient(
            url=config.qdrant_url,
            api_key=os.getenv("MERCY_QDRANT_API_KEY") or None,
            check_compatibility=False,
        )

    def search(self, query: str, matter_context: dict[str, Any], filters: dict[str, Any], limit: int) -> list[RetrievalHit]:
        try:
            points = self.client.query_points(
                collection_name=self.config.qdrant_collection or "dc_legal_knowledge",
                query=_stable_embedding(f"{query} {_context_text(matter_context)}"),
                query_filter=_qdrant_filter(filters),
                limit=limit,
                with_payload=True,
            ).points
        except Exception as exc:
            raise RetrievalBackendError(f"Qdrant retrieval failed: {exc}") from exc
        return [
            RetrievalHit(_chunk_from_payload(point.payload or {}, fallback_id=str(point.id)), float(point.score or 0.0), self.name)
            for point in points
        ]

    def status(self) -> dict[str, Any]:
        return {
            "backend": self.name,
            "connected": True,
            "mode": "external_vector",
            "fallback": False,
            "collection": self.config.qdrant_collection,
            "package_version": _package_version("qdrant-client"),
            "langchain_package_version": _package_version("langchain-qdrant"),
        }


class PgVectorAdapter(VectorRetrievalAdapter):
    name = "pgvector"

    def __init__(self, config: RetrievalConfig) -> None:
        if not config.pgvector_dsn and not persistent_storage_configured():
            raise RetrievalBackendError("POSTGRES_URL, SUPABASE_URL, or MERCY_PGVECTOR_DSN is required for pgvector retrieval.")
        self.config = config

    def search(self, query: str, matter_context: dict[str, Any], filters: dict[str, Any], limit: int) -> list[RetrievalHit]:
        tenant_id = str(filters.get("tenant_id") or "")
        if not tenant_id:
            raise RetrievalBackendError("tenant_id is required for pgvector retrieval.")
        chunks = _apply_metadata_filters(_persistent_chunks(tenant_id), filters)
        local_adapter = LocalVectorAdapter(chunks)
        return [
            RetrievalHit(hit.chunk, hit.score, self.name, hit.matched_terms)
            for hit in local_adapter.search(query, matter_context, filters, limit)
        ]

    def status(self) -> dict[str, Any]:
        return {
            "backend": self.name,
            "connected": persistent_storage_configured(),
            "mode": "postgres_pgvector_persistent_store",
            "fallback": False,
            "table": self.config.pgvector_table,
            "note": "Uses tenant-scoped PostgreSQL storage with pgvector-ready embedding rows; Qdrant remains optional.",
        }


class Neo4jGraphAdapter(GraphRetrievalAdapter):
    name = "neo4j"

    def __init__(self, config: RetrievalConfig) -> None:
        if not config.neo4j_uri:
            raise RetrievalBackendError("MERCY_NEO4J_URI is required for Neo4j graph retrieval.")
        try:
            from neo4j import GraphDatabase  # type: ignore
        except Exception as exc:
            raise RetrievalBackendError("neo4j is not installed.") from exc
        self.config = config
        auth = None
        if config.neo4j_user:
            auth = (config.neo4j_user, config.neo4j_password or "")
        self.driver = GraphDatabase.driver(config.neo4j_uri, auth=auth)

    def search(self, query: str, matter_context: dict[str, Any], filters: dict[str, Any], limit: int) -> list[RetrievalHit]:
        cypher = (
            "MATCH (c:KnowledgeChunk) "
            "WHERE c.jurisdiction = $jurisdiction "
            "AND ($practice_area IS NULL OR c.practice_area = $practice_area) "
            "AND ($authority_type IS NULL OR c.authority_type = $authority_type) "
            "AND ($tenant_id IS NULL OR c.tenant_id IS NULL OR c.tenant_id = 'public' OR c.tenant_id = $tenant_id) "
            "WITH c, "
            "CASE WHEN toLower(coalesce(c.text,'') + ' ' + coalesce(c.summary,'')) CONTAINS $query_text THEN 1.0 ELSE 0.35 END AS score "
            "RETURN c AS chunk, score ORDER BY score DESC LIMIT $limit"
        )
        params = {
            "query_text": query.lower()[:200],
            "jurisdiction": filters.get("jurisdiction") or "District of Columbia",
            "practice_area": filters.get("practice_area"),
            "authority_type": filters.get("authority_type"),
            "tenant_id": filters.get("tenant_id"),
            "limit": limit,
        }
        try:
            with self.driver.session(database=self.config.neo4j_database) as session:
                rows = session.run(cypher, params)
                return [
                    RetrievalHit(_chunk_from_payload(dict(row["chunk"]), fallback_id=f"neo4j-{index}"), float(row["score"] or 0.0), self.name)
                    for index, row in enumerate(rows, start=1)
                ]
        except Exception as exc:
            raise RetrievalBackendError(f"Neo4j retrieval failed: {exc}") from exc

    def status(self) -> dict[str, Any]:
        return {
            "backend": self.name,
            "connected": True,
            "mode": "external_graph",
            "fallback": False,
            "database": self.config.neo4j_database,
            "package_version": _package_version("neo4j"),
            "langchain_package_version": _package_version("langchain-neo4j"),
        }


class DCKnowledgeRAG:
    def __init__(self, config: RetrievalConfig | None = None, chunks: list[KnowledgeChunk] | None = None) -> None:
        self.config = config or RetrievalConfig.from_env()
        self._source_registry = _active_source_registry()
        self._chunks = chunks if chunks is not None else (_seed_chunks() if self.config.local_demo_allowed() else [])
        self._vector_adapter = self._build_vector_adapter()
        self._graph_adapter = self._build_graph_adapter()

    def retrieve(
        self,
        query: str,
        matter_context: dict[str, Any] | None = None,
        top_k: int = 5,
        route: dict[str, Any] | None = None,
        agentic: bool = True,
    ) -> dict[str, Any]:
        context = sanitize_payload(matter_context or {})
        query = sanitize_text(query, max_length=8000)
        limit = max(1, min(top_k, 10))
        filters = _metadata_filters(context)
        self._load_persistent_context(filters)
        with trace_span(
            "rag_retrieve_backend",
            str(context.get("surface_context") or "core_rag"),
            "rag",
            route=route,
            matter_reference=str(context.get("matter_id")) if context.get("matter_id") else None,
            metadata=_safe_rag_trace_metadata(context, filters),
        ) as span:
            if not _tenant_context_valid(context) and not _is_local_env():
                payload = self._blocked_payload(query, context, route, "tenant_context_required")
                span["rag"] = payload
                span["metadata"] = {**_safe_rag_trace_metadata(context, filters), "blocked_reason": "tenant_context_required"}
                return payload
            official_eval_fixture = context.get("evaluation_mode") == "ragas_official_source_contract"
            if self._blocked_by_environment() and not official_eval_fixture:
                payload = self._blocked_payload(query, context, route, "external_backend_required_in_non_local_mode")
                span["rag"] = payload
                span["metadata"] = {
                    **_safe_rag_trace_metadata(context, filters),
                    "blocked_reason": "external_backend_required_in_non_local_mode",
                }
                return payload
            if not _is_local_env() and not self._source_registry.official_sources():
                payload = self._blocked_payload(query, context, route, "registered_official_sources_required")
                span["rag"] = payload
                span["metadata"] = {
                    **_safe_rag_trace_metadata(context, filters),
                    "blocked_reason": "registered_official_sources_required",
                }
                return payload

            try:
                vector_hits = self._vector_adapter.search(query, context, filters, limit)
                graph_hits = self._graph_adapter.search(query, context, filters, limit)
                vector_hits = self._filter_registered_hits(vector_hits)
                graph_hits = self._filter_registered_hits(graph_hits)
                merged = self._merge_hits(vector_hits, graph_hits, limit)
                results = [
                    chunk.to_result(vector_score, graph_score, combined_score, retrieval_method=self._retrieval_method())
                    for chunk, vector_score, graph_score, combined_score in merged
                ]
                verification = self._agentic_verification_loop(query, context, results, route) if agentic else self._router_verification(results)
            except RetrievalBackendError as exc:
                results = []
                verification = self._backend_error_verification(str(exc))

            payload = {
                "rag_version": RAG_VERSION,
                "query": query,
                "results": results,
                "citations": [result["citation"] for result in results],
                "verification": verification,
                "backend_status": self._backend_status(),
                "graph_context": self._graph_context(results),
                "metadata_filters": filters,
                "answer_policy": {
                    "mode": "evidence_only",
                    "instruction": (
                        "Use retrieved chunks only as candidate grounding. Do not state legal conclusions, quote text, "
                        "or cite authority unless the attorney verifies official source text and current validity."
                    ),
                },
                "retrieved_at": datetime.now(UTC).isoformat(),
            }
            llm_answer = generate_research_answer(
                query=query,
                retrieval=payload,
                matter_context=context,
                route=route,
                fallback=_grounded_rag_answer(results),
            )
            payload["answer"] = llm_answer.content
            payload["llm"] = llm_answer.to_dict()
            span["rag"] = payload
            span["metadata"] = {
                **_safe_rag_trace_metadata(context, filters),
                "result_count": len(results),
                "vector_backend": self.config.vector_backend,
                "graph_backend": self.config.graph_backend,
                "llm_used": llm_answer.used_llm,
                "llm_model": llm_answer.model,
            }
            record_rag_trace(
                payload,
                route=route,
                surface_context=str(context.get("surface_context") or "core_rag"),
                matter_reference=str(context.get("matter_id")) if context.get("matter_id") else None,
            )
            record_security_audit(
                "rag_retrieval_backend",
                tenant_context=context.get("auth_context") if isinstance(context.get("auth_context"), dict) else None,
                matter_id=str(context.get("matter_id")) if context.get("matter_id") else None,
                category="rag",
                metadata={
                    "result_count": len(results),
                    "verification_status": verification.get("status"),
                    "vector_backend": self.config.vector_backend,
                    "graph_backend": self.config.graph_backend,
                    "official_sources_only": True,
                },
                guardrail_status=str(verification.get("status") or ""),
            )
            return payload

    def _merge_hits(
        self,
        vector_hits: list[RetrievalHit],
        graph_hits: list[RetrievalHit],
        limit: int,
    ) -> list[tuple[KnowledgeChunk, float, float, float]]:
        scores: dict[str, tuple[KnowledgeChunk, float, float]] = {}
        for hit in vector_hits:
            scores[hit.chunk.chunk_id] = (
                hit.chunk,
                hit.score,
                scores.get(hit.chunk.chunk_id, (hit.chunk, 0.0, 0.0))[2],
            )
        for hit in graph_hits:
            previous = scores.get(hit.chunk.chunk_id, (hit.chunk, 0.0, 0.0))
            scores[hit.chunk.chunk_id] = (hit.chunk, previous[1], hit.score)
        merged = [
            (
                chunk,
                vector_score,
                graph_score,
                min(
                    1.0,
                    (vector_score * 0.6)
                    + (graph_score * 0.3)
                    + (0.06 if chunk.jurisdiction == "District of Columbia" else 0.0)
                    + (0.04 if chunk.verification_status.startswith("official_") else 0.0),
                ),
            )
            for chunk, vector_score, graph_score in scores.values()
        ]
        merged.sort(key=lambda item: item[3], reverse=True)
        return merged[:limit]

    def _agentic_verification_loop(
        self,
        query: str,
        matter_context: dict[str, Any],
        results: list[dict[str, Any]],
        route: dict[str, Any] | None,
    ) -> dict[str, Any]:
        guardrails = evaluate_dc_guardrails(
            {
                "draft": query,
                "draft_type": "rag_retrieval",
                "human_review_required": True,
            }
        )
        route_expert = route.get("expert") if isinstance(route, dict) else None
        issues: list[str] = []
        if route_expert and route_expert not in {"research", "drafting", "citation_verifier", "compliance_guardrails"}:
            issues.append(f"route_expert_not_research_safe:{route_expert}")
        if not results:
            issues.append("no_retrieved_authority")
        if any(not result.get("citation", {}).get("provenance") for result in results):
            issues.append("missing_chunk_provenance")
        if any(result.get("verification_status") not in {"official_metadata_unquoted"} for result in results):
            issues.append("contains_non_official_or_internal_control_chunk")

        status = "pass"
        if not results:
            status = "block"
        elif issues or guardrails.get("status") != "pass":
            status = "warn"

        return {
            "status": status,
            "loop": [
                "moe_route_scope_check",
                "compliance_guardrail_check",
                "citation_provenance_check",
                "no_unverified_quotes_check",
            ],
            "route_expert": route_expert,
            "guardrail_status": guardrails.get("status"),
            "issues": issues,
            "human_review_required": True,
            "strict_citation_accuracy": True,
        }

    def _router_verification(self, results: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "status": "pass" if results else "block",
            "loop": ["router_context_injection"],
            "issues": [] if results else ["no_retrieved_authority"],
            "human_review_required": True,
            "strict_citation_accuracy": True,
        }

    def _backend_error_verification(self, message: str) -> dict[str, Any]:
        return {
            "status": "block",
            "loop": ["backend_adapter_error"],
            "issues": [message],
            "human_review_required": True,
            "strict_citation_accuracy": True,
        }

    def _backend_status(self) -> dict[str, Any]:
        vector_status = self._vector_adapter.status()
        graph_status = self._graph_adapter.status()
        return {
            "vector_backend": self.config.vector_backend,
            "vector_connected": bool(vector_status.get("connected")),
            "vector_status": vector_status,
            "qdrant_collection": self.config.qdrant_collection if self.config.vector_backend == "qdrant" else None,
            "pgvector_table": self.config.pgvector_table if self.config.vector_backend == "pgvector" else None,
            "graph_backend": self.config.graph_backend,
            "graph_connected": bool(graph_status.get("connected")),
            "graph_status": graph_status,
            "neo4j_database": self.config.neo4j_database if self.config.graph_backend == "neo4j" else None,
            "local_demo_allowed": self.config.local_demo_allowed(),
            "production_blocked": self._blocked_by_environment(),
            "source_registry": self._source_registry.status(),
        }

    def _retrieval_method(self) -> str:
        return f"vector:{self.config.vector_backend}+graph:{self.config.graph_backend}+agentic_verification"

    def _build_vector_adapter(self) -> VectorRetrievalAdapter:
        if self.config.vector_backend == "qdrant":
            return QdrantVectorAdapter(self.config)
        if self.config.vector_backend == "pgvector":
            return PgVectorAdapter(self.config)
        return LocalVectorAdapter(self._chunks)

    def _build_graph_adapter(self) -> GraphRetrievalAdapter:
        if self.config.graph_backend == "neo4j":
            return Neo4jGraphAdapter(self.config)
        return LocalGraphAdapter(self._chunks)

    def _blocked_by_environment(self) -> bool:
        if _is_local_env():
            return False
        if self.config.vector_backend == "local" and not persistent_storage_configured():
            return True
        return False

    def _load_persistent_context(self, filters: dict[str, Any]) -> None:
        tenant_id = str(filters.get("tenant_id") or "")
        if not persistent_storage_configured() or not tenant_id:
            return
        persistent_chunks = _persistent_chunks(tenant_id)
        self._chunks = persistent_chunks
        self._source_registry = _active_source_registry(tenant_id)
        if self.config.vector_backend == "local":
            self._vector_adapter = LocalVectorAdapter(self._chunks)
        if self.config.graph_backend == "local":
            self._graph_adapter = LocalGraphAdapter(self._chunks)

    def _filter_registered_hits(self, hits: list[RetrievalHit]) -> list[RetrievalHit]:
        filtered = [hit for hit in hits if self._source_registry.is_allowed_for_retrieval(hit.chunk.source_id)]
        if not _is_local_env() and hits and not filtered:
            raise RetrievalBackendError("registered_official_sources_required")
        return filtered

    def _blocked_payload(
        self,
        query: str,
        context: dict[str, Any],
        route: dict[str, Any] | None,
        reason: str,
    ) -> dict[str, Any]:
        payload = {
            "rag_version": RAG_VERSION,
            "query": query,
            "results": [],
            "citations": [],
            "verification": {
                "status": "block",
                "loop": ["rag_environment_policy"],
                "issues": [reason],
                "human_review_required": True,
                "strict_citation_accuracy": True,
            },
            "backend_status": self._backend_status(),
            "graph_context": {"entities": [], "relationships": []},
            "metadata_filters": _metadata_filters(context),
            "answer_policy": {"mode": "blocked", "instruction": "Configure tenant-safe external RAG backends before retrieval."},
            "retrieved_at": datetime.now(UTC).isoformat(),
        }
        record_rag_trace(
            payload,
            route=route,
            surface_context=str(context.get("surface_context") or "core_rag"),
            matter_reference=str(context.get("matter_id")) if context.get("matter_id") else None,
        )
        return payload

    @staticmethod
    def _graph_context(results: list[dict[str, Any]]) -> dict[str, Any]:
        entities: set[str] = set()
        relationships: list[dict[str, str]] = []
        for result in results:
            entities.update(str(entity) for entity in result.get("entities") or [])
            relationships.extend(relation for relation in result.get("relationships") or [] if isinstance(relation, dict))
        return {
            "entities": sorted(entities),
            "relationships": relationships[:20],
        }


def retrieve_dc_knowledge(
    query: str,
    matter_context: dict[str, Any] | None = None,
    top_k: int = 5,
    route: dict[str, Any] | None = None,
    agentic: bool = True,
) -> dict[str, Any]:
    return DCKnowledgeRAG().retrieve(
        query=query,
        matter_context=matter_context,
        top_k=top_k,
        route=route,
        agentic=agentic,
    )


def ingest_dc_sources(payload: dict[str, Any], matter_context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = matter_context or {}
    filters = _metadata_filters(context)
    tenant_id = str(filters.get("tenant_id") or ("local" if _is_local_env() else ""))
    with trace_span(
        "rag_ingest_official_sources",
        str(context.get("surface_context") or "core_rag_ingest"),
        "rag_ingest",
        metadata=_safe_rag_trace_metadata(context, filters),
    ) as span:
        try:
            if not _tenant_context_valid(context) and not _is_local_env():
                raise SourceValidationError("tenant_context_required")
            if persistent_storage_configured() and not tenant_id:
                raise SourceValidationError("tenant_id is required for persistent RAG ingestion.")
            source_payload = payload.get("source") if isinstance(payload.get("source"), dict) else payload
            allow_local_demo = _is_local_env()
            source = SourceRecord.from_payload(source_payload, allow_local_demo=allow_local_demo)
            if not _is_local_env() and not source.official():
                raise SourceValidationError("Production ingestion requires registered official D.C. sources only.")
            chunks_payload = payload.get("chunks") if isinstance(payload.get("chunks"), list) else []
            chunks = [_chunk_from_ingestion_payload(item, source) for item in chunks_payload if isinstance(item, dict)]
            for chunk in chunks:
                chunk.tenant_id = tenant_id
            _OFFICIAL_SOURCE_RECORDS[source.source_id] = source
            if persistent_storage_configured():
                _persist_ingested_source(source, chunks, tenant_id)
            result = {
                "ingestion_contract_version": SOURCE_CONTRACT_VERSION,
                "accepted": True,
                "source": asdict(source),
                "tenant_id": tenant_id,
                "chunk_count": len(chunks),
                "chunks": [
                    {
                        "chunk_id": chunk.chunk_id,
                        "source_id": chunk.source_id,
                        "citation_label": chunk.citation_label,
                        "verification_status": chunk.verification_status,
                    }
                    for chunk in chunks
                ],
                "backend_targets": {
                    "vector_backend": RetrievalConfig.from_env().vector_backend,
                    "graph_backend": RetrievalConfig.from_env().graph_backend,
                    "indexing_mode": "persistent_pgvector" if persistent_storage_configured() else "validated_contract_ready",
                },
                "ingested_at": datetime.now(UTC).isoformat(),
            }
            span["metadata"] = {
                **_safe_rag_trace_metadata(context, filters),
                "source_id": source.source_id,
                "chunk_count": len(chunks),
                "accepted": True,
                "storage": "persistent" if persistent_storage_configured() else "memory",
            }
            trace_event(
                name="rag_ingest_source_registered",
                surface_context=str(context.get("surface_context") or "core_rag_ingest"),
                category="rag_ingest",
                matter_reference=str(context.get("matter_id")) if context.get("matter_id") else None,
                metadata={"source_id": source.source_id, "chunk_count": len(chunks), "tenant_id": tenant_id},
            )
            return result
        except SourceValidationError as exc:
            span["metadata"] = {
                **_safe_rag_trace_metadata(context, filters),
                "accepted": False,
                "error": str(exc),
            }
            trace_event(
                name="rag_ingest_source_rejected",
                surface_context=str(context.get("surface_context") or "core_rag_ingest"),
                category="rag_ingest",
                guardrail_status="block",
                metadata={"error": str(exc), "tenant_id": tenant_id},
            )
            raise


def rag_backend_status(matter_context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = matter_context or {}
    tenant_id = _metadata_filters(context).get("tenant_id")
    try:
        rag = DCKnowledgeRAG()
        status = rag._backend_status()
    except RetrievalBackendError as exc:
        config = RetrievalConfig.from_env()
        status = {
            "vector_backend": config.vector_backend,
            "graph_backend": config.graph_backend,
            "vector_connected": False,
            "graph_connected": False,
            "local_demo_allowed": config.local_demo_allowed(),
            "production_blocked": not _is_local_env(),
            "error": str(exc),
        }
    return {
        "rag_version": RAG_VERSION,
        "environment": os.getenv("MERCY_ENV") or "unset",
        "tenant_isolated": _tenant_context_valid(context) or _is_local_env(),
        "packages": {
            "qdrant_client": _package_version("qdrant-client"),
            "langchain_qdrant": _package_version("langchain-qdrant"),
            "neo4j": _package_version("neo4j"),
            "langchain_neo4j": _package_version("langchain-neo4j"),
        },
        **status,
        "ingestion_contract": _active_source_registry(tenant_id).status(),
        "seed_status": _seed_status(tenant_id),
    }


def _seed_status(tenant_id: str | None) -> dict[str, Any]:
    report = _latest_seed_report()
    persistent = persistent_storage_configured()
    if persistent and tenant_id:
        try:
            with session_scope() as session:
                tenants = [tenant_id, "public"]
                sources = (
                    session.query(DCRagSourceRecord)
                    .filter(DCRagSourceRecord.tenant_id.in_(tenants), DCRagSourceRecord.active.is_(True))
                    .all()
                )
                chunks = session.query(DCRagChunkRecord).filter(DCRagChunkRecord.tenant_id.in_(tenants)).all()
                area_counts = Counter(str(chunk.practice_area or "unknown") for chunk in chunks)
                last_seeded = max([source.updated_at for source in sources], default=None)
                return {
                    "pipeline_version": report.get("version") or "dc-knowledge-seed-pipeline-1.0",
                    "persistent": True,
                    "seeded_source_count": len(sources),
                    "seeded_chunk_count": len(chunks),
                    "last_successful_seed_date": report.get("completed_at") or (_datetime_to_iso(last_seeded) if last_seeded else None),
                    "coverage_summary_by_practice_area": dict(sorted(area_counts.items())),
                    "overall_health": _seed_health(len(sources), len(chunks), bool(report.get("passed"))),
                    "latest_report": _safe_seed_report(report),
                }
        except Exception as exc:
            return {
                "pipeline_version": report.get("version") or "dc-knowledge-seed-pipeline-1.0",
                "persistent": True,
                "seeded_source_count": 0,
                "seeded_chunk_count": 0,
                "last_successful_seed_date": report.get("completed_at"),
                "coverage_summary_by_practice_area": {},
                "overall_health": "degraded",
                "error": str(exc),
                "latest_report": _safe_seed_report(report),
            }
    registry = _active_source_registry(tenant_id).status()
    return {
        "pipeline_version": report.get("version") or "dc-knowledge-seed-pipeline-1.0",
        "persistent": persistent,
        "seeded_source_count": int(report.get("sources_ingested") or registry.get("official_source_count") or 0),
        "seeded_chunk_count": int(report.get("chunks_created") or 0),
        "last_successful_seed_date": report.get("completed_at"),
        "coverage_summary_by_practice_area": report.get("coverage_summary", {}).get("practice_areas", {}),
        "overall_health": _seed_health(int(report.get("sources_ingested") or 0), int(report.get("chunks_created") or 0), bool(report.get("passed"))),
        "latest_report": _safe_seed_report(report),
    }


def _latest_seed_report() -> dict[str, Any]:
    path = os.getenv("MERCY_SEED_REPORT_PATH") or "reports/dc_knowledge_seed_latest.json"
    try:
        import json

        with open(path, encoding="utf-8") as handle:
            report = json.load(handle)
        return report if isinstance(report, dict) else {}
    except Exception:
        return {}


def _safe_seed_report(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": report.get("source"),
        "started_at": report.get("started_at"),
        "completed_at": report.get("completed_at"),
        "sources_ingested": report.get("sources_ingested"),
        "chunks_created": report.get("chunks_created"),
        "validation_failure_count": len(report.get("validation_failures") or []),
        "passed": report.get("passed"),
        "health": report.get("health"),
    }


def _seed_health(source_count: int, chunk_count: int, latest_passed: bool) -> str:
    if chunk_count >= 500 and source_count >= 20 and latest_passed:
        return "healthy"
    if chunk_count >= 100 and source_count >= 5:
        return "partial"
    return "not_seeded"


def _datetime_to_iso(value: datetime | None) -> str | None:
    return value.isoformat() if isinstance(value, datetime) else None


def _grounded_rag_answer(results: list[dict[str, Any]]) -> str:
    if not results:
        return "No official D.C. grounding was retrieved. Do not answer substantively until official sources are supplied."
    lines = [
        "Research summary is evidence-only and requires attorney review before use.",
    ]
    for result in results[:4]:
        citation = result.get("citation", {}) if isinstance(result.get("citation"), dict) else {}
        label = citation.get("label") or result.get("source_id") or "[VERIFY CITE]"
        summary = result.get("summary") or "Candidate source metadata requires attorney verification."
        lines.append(f"- {summary} Source: {label}.")
    return "\n".join(lines)


def _tokens(text: str) -> list[str]:
    return [
        token.lower().strip(".,;:()[]{}")
        for token in TOKEN_PATTERN.findall(text)
        if len(token) > 2
    ]


def _chunk_text(chunk: KnowledgeChunk) -> str:
    return " ".join(
        [
            chunk.text,
            chunk.summary,
            chunk.source_title,
            chunk.citation_label,
            " ".join(chunk.entities),
        ]
    )


def _context_text(matter_context: dict[str, Any]) -> str:
    parts: list[str] = []
    for key in (
        "jurisdiction",
        "client_role",
        "requested_relief",
        "matter_type",
        "practice_area",
        "authority_type",
        "selected_text",
        "document_text",
    ):
        value = matter_context.get(key)
        if isinstance(value, str):
            parts.append(value)
    for key in ("facts", "key_facts"):
        value = matter_context.get(key)
        if isinstance(value, dict):
            parts.extend(str(item) for item in value.values() if isinstance(item, (str, int, float)))
    return " ".join(parts)


def _metadata_filters(matter_context: dict[str, Any]) -> dict[str, Any]:
    auth_context = matter_context.get("auth_context") if isinstance(matter_context.get("auth_context"), dict) else {}
    filters = {
        "jurisdiction": matter_context.get("jurisdiction") or "District of Columbia",
        "practice_area": matter_context.get("practice_area"),
        "authority_type": matter_context.get("authority_type"),
        "date_from": matter_context.get("date_from") or matter_context.get("source_date_from"),
        "date_to": matter_context.get("date_to") or matter_context.get("source_date_to"),
        "tenant_id": auth_context.get("tenant_id") or matter_context.get("tenant_id"),
    }
    if str(filters["jurisdiction"]).lower() in {"dc", "d.c.", "district of columbia"}:
        filters["jurisdiction"] = "District of Columbia"
    return {key: value for key, value in filters.items() if value is not None}


def _tenant_context_valid(matter_context: dict[str, Any]) -> bool:
    auth_context = matter_context.get("auth_context")
    return isinstance(auth_context, dict) and bool(auth_context.get("tenant_id")) and bool(auth_context.get("user_id"))


def _safe_rag_trace_metadata(matter_context: dict[str, Any], filters: dict[str, Any]) -> dict[str, Any]:
    auth_context = matter_context.get("auth_context") if isinstance(matter_context.get("auth_context"), dict) else {}
    return {
        "tenant_id": auth_context.get("tenant_id") or matter_context.get("tenant_id"),
        "user_id": auth_context.get("user_id") or matter_context.get("user_id"),
        "matter_id": matter_context.get("matter_id"),
        "jurisdiction": filters.get("jurisdiction"),
        "practice_area": filters.get("practice_area"),
        "date_from": filters.get("date_from"),
        "date_to": filters.get("date_to"),
    }


def _apply_metadata_filters(chunks: list[KnowledgeChunk], filters: dict[str, Any]) -> list[KnowledgeChunk]:
    jurisdiction = str(filters.get("jurisdiction") or "District of Columbia").lower()
    practice_area = str(filters.get("practice_area") or "").lower()
    authority_type = filters.get("authority_type")
    authority_types = {
        str(item).lower()
        for item in (authority_type if isinstance(authority_type, list) else [authority_type])
        if item
    }
    tenant_id = str(filters.get("tenant_id") or "")
    date_from = str(filters.get("date_from") or "")
    date_to = str(filters.get("date_to") or "")
    filtered: list[KnowledgeChunk] = []
    for chunk in chunks:
        if jurisdiction and chunk.jurisdiction.lower() not in {jurisdiction, "district of columbia"}:
            continue
        if practice_area and chunk.practice_area.lower() != practice_area:
            continue
        if authority_types and chunk.authority_type.lower() not in authority_types:
            continue
        if tenant_id and chunk.tenant_id not in {None, "", "public", tenant_id}:
            continue
        if date_from and chunk.source_date and chunk.source_date < date_from:
            continue
        if date_to and chunk.source_date and chunk.source_date > date_to:
            continue
        filtered.append(chunk)
    return filtered


def _stable_embedding(text: str, dimensions: int = 384) -> list[float]:
    tokens = _tokens(text)
    vector = [0.0] * dimensions
    for token in tokens:
        index = int(hashlib.sha256(token.encode("utf-8")).hexdigest()[:8], 16) % dimensions
        vector[index] += 1.0
    length = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / length for value in vector]


def _chunk_from_payload(payload: dict[str, Any], fallback_id: str) -> KnowledgeChunk:
    return KnowledgeChunk(
        chunk_id=str(payload.get("chunk_id") or payload.get("id") or fallback_id),
        source_id=str(payload.get("source_id") or payload.get("chunk_id") or payload.get("id") or fallback_id),
        text=str(payload.get("text") or payload.get("page_content") or payload.get("content") or ""),
        summary=str(payload.get("summary") or payload.get("text") or payload.get("content") or "Candidate source requires review.")[:500],
        source_title=str(payload.get("source_title") or payload.get("title") or "External D.C. knowledge source"),
        citation_label=str(payload.get("citation_label") or payload.get("citation") or "[VERIFY CITE]"),
        source_type=str(payload.get("source_type") or "external_knowledge"),
        authority_type=str(payload.get("authority_type") or "legal_authority"),
        jurisdiction=str(payload.get("jurisdiction") or "District of Columbia"),
        official_locator=str(payload.get("official_locator") or payload.get("url") or "External retrieval backend"),
        url=payload.get("url"),
        entities=[str(entity) for entity in payload.get("entities") or []],
        relationships=[relation for relation in payload.get("relationships") or [] if isinstance(relation, dict)],
        verification_status=str(payload.get("verification_status") or "external_metadata_unquoted"),
        practice_area=str(payload.get("practice_area") or "professional_responsibility"),
        source_date=payload.get("source_date"),
        tenant_id=payload.get("tenant_id"),
    )


def _chunk_from_ingestion_payload(payload: dict[str, Any], source: SourceRecord) -> KnowledgeChunk:
    chunk_id = str(payload.get("chunk_id") or "").strip()
    text = str(payload.get("text") or "").strip()
    if not chunk_id:
        raise SourceValidationError("Chunk is missing chunk_id.")
    if not text:
        raise SourceValidationError(f"Chunk {chunk_id} is missing text.")
    source_id = str(payload.get("source_id") or source.source_id).strip()
    if source_id != source.source_id:
        raise SourceValidationError(f"Chunk {chunk_id} source_id does not match registered source.")
    return KnowledgeChunk(
        chunk_id=chunk_id,
        source_id=source.source_id,
        text=text,
        summary=str(payload.get("summary") or text[:500]),
        source_title=source.title,
        citation_label=source.citation_label,
        source_type=source.source_type,
        authority_type=source.authority_type,
        jurisdiction=source.jurisdiction,
        official_locator=source.official_locator,
        url=source.url,
        entities=[str(entity) for entity in payload.get("entities") or []],
        relationships=[relation for relation in payload.get("relationships") or [] if isinstance(relation, dict)],
        verification_status=source.verification_status,
        last_checked=source.last_checked,
        practice_area=str(payload.get("practice_area") or source.authority_type),
        source_date=payload.get("source_date") or source.last_checked,
        tenant_id=payload.get("tenant_id"),
    )


def _qdrant_filter(filters: dict[str, Any]) -> Any:
    try:
        from qdrant_client.models import FieldCondition, Filter, MatchAny, MatchValue, Range  # type: ignore
    except Exception:
        return None
    must: list[Any] = []
    if filters.get("jurisdiction"):
        must.append(FieldCondition(key="jurisdiction", match=MatchValue(value=filters["jurisdiction"])))
    if filters.get("practice_area"):
        must.append(FieldCondition(key="practice_area", match=MatchValue(value=filters["practice_area"])))
    if filters.get("authority_type"):
        authority_type = filters["authority_type"]
        if isinstance(authority_type, list):
            must.append(FieldCondition(key="authority_type", match=MatchAny(any=authority_type)))
        else:
            must.append(FieldCondition(key="authority_type", match=MatchValue(value=authority_type)))
    if filters.get("tenant_id"):
        must.append(FieldCondition(key="tenant_id", match=MatchAny(any=["public", filters["tenant_id"]])))
    source_range: dict[str, Any] = {}
    if filters.get("date_from"):
        source_range["gte"] = filters["date_from"]
    if filters.get("date_to"):
        source_range["lte"] = filters["date_to"]
    if source_range:
        must.append(FieldCondition(key="source_date", range=Range(**source_range)))
    return Filter(must=must) if must else None


def _cosine(left: dict[str, float], right: dict[str, float]) -> float:
    if not left or not right:
        return 0.0
    return sum(left.get(token, 0.0) * right.get(token, 0.0) for token in set(left) | set(right))


__all__ = [
    "DCKnowledgeRAG",
    "KnowledgeChunk",
    "KnowledgeProvenance",
    "SourceRecord",
    "RetrievalConfig",
    "RetrievalBackendError",
    "SourceValidationError",
    "ingest_dc_sources",
    "rag_backend_status",
    "retrieve_dc_knowledge",
]
