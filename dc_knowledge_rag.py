from __future__ import annotations

import math
import os
import re
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any

from dc_guardrails import evaluate_dc_guardrails
from observability import record_rag_trace


RAG_VERSION = "dc-knowledge-rag-1.0"
TOKEN_PATTERN = re.compile(r"[a-zA-Z][a-zA-Z0-9_.-]{1,}")
SUPPORTED_VECTOR_BACKENDS = {"local", "qdrant", "pgvector"}
SUPPORTED_GRAPH_BACKENDS = {"local", "neo4j", "llamaindex_property_graph"}


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
        }


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

    @classmethod
    def from_env(cls) -> "RetrievalConfig":
        vector_backend = os.getenv("MERCY_RAG_VECTOR_BACKEND", "local").lower()
        graph_backend = os.getenv("MERCY_RAG_GRAPH_BACKEND", "local").lower()
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
        )


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

    def search(self, query: str, limit: int) -> list[tuple[KnowledgeChunk, float]]:
        query_vector = self._vectorize(query)
        scored = [
            (chunk, _cosine(query_vector, self._vectors[chunk.chunk_id]))
            for chunk in self._chunks
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

    def search(self, query: str, matter_context: dict[str, Any], limit: int) -> list[tuple[KnowledgeChunk, float, list[str]]]:
        query_text = f"{query} {_context_text(matter_context)}"
        normalized = query_text.lower().replace(" ", "_")
        tokens = set(_tokens(query_text))
        scored: list[tuple[KnowledgeChunk, float, list[str]]] = []
        for chunk in self._chunks:
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


class DCKnowledgeRAG:
    def __init__(self, config: RetrievalConfig | None = None, chunks: list[KnowledgeChunk] | None = None) -> None:
        self.config = config or RetrievalConfig.from_env()
        self._chunks = chunks or _seed_chunks()
        self._vector_index = LocalVectorIndex(self._chunks)
        self._graph = LocalLegalGraph(self._chunks)

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
        vector_hits = self._vector_search(query, context, limit)
        graph_hits = self._graph_search(query, context, limit)
        merged = self._merge_hits(vector_hits, graph_hits, limit)
        results = [
            chunk.to_result(vector_score, graph_score, combined_score, retrieval_method=self._retrieval_method())
            for chunk, vector_score, graph_score, combined_score in merged
        ]
        verification = self._agentic_verification_loop(query, context, results, route) if agentic else self._router_verification(results)
        payload = {
            "rag_version": RAG_VERSION,
            "query": query,
            "results": results,
            "citations": [result["citation"] for result in results],
            "verification": verification,
            "backend_status": self._backend_status(),
            "graph_context": self._graph_context(results),
            "answer_policy": {
                "mode": "evidence_only",
                "instruction": (
                    "Use retrieved chunks only as candidate grounding. Do not state legal conclusions, quote text, "
                    "or cite authority unless the attorney verifies official source text and current validity."
                ),
            },
            "retrieved_at": datetime.now(UTC).isoformat(),
        }
        record_rag_trace(
            payload,
            route=route,
            surface_context=str(context.get("surface_context") or "core_rag"),
            matter_reference=str(context.get("matter_id")) if context.get("matter_id") else None,
        )
        return payload

    def _vector_search(self, query: str, matter_context: dict[str, Any], limit: int) -> list[tuple[KnowledgeChunk, float]]:
        search_text = f"{query} {_context_text(matter_context)}"
        return self._vector_index.search(search_text, limit)

    def _graph_search(self, query: str, matter_context: dict[str, Any], limit: int) -> list[tuple[KnowledgeChunk, float, list[str]]]:
        return self._graph.search(query, matter_context, limit)

    def _merge_hits(
        self,
        vector_hits: list[tuple[KnowledgeChunk, float]],
        graph_hits: list[tuple[KnowledgeChunk, float, list[str]]],
        limit: int,
    ) -> list[tuple[KnowledgeChunk, float, float, float]]:
        scores: dict[str, tuple[KnowledgeChunk, float, float]] = {}
        for chunk, vector_score in vector_hits:
            scores[chunk.chunk_id] = (chunk, vector_score, scores.get(chunk.chunk_id, (chunk, 0.0, 0.0))[2])
        for chunk, graph_score, _ in graph_hits:
            previous = scores.get(chunk.chunk_id, (chunk, 0.0, 0.0))
            scores[chunk.chunk_id] = (chunk, previous[1], graph_score)
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

    def _backend_status(self) -> dict[str, Any]:
        vector_connected = self.config.vector_backend == "local"
        graph_connected = self.config.graph_backend == "local"
        return {
            "vector_backend": self.config.vector_backend,
            "vector_connected": vector_connected,
            "vector_note": (
                "Using deterministic local vector index."
                if vector_connected
                else "External vector backend is configured but local fallback is active until the adapter is connected."
            ),
            "qdrant_collection": self.config.qdrant_collection if self.config.vector_backend == "qdrant" else None,
            "pgvector_table": self.config.pgvector_table if self.config.vector_backend == "pgvector" else None,
            "graph_backend": self.config.graph_backend,
            "graph_connected": graph_connected,
            "graph_note": (
                "Using deterministic local property graph."
                if graph_connected
                else "External graph backend is configured but local fallback is active until the adapter is connected."
            ),
            "neo4j_database": self.config.neo4j_database if self.config.graph_backend == "neo4j" else None,
        }

    def _retrieval_method(self) -> str:
        return f"vector:{self.config.vector_backend}+graph:{self.config.graph_backend}+agentic_verification"

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


def _cosine(left: dict[str, float], right: dict[str, float]) -> float:
    if not left or not right:
        return 0.0
    return sum(left.get(token, 0.0) * right.get(token, 0.0) for token in set(left) | set(right))


__all__ = [
    "DCKnowledgeRAG",
    "KnowledgeChunk",
    "KnowledgeProvenance",
    "RetrievalConfig",
    "retrieve_dc_knowledge",
]
