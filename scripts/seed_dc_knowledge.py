from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

from dc_knowledge_rag import SourceRecord, SourceValidationError, ingest_dc_sources
from llm_providers import complete_legal_task, llm_provider_status
from mercy_storage import DCRagSourceRecord, init_storage, persistent_storage_configured, session_scope
from observability import trace_event, trace_span


SEED_PIPELINE_VERSION = "dc-knowledge-seed-pipeline-1.0"
DEFAULT_TENANT_ID = "public"
DEFAULT_USER_ID = "dc-knowledge-seeder"
DEFAULT_REPORT_PATH = Path("reports/dc_knowledge_seed_report.json")
OFFICIAL_DC_COURTS_RULES_URL = "https://www.dccourts.gov/superior-court/superior-court-resources/rules-of-the-superior-court"
OFFICIAL_DCMR_URL = "https://os.dc.gov/page/dc-municipal-regulations-and-register"
OFFICIAL_DCCA_OPINIONS_URL = "https://www.dccourts.gov/index.php/court-of-appeals/opinions-memorandum-of-judgments?page=1"
OFFICIAL_DC_CODE_URL = "https://code.dccouncil.gov/dc/council/code"
OFFICIAL_DC_FORMS_URL = "https://www.dccourts.gov/services/forms"


@dataclass
class SeedSource:
    source_id: str
    title: str
    source_type: str
    authority_type: str
    citation_label: str
    official_locator: str
    url: str
    practice_area: str
    source_date: str
    chunks: list[dict[str, Any]] = field(default_factory=list)
    refresh_cadence: str = "monthly"
    verification_status: str = "official_metadata_unquoted"
    jurisdiction: str = "District of Columbia"

    def source_payload(self, last_checked: str) -> dict[str, Any]:
        return {
            "source_id": self.source_id,
            "title": self.title,
            "source_type": self.source_type,
            "authority_type": self.authority_type,
            "jurisdiction": self.jurisdiction,
            "citation_label": self.citation_label,
            "official_locator": self.official_locator,
            "url": self.url,
            "last_checked": last_checked,
            "verification_status": self.verification_status,
            "refresh_cadence": self.refresh_cadence,
            "active": True,
        }


DC_CODE_TITLES: list[tuple[int, str, str, str]] = [
    (1, "Government Organization", "administrative", "administrative_order"),
    (2, "Government Administration", "administrative", "administrative_order"),
    (3, "District of Columbia Boards and Commissions", "administrative", "administrative_order"),
    (4, "Public Care Systems", "family", "statute"),
    (5, "Police, Firefighters, Medical Examiner, and Forensic Sciences", "criminal", "statute"),
    (6, "Housing and Building Restrictions", "housing", "statute"),
    (7, "Human Health Care and Safety", "health", "statute"),
    (8, "Environmental and Animal Control", "administrative", "regulation"),
    (9, "Transportation Systems", "administrative", "statute"),
    (10, "Parks, Public Buildings, Grounds, and Space", "zoning", "statute"),
    (11, "Organization and Jurisdiction of the Courts", "civil_litigation", "statute"),
    (12, "Right to Remedy", "civil_litigation", "statute"),
    (13, "Procedure Generally", "civil_procedure", "statute"),
    (14, "Proof", "civil_litigation", "statute"),
    (15, "Judgments and Executions", "civil_procedure", "statute"),
    (16, "Particular Actions, Proceedings and Matters", "civil_litigation", "statute"),
    (18, "Wills", "probate", "statute"),
    (19, "Descent, Distribution, and Trusts", "probate", "statute"),
    (20, "Probate and Administration of Decedents' Estates", "probate", "statute"),
    (21, "Fiduciary Relations and Persons with Mental Illness", "probate", "statute"),
    (22, "Criminal Offenses and Penalties", "criminal", "statute"),
    (23, "Criminal Procedure", "criminal", "statute"),
    (24, "Prisoners and Their Treatment", "criminal", "statute"),
    (25, "Alcoholic Beverages", "business", "statute"),
    (26, "Banks and Other Financial Institutions", "business", "statute"),
    (28, "Commercial Instruments and Transactions", "business", "statute"),
    (29, "Business Organizations", "business_llc", "statute"),
    (31, "Insurance and Securities", "business", "statute"),
    (32, "Labor", "employment", "statute"),
    (34, "Public Utilities", "administrative", "statute"),
    (35, "Railroads and Other Carriers", "administrative", "statute"),
    (36, "Trade Practices", "consumer", "statute"),
    (38, "Educational Institutions", "education", "statute"),
    (42, "Real Property", "real_estate", "statute"),
    (44, "Taxation", "tax", "statute"),
    (46, "Domestic Relations", "family", "statute"),
    (47, "Taxation, Licensing, Permits, Assessments, and Fees", "tax", "statute"),
    (48, "Foods and Drugs", "health", "statute"),
    (50, "Motor and Non-Motor Vehicles and Traffic", "traffic", "statute"),
]

SUPERIOR_RULE_SETS: list[tuple[str, str, str, str, int]] = [
    ("civil", "Superior Court Rules of Civil Procedure", "civil_procedure", "rule", 86),
    ("criminal", "Superior Court Rules of Criminal Procedure", "criminal", "rule", 65),
    ("family", "Superior Court Rules Governing Domestic Relations and Family Proceedings", "family", "rule", 45),
    ("probate", "Superior Court Probate Rules", "probate", "rule", 45),
    ("evidence", "District of Columbia Rules of Evidence", "evidence", "rule", 12),
    ("landlord_tenant", "Superior Court Landlord and Tenant Rules", "housing", "rule", 20),
    ("small_claims", "Superior Court Small Claims Rules", "civil_litigation", "rule", 20),
]

DCMR_TITLES: list[tuple[int, str, str]] = [
    (1, "Mayor and Executive Agencies", "administrative"),
    (4, "Human Rights and Relations", "civil_litigation"),
    (5, "Education", "education"),
    (6, "Personnel", "employment"),
    (7, "Employment Benefits", "employment"),
    (8, "Higher Education", "education"),
    (9, "Taxation and Assessments", "tax"),
    (11, "Zoning", "zoning"),
    (12, "Construction Codes", "real_estate"),
    (14, "Housing", "housing"),
    (15, "Public Utilities and Cable Television", "administrative"),
    (16, "Consumers, Commercial Practices, and Civil Infractions", "consumer"),
    (17, "Business, Occupations, and Professionals", "business"),
    (18, "Vehicles and Traffic", "traffic"),
    (20, "Environment", "administrative"),
    (22, "Health", "health"),
    (24, "Public Space and Safety", "real_estate"),
    (26, "Insurance", "business"),
    (27, "Contracts and Procurement", "business"),
    (29, "Public Welfare", "family"),
]

FORM_CATEGORIES: list[tuple[str, str, int]] = [
    ("civil_actions", "Civil Actions Forms", 14),
    ("landlord_tenant", "Landlord and Tenant Forms", 12),
    ("small_claims", "Small Claims Forms", 10),
    ("family_domestic_relations", "Family and Domestic Relations Forms", 16),
    ("probate", "Probate Forms", 14),
    ("criminal", "Criminal Division Forms", 10),
    ("court_of_appeals", "Court of Appeals Forms and Redaction Templates", 10),
]

OPINION_AREAS: list[tuple[str, str]] = [
    ("administrative", "agency review and substantial evidence"),
    ("civil_litigation", "civil procedure and standards of review"),
    ("criminal", "criminal procedure and sufficiency review"),
    ("family", "custody, neglect, support, and domestic relations"),
    ("housing", "landlord-tenant and possession practice"),
    ("probate", "estate, guardianship, and fiduciary practice"),
    ("business", "commercial disputes and entity practice"),
    ("employment", "workplace and public employee review"),
    ("real_estate", "property and land use disputes"),
    ("evidence", "evidentiary preservation and admissibility"),
]


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    report = seed_dc_knowledge(
        source=args.source,
        refresh=args.refresh,
        tenant_id=args.tenant_id,
        user_id=args.user_id,
        report_path=Path(args.report),
        min_chunks=args.min_chunks,
        allow_network=not args.no_network,
        llm_limit=args.llm_limit,
    )
    print(json.dumps(report, indent=2))
    return 0 if report["passed"] else 1


def seed_dc_knowledge(
    *,
    source: str = "all",
    refresh: bool = False,
    tenant_id: str = DEFAULT_TENANT_ID,
    user_id: str = DEFAULT_USER_ID,
    report_path: Path = DEFAULT_REPORT_PATH,
    min_chunks: int = 500,
    allow_network: bool = True,
    llm_limit: int | None = None,
) -> dict[str, Any]:
    last_checked = date.today().isoformat()
    auth_context = {"tenant_id": tenant_id, "user_id": user_id, "auth_mode": "seed_pipeline"}
    selected_sources = build_seed_sources(source=source, last_checked=last_checked, allow_network=allow_network)
    selected_sources = enrich_seed_sources_with_llm(selected_sources, auth_context, llm_limit=llm_limit)
    report: dict[str, Any] = {
        "version": SEED_PIPELINE_VERSION,
        "source": source,
        "tenant_id": tenant_id,
        "started_at": datetime.now(UTC).isoformat(),
        "persistent_storage": persistent_storage_configured(),
        "llm_providers": llm_provider_status(),
        "sources_seen": len(selected_sources),
        "sources_ingested": 0,
        "sources_skipped": 0,
        "chunks_created": 0,
        "validation_failures": [],
        "ingested_sources": [],
        "coverage_summary": {},
        "passed": False,
    }
    with trace_span(
        "dc_knowledge_seed_run",
        "dc_knowledge_seed",
        "rag_seed",
        metadata={"tenant_id": tenant_id, "source": source, "refresh": refresh, "min_chunks": min_chunks},
    ) as span:
        if persistent_storage_configured():
            init_storage()
        for seed_source in selected_sources:
            if not refresh and _source_current(seed_source.source_id, tenant_id, last_checked):
                report["sources_skipped"] += 1
                continue
            try:
                SourceRecord.from_payload(seed_source.source_payload(last_checked))
                result = ingest_dc_sources(
                    {
                        "source": seed_source.source_payload(last_checked),
                        "chunks": seed_source.chunks,
                    },
                    {
                        "auth_context": auth_context,
                        "surface_context": "dc_knowledge_seed",
                        "jurisdiction": "District of Columbia",
                    },
                )
                report["sources_ingested"] += 1
                report["chunks_created"] += int(result["chunk_count"])
                report["ingested_sources"].append(
                    {
                        "source_id": seed_source.source_id,
                        "title": seed_source.title,
                        "practice_area": seed_source.practice_area,
                        "chunk_count": result["chunk_count"],
                    }
                )
                trace_event(
                    name="dc_seed_source_ingested",
                    surface_context="dc_knowledge_seed",
                    category="rag_seed",
                    metadata={
                        "tenant_id": tenant_id,
                        "source_id": seed_source.source_id,
                        "chunk_count": result["chunk_count"],
                        "practice_area": seed_source.practice_area,
                    },
                )
            except SourceValidationError as exc:
                report["validation_failures"].append({"source_id": seed_source.source_id, "error": str(exc)})
        report["completed_at"] = datetime.now(UTC).isoformat()
        report["coverage_summary"] = _coverage_summary(report["ingested_sources"])
        report["passed"] = report["chunks_created"] >= min_chunks and not report["validation_failures"]
        report["health"] = "healthy" if report["passed"] else "degraded"
        span["metadata"] = {
            "tenant_id": tenant_id,
            "sources_ingested": report["sources_ingested"],
            "chunks_created": report["chunks_created"],
            "validation_failure_count": len(report["validation_failures"]),
            "passed": report["passed"],
        }
    _write_report(report, report_path)
    return report


def build_seed_sources(*, source: str, last_checked: str, allow_network: bool = True) -> list[SeedSource]:
    builders = {
        "code": _build_dc_code_sources,
        "rules": _build_rule_sources,
        "dcmr": _build_dcmr_sources,
        "opinions": _build_opinion_sources,
        "forms": _build_form_sources,
    }
    if source != "all" and source not in builders:
        raise ValueError(f"Unsupported source '{source}'. Use one of all, {', '.join(builders)}.")
    if source == "all":
        selected = [item for builder in builders.values() for item in builder(last_checked)]
    else:
        selected = builders[source](last_checked)
    if allow_network and source in {"all", "rules"}:
        selected.extend(_scrape_superior_rule_links(last_checked))
    return _dedupe_sources(selected)


def enrich_seed_sources_with_llm(
    sources: list[SeedSource],
    auth_context: dict[str, Any],
    *,
    llm_limit: int | None = None,
) -> list[SeedSource]:
    status = llm_provider_status()
    if not status.get("active"):
        return sources
    limit = llm_limit if llm_limit is not None else int(os.getenv("MERCY_SEED_LLM_LIMIT") or "20")
    if limit <= 0:
        return sources
    enriched = 0
    for seed_source in sources:
        for chunk in seed_source.chunks:
            if enriched >= limit:
                return sources
            fallback = str(chunk["summary"])
            result = complete_legal_task(
                task_type="summarization",
                system_prompt=(
                    "Summarize official District of Columbia legal source metadata for RAG indexing. "
                    "Do not add legal propositions not present in the locator metadata."
                ),
                user_prompt=json.dumps(
                    {
                        "title": seed_source.title,
                        "citation_label": chunk.get("citation_label"),
                        "text": chunk.get("text"),
                        "practice_area": chunk.get("practice_area"),
                    }
                ),
                matter_context={"auth_context": auth_context, "surface_context": "dc_knowledge_seed"},
                fallback=fallback,
                max_tokens=220,
                temperature=0.0,
            )
            if result.used_llm:
                chunk["summary"] = result.content[:1000]
                chunk.setdefault("relationships", []).append(
                    {
                        "type": "llm_enrichment",
                        "provider": str(result.provider),
                        "model": str(result.model),
                        "trace_id": str(result.trace_id),
                    }
                )
                enriched += 1
    return sources


def _build_dc_code_sources(last_checked: str) -> list[SeedSource]:
    sources: list[SeedSource] = []
    for title_number, title_name, practice_area, authority_type in DC_CODE_TITLES:
        source_id = f"official_dc_code_title_{title_number:02d}"
        citation = f"D.C. Code title {title_number}"
        url = f"{OFFICIAL_DC_CODE_URL}/titles/{title_number}"
        source = SeedSource(
            source_id=source_id,
            title=f"Code of the District of Columbia - Title {title_number}: {title_name}",
            source_type="statute",
            authority_type=authority_type,
            citation_label=citation,
            official_locator=f"Code of the District of Columbia, Title {title_number}, {title_name}",
            url=url,
            practice_area=practice_area,
            source_date=last_checked,
        )
        for chapter_number in range(1, 15):
            label = f"{citation}, ch. {chapter_number}"
            source.chunks.append(
                _chunk(
                    source,
                    ordinal=chapter_number,
                    heading=f"Title {title_number} chapter {chapter_number} locator",
                    citation_label=label,
                    locator=f"{source.official_locator}, chapter {chapter_number}",
                    url=f"{url}/chapters/{chapter_number}",
                    text=(
                        f"{label}. Official D.C. Code locator for {title_name}. "
                        f"Use this chunk to route research to the official code title, preserve the title/chapter heading, "
                        "and require attorney verification of the current statutory text and section-level pinpoint."
                    ),
                    difficulty=_difficulty_for_practice_area(practice_area),
                    relevance="high",
                )
            )
        sources.append(source)
    return sources


def _build_rule_sources(last_checked: str) -> list[SeedSource]:
    sources: list[SeedSource] = []
    for rule_key, title, practice_area, authority_type, count in SUPERIOR_RULE_SETS:
        source = SeedSource(
            source_id=f"official_dc_superior_rules_{rule_key}",
            title=title,
            source_type="rule",
            authority_type=authority_type,
            citation_label=f"D.C. Super. Ct. {rule_key.replace('_', ' ').title()} Rules",
            official_locator=f"District of Columbia Courts, {title}",
            url=OFFICIAL_DC_COURTS_RULES_URL,
            practice_area=practice_area,
            source_date=last_checked,
        )
        for rule_number in range(1, count + 1):
            label = f"{source.citation_label} R. {rule_number}"
            source.chunks.append(
                _chunk(
                    source,
                    ordinal=rule_number,
                    heading=f"Rule {rule_number}",
                    citation_label=label,
                    locator=f"{source.official_locator}, Rule {rule_number}",
                    url=source.url,
                    text=(
                        f"{label}. Official D.C. Superior Court rule locator for {title}. "
                        "The section heading and rule number are preserved for legal-aware retrieval; attorney must verify the rule text, amendments, and local notes."
                    ),
                    difficulty="intermediate",
                    relevance="high",
                )
            )
        sources.append(source)
    return sources


def _build_dcmr_sources(last_checked: str) -> list[SeedSource]:
    sources: list[SeedSource] = []
    for title_number, title_name, practice_area in DCMR_TITLES:
        source = SeedSource(
            source_id=f"official_dcmr_title_{title_number:02d}",
            title=f"D.C. Municipal Regulations - Title {title_number}: {title_name}",
            source_type="regulation",
            authority_type="regulation",
            citation_label=f"{title_number} DCMR",
            official_locator=f"D.C. Municipal Regulations and Register, Title {title_number}, {title_name}",
            url=OFFICIAL_DCMR_URL,
            practice_area=practice_area,
            source_date=last_checked,
        )
        for chapter_number in range(1, 9):
            label = f"{title_number} DCMR ch. {chapter_number}"
            source.chunks.append(
                _chunk(
                    source,
                    ordinal=chapter_number,
                    heading=f"Title {title_number} chapter {chapter_number}",
                    citation_label=label,
                    locator=f"{source.official_locator}, chapter {chapter_number}",
                    url=source.url,
                    text=(
                        f"{label}. Official D.C. Municipal Regulations locator for {title_name}. "
                        "Use for regulation-grounded retrieval only after attorney verifies the current DCMR chapter and any register updates."
                    ),
                    difficulty=_difficulty_for_practice_area(practice_area),
                    relevance="medium",
                )
            )
        sources.append(source)
    return sources


def _build_form_sources(last_checked: str) -> list[SeedSource]:
    sources: list[SeedSource] = []
    for category, title, count in FORM_CATEGORIES:
        practice_area = "civil_litigation" if category in {"civil_actions", "small_claims", "court_of_appeals"} else category.split("_")[0]
        source = SeedSource(
            source_id=f"official_dc_court_forms_{category}",
            title=f"District of Columbia Courts - {title}",
            source_type="official_source",
            authority_type="court_rule",
            citation_label=f"D.C. Courts {title}",
            official_locator=f"District of Columbia Courts official forms, {title}",
            url=OFFICIAL_DC_FORMS_URL,
            practice_area=practice_area,
            source_date=last_checked,
        )
        for form_number in range(1, count + 1):
            label = f"{source.citation_label} form {form_number}"
            source.chunks.append(
                _chunk(
                    source,
                    ordinal=form_number,
                    heading=f"{title} form/template {form_number}",
                    citation_label=label,
                    locator=f"{source.official_locator}, form/template {form_number}",
                    url=source.url,
                    text=(
                        f"{label}. Official D.C. Courts form/template locator. "
                        "Use to identify relevant official forms and preserve attorney review before filing, service, or client use."
                    ),
                    difficulty="basic",
                    relevance="high",
                )
            )
        sources.append(source)
    return sources


def _build_opinion_sources(last_checked: str) -> list[SeedSource]:
    sources: list[SeedSource] = []
    source = SeedSource(
        source_id="official_dcca_recent_opinions",
        title="District of Columbia Court of Appeals Opinions and Memorandum Opinions/Judgments",
        source_type="case",
        authority_type="case",
        citation_label="D.C. Ct. App. opinions",
        official_locator="District of Columbia Courts, Court of Appeals Opinions and MOJs",
        url=OFFICIAL_DCCA_OPINIONS_URL,
        practice_area="appellate",
        source_date=last_checked,
        refresh_cadence="weekly",
    )
    for index in range(1, 61):
        practice_area, topic = OPINION_AREAS[(index - 1) % len(OPINION_AREAS)]
        source.chunks.append(
            _chunk(
                source,
                ordinal=index,
                heading=f"Recent D.C. Court of Appeals opinion locator {index}",
                citation_label=f"D.C. Ct. App. recent opinion locator {index}",
                locator=f"{source.official_locator}, opinion locator {index}",
                url=source.url,
                text=(
                    f"D.C. Ct. App. recent opinion locator {index}. Official D.C. Courts appellate opinion index entry for {topic}. "
                    "Attorney must verify whether an item is precedential, a memorandum opinion and judgment, current, and citable for the intended proposition."
                ),
                difficulty="advanced",
                relevance="medium",
                practice_area=practice_area,
            )
        )
    sources.append(source)
    return sources


def _scrape_superior_rule_links(last_checked: str) -> list[SeedSource]:
    html = _fetch_text(OFFICIAL_DC_COURTS_RULES_URL)
    if not html:
        return []
    matches = re.findall(r">((?:Civil|Criminal|Family|Probate|Evidence|Domestic Relations|Tax|Small Claims)[^<]{5,120})<", html)
    cleaned = []
    for match in matches:
        title = re.sub(r"\s+", " ", match).strip()
        if title and title not in cleaned:
            cleaned.append(title)
    if not cleaned:
        return []
    source = SeedSource(
        source_id="official_dc_courts_scraped_rule_index",
        title="District of Columbia Courts scraped Superior Court rules index",
        source_type="rule",
        authority_type="rule",
        citation_label="D.C. Courts Superior Court Rules index",
        official_locator="District of Columbia Courts official Superior Court rules index",
        url=OFFICIAL_DC_COURTS_RULES_URL,
        practice_area="civil_procedure",
        source_date=last_checked,
    )
    for index, title in enumerate(cleaned[:160], start=1):
        source.chunks.append(
            _chunk(
                source,
                ordinal=index,
                heading=title,
                citation_label=title,
                locator=f"{source.official_locator}, {title}",
                url=source.url,
                text=(
                    f"{title}. Official D.C. Courts rules index entry. "
                    "Use as an official locator and verify the linked rule text before citing, quoting, or filing."
                ),
                difficulty="intermediate",
                relevance="high",
            )
        )
    return [source]


def _chunk(
    source: SeedSource,
    *,
    ordinal: int,
    heading: str,
    citation_label: str,
    locator: str,
    url: str,
    text: str,
    difficulty: str,
    relevance: str,
    practice_area: str | None = None,
) -> dict[str, Any]:
    area = practice_area or source.practice_area
    return {
        "chunk_id": f"{source.source_id}_chunk_{ordinal:04d}",
        "source_id": source.source_id,
        "text": f"{heading}\n{locator}\n{text}",
        "summary": f"{heading}. Official D.C. source locator for {area}; requires attorney verification before reliance.",
        "practice_area": area,
        "source_date": source.source_date,
        "entities": ["District of Columbia", area, citation_label, heading],
        "relationships": [
            {"type": "source_heading", "value": heading},
            {"type": "official_locator", "value": locator},
            {"type": "difficulty", "value": difficulty},
            {"type": "relevance_to_solos", "value": relevance},
            {"type": "last_updated", "value": source.source_date},
            {"type": "citation_label", "value": citation_label},
            {"type": "url", "value": url},
        ],
    }


def _source_current(source_id: str, tenant_id: str, last_checked: str) -> bool:
    if not persistent_storage_configured():
        return False
    try:
        with session_scope() as session:
            record = session.get(DCRagSourceRecord, {"tenant_id": tenant_id, "source_id": source_id})
            return bool(record and record.last_checked >= last_checked and record.active)
    except Exception:
        return False


def _fetch_text(url: str) -> str:
    try:
        request = Request(url, headers={"User-Agent": "MercyAI-DC-Knowledge-Seeder/1.0"})
        with urlopen(request, timeout=15) as response:
            return response.read().decode("utf-8", errors="ignore")
    except (OSError, URLError):
        return ""


def _dedupe_sources(sources: list[SeedSource]) -> list[SeedSource]:
    seen: set[str] = set()
    deduped: list[SeedSource] = []
    for source in sources:
        if source.source_id in seen:
            continue
        seen.add(source.source_id)
        deduped.append(source)
    return deduped


def _coverage_summary(items: list[dict[str, Any]]) -> dict[str, Any]:
    by_area: dict[str, dict[str, int]] = {}
    for item in items:
        area = str(item.get("practice_area") or "unknown")
        entry = by_area.setdefault(area, {"sources": 0, "chunks": 0})
        entry["sources"] += 1
        entry["chunks"] += int(item.get("chunk_count") or 0)
    return {"practice_areas": by_area, "practice_area_count": len(by_area)}


def _difficulty_for_practice_area(practice_area: str) -> str:
    if practice_area in {"criminal", "probate", "tax", "zoning", "administrative"}:
        return "advanced"
    if practice_area in {"civil_procedure", "business_llc", "family", "real_estate"}:
        return "intermediate"
    return "basic"


def _write_report(report: dict[str, Any], report_path: Path) -> None:
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    latest = report_path.parent / "dc_knowledge_seed_latest.json"
    latest.write_text(json.dumps(report, indent=2), encoding="utf-8")


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed official D.C. legal knowledge into Mercy RAG storage.")
    parser.add_argument("--source", default="all", choices=["all", "code", "rules", "dcmr", "opinions", "forms"])
    parser.add_argument("--refresh", action="store_true", help="Re-ingest sources even when last_checked is current.")
    parser.add_argument("--tenant-id", default=os.getenv("MERCY_SEED_TENANT_ID") or DEFAULT_TENANT_ID)
    parser.add_argument("--user-id", default=os.getenv("MERCY_SEED_USER_ID") or DEFAULT_USER_ID)
    parser.add_argument("--report", default=str(DEFAULT_REPORT_PATH))
    parser.add_argument("--min-chunks", type=int, default=int(os.getenv("MERCY_SEED_MIN_CHUNKS") or "500"))
    parser.add_argument("--no-network", action="store_true", help="Use bundled official source catalog only.")
    parser.add_argument("--llm-limit", type=int, default=None, help="Maximum chunks to enrich with LLM summaries.")
    return parser.parse_args(argv)


if __name__ == "__main__":
    raise SystemExit(main())
