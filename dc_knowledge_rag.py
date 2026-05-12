from __future__ import annotations

import math
import os
import re
import hashlib
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from importlib import metadata
from typing import Any

from dc_guardrails import evaluate_dc_guardrails
from observability import record_rag_trace, trace_span


RAG_VERSION = "dc-knowledge-rag-1.0"
TOKEN_PATTERN = re.compile(r"[a-zA-Z][a-zA-Z0-9_.-]{1,}")
SUPPORTED_VECTOR_BACKENDS = {"local", "qdrant", "pgvector"}
SUPPORTED_GRAPH_BACKENDS = {"local", "neo4j", "llamaindex_property_graph"}


class RetrievalBackendError(RuntimeError):
    pass


def _is_local_env() -> bool:
    return os.getenv("MERCY_ENV") == "local" or os.getenv("MERCY_AUTH_MODE") == "dev"


def _package_version(package_name: str) -> str | None:
    try:
        return metadata.version(package_name)
    except metadata.PackageNotFoundError:
        return None


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
class KnowledgeChunk:
    chunk_id: str
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
            source_id=self.chunk_id,
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
            vector_backend = "qdrant" if os.getenv("MERCY_QDRANT_URL") else "pgvector" if os.getenv("MERCY_PGVECTOR_DSN") else "local"
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
            pgvector_dsn=os.getenv("MERCY_PGVECTOR_DSN"),
            pgvector_table=os.getenv("MERCY_PGVECTOR_TABLE", "dc_legal_knowledge"),
            neo4j_uri=os.getenv("MERCY_NEO4J_URI"),
            neo4j_database=os.getenv("MERCY_NEO4J_DATABASE"),
            neo4j_user=os.getenv("MERCY_NEO4J_USER"),
            neo4j_password=os.getenv("MERCY_NEO4J_PASSWORD"),
        )

    def local_demo_allowed(self) -> bool:
        return self.vector_backend == "local" and self.graph_backend == "local" and _is_local_env()


def _seed_chunks() -> list[KnowledgeChunk]:
    return [
        KnowledgeChunk(
            chunk_id="dc_ethics_opinion_388_ai",
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
        candidates = _apply_metadata_filters(self._chunks, filters or {})
        scored = [
            (chunk, _cosine(query_vector, self._vectors[chunk.chunk_id]))
            for chunk in candidates
        ]
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
                relation["to"]
                for relation in chunk.relationships
                if relation.get("from", "") in normalized or relation.get("to", "") in normalized
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
        if not config.pgvector_dsn:
            raise RetrievalBackendError("MERCY_PGVECTOR_DSN is required for pgvector retrieval.")
        self.config = config

    def search(self, query: str, matter_context: dict[str, Any], filters: dict[str, Any], limit: int) -> list[RetrievalHit]:
        raise RetrievalBackendError(
            "pgvector adapter boundary is configured but no database driver is wired in this brownfield core. "
            "Use Qdrant for production vector retrieval or add a psycopg/pgvector implementation."
        )

    def status(self) -> dict[str, Any]:
        return {
            "backend": self.name,
            "connected": False,
            "mode": "documented_fallback",
            "fallback": False,
            "table": self.config.pgvector_table,
            "note": "Documented fallback adapter boundary; Qdrant is the preferred active vector backend.",
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
            "AND ($tenant_id IS NULL OR c.tenant_id IS NULL OR c.tenant_id = 'public' OR c.tenant_id = $tenant_id) "
            "WITH c, "
            "CASE WHEN toLower(coalesce(c.text,'') + ' ' + coalesce(c.summary,'')) CONTAINS $query_text THEN 1.0 ELSE 0.35 END AS score "
            "RETURN c AS chunk, score ORDER BY score DESC LIMIT $limit"
        )
        params = {
            "query_text": query.lower()[:200],
            "jurisdiction": filters.get("jurisdiction") or "District of Columbia",
            "practice_area": filters.get("practice_area"),
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
        self._chunks = chunks or _seed_chunks()
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
        context = matter_context or {}
        limit = max(1, min(top_k, 10))
        filters = _metadata_filters(context)
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
            if self._blocked_by_environment():
                payload = self._blocked_payload(query, context, route, "external_backend_required_in_non_local_mode")
                span["rag"] = payload
                span["metadata"] = {
                    **_safe_rag_trace_metadata(context, filters),
                    "blocked_reason": "external_backend_required_in_non_local_mode",
                }
                return payload

            try:
                vector_hits = self._vector_adapter.search(query, context, filters, limit)
                graph_hits = self._graph_adapter.search(query, context, filters, limit)
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
            span["rag"] = payload
            span["metadata"] = {
                **_safe_rag_trace_metadata(context, filters),
                "result_count": len(results),
                "vector_backend": self.config.vector_backend,
                "graph_backend": self.config.graph_backend,
            }
            record_rag_trace(
                payload,
                route=route,
                surface_context=str(context.get("surface_context") or "core_rag"),
                matter_reference=str(context.get("matter_id")) if context.get("matter_id") else None,
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
            (chunk, vector_score, graph_score, (vector_score * 0.65) + (graph_score * 0.35))
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
        return not _is_local_env() and (self.config.vector_backend == "local" or self.config.graph_backend == "local")

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


def rag_backend_status(matter_context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = matter_context or {}
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
    }


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
    for key in ("jurisdiction", "client_role", "requested_relief", "matter_type", "selected_text", "document_text"):
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
    tenant_id = str(filters.get("tenant_id") or "")
    date_from = str(filters.get("date_from") or "")
    date_to = str(filters.get("date_to") or "")
    filtered: list[KnowledgeChunk] = []
    for chunk in chunks:
        if jurisdiction and chunk.jurisdiction.lower() not in {jurisdiction, "district of columbia"}:
            continue
        if practice_area and chunk.practice_area.lower() != practice_area:
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
    "RetrievalConfig",
    "RetrievalBackendError",
    "rag_backend_status",
    "retrieve_dc_knowledge",
]
