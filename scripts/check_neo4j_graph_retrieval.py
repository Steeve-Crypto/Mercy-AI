from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dc_knowledge_rag import (  # noqa: E402
    FallbackGraphAdapter,
    GraphRetrievalAdapter,
    KnowledgeChunk,
    LocalGraphAdapter,
    Neo4jGraphAdapter,
    RetrievalBackendError,
    RetrievalConfig,
)
from mercy_config import get_config  # noqa: E402


TENANT_A = "neo4j-check-tenant-a"
TENANT_B = "neo4j-check-tenant-b"
FIRM_A = "neo4j-check-firm-a"
MATTER_A = "neo4j-check-matter-a"
MATTER_B = "neo4j-check-matter-b"
DOCUMENT_A = "neo4j-check-document-a"
DOCUMENT_B = "neo4j-check-document-b"
SOURCE_ID = "neo4j-check-dc-source"
PUBLIC_CHUNK_ID = "neo4j-check-public-chunk"
DOCUMENT_A_CHUNK_ID = "neo4j-check-document-a-chunk"
DOCUMENT_B_CHUNK_ID = "neo4j-check-document-b-chunk"
ENTITY_PUBLIC = "neo4j-check-public-entity"
ENTITY_PRIVATE_A = "neo4j-check-private-entity-a"
ENTITY_PRIVATE_B = "neo4j-check-private-entity-b"


def _safe_error_summary(exc: Exception) -> str:
    message = str(exc).splitlines()[0].strip()
    message = re.sub(r"bolt(?:\+s)?://\S+", "[redacted-neo4j-uri]", message)
    message = re.sub(r"neo4j(?:\+s)?://\S+", "[redacted-neo4j-uri]", message)
    message = re.sub(r"https?://\S+", "[redacted-url]", message)
    message = re.sub(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", "[redacted-ip]", message)
    if len(message) > 500:
        message = f"{message[:497]}..."
    return f"{type(exc).__name__}: {message}"


def _neo4j_credentials() -> tuple[str | None, str | None, str | None, str | None]:
    config = get_config()
    password = config.neo4j_password.get_secret_value() if config.neo4j_password else None
    return config.neo4j_uri, config.neo4j_user, password, config.neo4j_database


def _chunks() -> list[KnowledgeChunk]:
    return [
        KnowledgeChunk(
            chunk_id=PUBLIC_CHUNK_ID,
            source_id=SOURCE_ID,
            text="Rollback-only public D.C. source chunk about administrative record review.",
            summary="Public source relationship check.",
            source_title="Neo4j live check D.C. source",
            citation_label="Neo4j D.C. Source",
            source_type="statute",
            authority_type="statute",
            jurisdiction="District of Columbia",
            official_locator="Rollback-only Neo4j live check locator",
            verification_status="official_metadata_unquoted",
            practice_area="civil_procedure",
            entities=[ENTITY_PUBLIC],
            relationships=[{"type": "cites", "target": "administrative_record"}],
        ),
        KnowledgeChunk(
            chunk_id=DOCUMENT_A_CHUNK_ID,
            source_id=f"document:{DOCUMENT_A}",
            text="Rollback-only tenant alpha private document chunk about lease damages.",
            summary="Tenant alpha private document relationship check.",
            source_title="Vault document neo4j-check-document-a",
            citation_label="Vault document neo4j-check-document-a",
            source_type="tenant_document",
            authority_type="record",
            jurisdiction="Tenant private document",
            official_locator=f"tenant:{TENANT_A}/document:{DOCUMENT_A}/chunk:0",
            verification_status="tenant_document_unverified",
            practice_area="tenant_document",
            tenant_id=TENANT_A,
            firm_id=FIRM_A,
            matter_id=MATTER_A,
            document_id=DOCUMENT_A,
            filename="neo4j-check-a.pdf",
            document_status="ready",
            extraction_status="ready",
            entities=[ENTITY_PRIVATE_A],
            relationships=[{"type": "mentions_issue", "target": "lease_damages"}],
        ),
        KnowledgeChunk(
            chunk_id=DOCUMENT_B_CHUNK_ID,
            source_id=f"document:{DOCUMENT_B}",
            text="Rollback-only tenant beta private document chunk about procurement timing.",
            summary="Tenant beta private document relationship check.",
            source_title="Vault document neo4j-check-document-b",
            citation_label="Vault document neo4j-check-document-b",
            source_type="tenant_document",
            authority_type="record",
            jurisdiction="Tenant private document",
            official_locator=f"tenant:{TENANT_B}/document:{DOCUMENT_B}/chunk:0",
            verification_status="tenant_document_unverified",
            practice_area="tenant_document",
            tenant_id=TENANT_B,
            firm_id="neo4j-check-firm-b",
            matter_id=MATTER_B,
            document_id=DOCUMENT_B,
            filename="neo4j-check-b.pdf",
            document_status="ready",
            extraction_status="ready",
            entities=[ENTITY_PRIVATE_B],
            relationships=[{"type": "mentions_issue", "target": "procurement_timing"}],
        ),
    ]


def _run_query(driver: Any, database: str | None, cypher: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with driver.session(database=database) as session:
        result = session.run(cypher, params or {})
        return [dict(row) for row in result]


def _cleanup(driver: Any, database: str | None) -> None:
    cypher = """
    MATCH (n)
    WHERE n.chunk_id IN $chunk_ids
       OR n.source_id = $source_id
       OR n.document_id IN $document_ids
       OR n.matter_id IN $matter_ids
       OR n.name IN $entity_names
    DETACH DELETE n
    """
    _run_query(
        driver,
        database,
        cypher,
        {
            "chunk_ids": [PUBLIC_CHUNK_ID, DOCUMENT_A_CHUNK_ID, DOCUMENT_B_CHUNK_ID],
            "source_id": SOURCE_ID,
            "document_ids": [DOCUMENT_A, DOCUMENT_B],
            "matter_ids": [MATTER_A, MATTER_B],
            "entity_names": [ENTITY_PUBLIC, ENTITY_PRIVATE_A, ENTITY_PRIVATE_B],
        },
    )


class _BrokenGraph(GraphRetrievalAdapter):
    name = "neo4j"

    def search(self, *_args: object) -> list[Any]:
        raise RetrievalBackendError("Neo4j unavailable during live fallback check")

    def status(self) -> dict[str, Any]:
        return {"backend": "neo4j", "connected": False}


def neo4j_graph_readiness() -> dict[str, Any]:
    uri, user, password, database = _neo4j_credentials()
    if not uri:
        return {"ok": False, "issues": ["MERCY_NEO4J_URI is required for live Neo4j verification."], "neo4j_checked": False}

    issues: list[str] = []
    driver = None
    try:
        from neo4j import GraphDatabase  # type: ignore

        auth = (user, password or "") if user else None
        driver = GraphDatabase.driver(uri, auth=auth)
        driver.verify_connectivity()
        _cleanup(driver, database)

        config = RetrievalConfig(
            vector_backend="local",
            graph_backend="neo4j",
            neo4j_uri=uri,
            neo4j_database=database,
            neo4j_user=user,
            neo4j_password=password,
        )
        adapter = Neo4jGraphAdapter(config)
        chunks = _chunks()
        indexed = adapter.upsert_relationships(chunks)

        public_rows = _run_query(
            driver,
            database,
            """
            MATCH (c:KnowledgeChunk {chunk_id: $chunk_id})-[:BELONGS_TO_SOURCE]->(s:LegalSource {source_id: $source_id})
            OPTIONAL MATCH (c)-[:MENTIONS]->(e:LegalEntity)
            RETURN count(DISTINCT s) AS source_count, collect(DISTINCT e.name) AS entities
            """,
            {"chunk_id": PUBLIC_CHUNK_ID, "source_id": SOURCE_ID},
        )
        matter_rows = _run_query(
            driver,
            database,
            """
            MATCH (m:Matter {matter_id: $matter_id, tenant_id: $tenant_id})-[:HAS_DOCUMENT]->(d:Document {document_id: $document_id, tenant_id: $tenant_id})
            MATCH (d)-[:HAS_CHUNK]->(c:KnowledgeChunk {chunk_id: $chunk_id, tenant_id: $tenant_id})
            RETURN count(DISTINCT m) AS matter_count, count(DISTINCT d) AS document_count, count(DISTINCT c) AS chunk_count
            """,
            {"matter_id": MATTER_A, "document_id": DOCUMENT_A, "chunk_id": DOCUMENT_A_CHUNK_ID, "tenant_id": TENANT_A},
        )
        cross_tenant_rows = _run_query(
            driver,
            database,
            """
            MATCH (m:Matter {matter_id: $matter_id, tenant_id: $tenant_id})-[:HAS_DOCUMENT]->(d:Document {document_id: $document_id})
            RETURN count(DISTINCT d) AS document_count
            """,
            {"matter_id": MATTER_A, "document_id": DOCUMENT_B, "tenant_id": TENANT_A},
        )

        public_hits = adapter.search(
            "administrative record public source",
            {"auth_context": {"tenant_id": TENANT_A, "user_id": "neo4j-check-user"}},
            {"tenant_id": TENANT_A, "jurisdiction": "District of Columbia"},
            10,
        )
        tenant_hits = adapter.search(
            "lease damages tenant alpha private document",
            {"auth_context": {"tenant_id": TENANT_A, "user_id": "neo4j-check-user"}},
            {"tenant_id": TENANT_A, "matter_id": MATTER_A, "document_id": DOCUMENT_A, "jurisdiction": "Tenant private document"},
            10,
        )
        wrong_tenant_hits = adapter.search(
            "lease damages tenant alpha private document",
            {"auth_context": {"tenant_id": TENANT_B, "user_id": "neo4j-check-user"}},
            {"tenant_id": TENANT_B, "matter_id": MATTER_A, "document_id": DOCUMENT_A, "jurisdiction": "Tenant private document"},
            10,
        )
        fallback_adapter = FallbackGraphAdapter(_BrokenGraph(), LocalGraphAdapter([chunks[0], chunks[1]]))
        fallback_hits = fallback_adapter.search(
            "lease damages",
            {"auth_context": {"tenant_id": TENANT_A, "user_id": "neo4j-check-user"}},
            {"tenant_id": TENANT_A, "matter_id": MATTER_A, "document_id": DOCUMENT_A},
            10,
        )

        public_source_count = int(public_rows[0]["source_count"]) if public_rows else 0
        public_entities = public_rows[0]["entities"] if public_rows else []
        matter_count = int(matter_rows[0]["matter_count"]) if matter_rows else 0
        document_count = int(matter_rows[0]["document_count"]) if matter_rows else 0
        document_chunk_count = int(matter_rows[0]["chunk_count"]) if matter_rows else 0
        cross_tenant_document_count = int(cross_tenant_rows[0]["document_count"]) if cross_tenant_rows else 0

        if indexed != 3:
            issues.append(f"Expected 3 Neo4j relationship rows indexed, got {indexed}.")
        if public_source_count != 1 or ENTITY_PUBLIC not in public_entities:
            issues.append("Public D.C. source relationship read did not return expected source/entity.")
        if matter_count != 1 or document_count != 1 or document_chunk_count != 1:
            issues.append("Tenant matter/document relationship read did not return expected scoped relationships.")
        if cross_tenant_document_count:
            issues.append("Cross-tenant private graph traversal returned a document relationship.")
        if not any(hit.chunk.chunk_id == PUBLIC_CHUNK_ID for hit in public_hits):
            issues.append("Public D.C. source graph retrieval did not return the public chunk.")
        if not any(hit.chunk.chunk_id == DOCUMENT_A_CHUNK_ID for hit in tenant_hits):
            issues.append("Tenant-scoped graph enrichment did not return tenant A document chunk.")
        if any(hit.chunk.chunk_id == DOCUMENT_A_CHUNK_ID for hit in wrong_tenant_hits):
            issues.append("Wrong-tenant graph retrieval returned tenant A private chunk.")
        if not any(hit.chunk.chunk_id == DOCUMENT_A_CHUNK_ID for hit in fallback_hits):
            issues.append("Local graph fallback returned no tenant document context.")
        if fallback_adapter.status().get("last_backend") != "local":
            issues.append("Graph fallback did not report local as the last backend.")

        return {
            "ok": not issues,
            "issues": issues,
            "neo4j_checked": True,
            "indexed": indexed,
            "public_source_relationships": public_source_count,
            "public_entity_relationship_present": ENTITY_PUBLIC in public_entities,
            "matter_relationships": matter_count,
            "document_relationships": document_count,
            "document_chunk_relationships": document_chunk_count,
            "tenant_document_hit_count": len([hit for hit in tenant_hits if hit.chunk.source_type == "tenant_document"]),
            "public_hit_count": len([hit for hit in public_hits if hit.chunk.source_type != "tenant_document"]),
            "wrong_tenant_private_hit_count": len([hit for hit in wrong_tenant_hits if hit.chunk.source_type == "tenant_document"]),
            "cross_tenant_document_relationships": cross_tenant_document_count,
            "fallback_backend": fallback_adapter.status().get("last_backend"),
            "fallback_hit_count": len(fallback_hits),
        }
    except Exception as exc:
        return {
            "ok": False,
            "issues": ["Live Neo4j graph verification failed.", _safe_error_summary(exc)],
            "neo4j_checked": True,
        }
    finally:
        if driver is not None:
            try:
                _cleanup(driver, database)
            except Exception:
                pass
            try:
                driver.close()
            except Exception:
                pass


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Live Neo4j graph relationship and tenant isolation verification.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    args = parser.parse_args(argv)

    result = neo4j_graph_readiness()
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print("PASS Neo4j graph" if result["ok"] else "FAIL Neo4j graph")
        for issue in result["issues"]:
            print(f"- {issue}")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
