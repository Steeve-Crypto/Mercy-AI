from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any

from observability import trace_event
from prompts.registry import get_prompt_registry


TEMPLATE_GALLERY_VERSION = "dc-template-gallery-1.0"


@dataclass(frozen=True)
class DCTemplate:
    template_id: str
    title: str
    description: str
    practice_area: str
    difficulty: str
    required_inputs: tuple[str, ...]
    prompt_template_id: str
    matter_type: str
    generation_task: str
    source_query: str
    default_inputs: dict[str, Any] = field(default_factory=dict)
    ethics_tip: str = "This is AI-assisted drafting - attorney must review and verify all content before use."

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["required_inputs"] = list(self.required_inputs)
        prompt = get_prompt_registry().get(self.prompt_template_id)
        payload["prompt_template"] = prompt.metadata()
        payload["dc_grounding"] = {
            "official_sources_only": True,
            "seeded_knowledge_base": "PD038 official D.C. source chunks",
            "attorney_review_required": True,
        }
        return payload


DC_TEMPLATE_GALLERY: tuple[DCTemplate, ...] = (
    DCTemplate("dc-retainer-limited-scope", "Limited-Scope Engagement Letter", "D.C. engagement letter scaffold for a defined solo-firm representation.", "ethics", "intermediate", ("client_name", "scope_of_work", "excluded_work", "fee_terms"), "contract_retainer_drafting", "retainer agreement", "Draft a D.C. limited-scope engagement letter with RPC and fee reasonableness flags.", "D.C. limited-scope retainer ethics fee scope"),
    DCTemplate("dc-retainer-litigation", "Civil Litigation Retainer", "Superior Court litigation retainer with scope, fees, client duties, and AI-use disclosures.", "civil_litigation", "intermediate", ("client_name", "matter_description", "fee_structure", "opposing_parties"), "contract_retainer_drafting", "civil litigation retainer", "Draft a D.C. Superior Court civil litigation retainer for attorney review.", "D.C. civil litigation retainer Superior Court fee agreement"),
    DCTemplate("dc-engagement-admin", "Administrative Appeal Engagement Letter", "Engagement terms for OAH or agency-record review work.", "administrative", "intermediate", ("client_name", "agency", "order_date", "scope_of_review"), "contract_retainer_drafting", "administrative appeal engagement", "Draft a D.C. administrative appeal engagement letter.", "D.C. administrative appeal engagement agency record"),
    DCTemplate("dc-motion-dismiss-opposition", "Opposition to Motion to Dismiss", "IRAC-style D.C. Superior Court opposition outline grounded in official rules.", "civil_litigation", "advanced", ("claims", "procedural_posture", "key_facts", "requested_relief"), "motion_drafting_superior_court", "civil motion", "Draft a D.C. Superior Court opposition to a motion to dismiss.", "D.C. Superior Court motion to dismiss opposition civil rule"),
    DCTemplate("dc-motion-compel", "Motion to Compel Discovery", "Discovery motion scaffold with certification and source-verification checklist.", "civil_litigation", "intermediate", ("discovery_requests", "responses_due", "deficiencies", "meet_and_confer"), "motion_drafting_superior_court", "civil discovery motion", "Draft a D.C. Superior Court motion to compel discovery.", "D.C. Superior Court motion compel discovery rules"),
    DCTemplate("dc-motion-summary-judgment-opposition", "Summary Judgment Opposition", "Attorney-review opposition structure focused on record disputes and D.C. rule grounding.", "civil_litigation", "advanced", ("material_facts", "record_citations", "claims", "procedural_deadline"), "motion_drafting_superior_court", "summary judgment opposition", "Draft a D.C. Superior Court summary judgment opposition.", "D.C. Superior Court summary judgment opposition civil rule"),
    DCTemplate("dc-civil-complaint", "Civil Complaint", "Pleading framework for D.C. Superior Court civil claims with unsupported facts bracketed.", "civil_litigation", "intermediate", ("parties", "jurisdiction_basis", "claims", "damages_or_relief"), "pleading_drafting_superior_court", "civil complaint", "Draft a D.C. Superior Court civil complaint for attorney review.", "D.C. Superior Court civil complaint pleading rules"),
    DCTemplate("dc-answer-counterclaims", "Answer and Counterclaims", "Responsive pleading scaffold with admissions, denials, defenses, and verification notes.", "civil_litigation", "intermediate", ("complaint_allegations", "client_response", "defenses", "counterclaim_facts"), "pleading_drafting_superior_court", "answer and counterclaims", "Draft a D.C. Superior Court answer and counterclaims.", "D.C. Superior Court answer counterclaims pleading"),
    DCTemplate("dc-family-custody-motion", "Family Court Custody Motion", "D.C. Family Court motion language with safety and best-interest fact prompts.", "family", "advanced", ("child_information", "current_order", "requested_change", "safety_concerns"), "family_law_review", "family custody motion", "Draft a D.C. Family Court custody motion outline.", "D.C. Family Court custody motion official forms"),
    DCTemplate("dc-family-support-opposition", "Child Support Opposition", "Family-law response scaffold requiring current financial documents and attorney review.", "family", "advanced", ("support_order", "income_facts", "requested_relief", "financial_documents"), "family_law_review", "family support opposition", "Draft a D.C. child support opposition or response.", "D.C. child support family court rules"),
    DCTemplate("dc-criminal-discovery-motion", "Criminal Discovery Motion", "D.C. Superior Court criminal discovery motion checklist and draft sections.", "criminal", "advanced", ("charges", "requested_materials", "case_status", "prior_requests"), "motion_drafting_superior_court", "criminal motion", "Draft a D.C. Superior Court criminal discovery motion.", "D.C. Superior Court criminal rules discovery motion"),
    DCTemplate("dc-criminal-suppression-outline", "Suppression Motion Outline", "Issue/rule/application outline for a D.C. suppression motion with facts-to-verify.", "criminal", "advanced", ("search_or_stop_facts", "charges", "evidence_at_issue", "hearing_date"), "motion_drafting_superior_court", "criminal suppression motion", "Draft a D.C. suppression motion outline.", "D.C. criminal suppression motion Superior Court rules"),
    DCTemplate("dc-zoning-variance-memo", "Zoning Variance Memo", "D.C. zoning variance analysis with DCMR-grounding and missing property facts.", "zoning", "advanced", ("property_address", "zone", "requested_variance", "practical_difficulty"), "zoning_land_use_analysis", "zoning variance", "Analyze and draft a D.C. zoning variance memo.", "D.C. zoning variance DCMR board zoning adjustment"),
    DCTemplate("dc-zoning-appeal", "BZA / Zoning Appeal", "Administrative appeal outline for D.C. zoning orders and record issues.", "zoning", "advanced", ("order_or_decision", "appeal_deadline", "record_facts", "requested_relief"), "zoning_land_use_analysis", "zoning appeal", "Draft a D.C. zoning appeal outline.", "D.C. zoning appeal BZA DCMR official"),
    DCTemplate("dc-admin-petition-review", "Administrative Petition for Review", "D.C. Court of Appeals or agency-record petition checklist and argument outline.", "administrative", "advanced", ("agency", "final_order_date", "issues", "record_citations"), "administrative_appeal_briefing", "administrative petition", "Draft a D.C. administrative petition for review outline.", "D.C. administrative petition for review agency record"),
    DCTemplate("dc-oah-hearing-statement", "OAH Hearing Statement", "Hearing statement scaffold for D.C. administrative matters.", "administrative", "intermediate", ("agency", "hearing_date", "issues", "exhibits"), "administrative_appeal_briefing", "OAH hearing statement", "Draft a D.C. OAH hearing statement.", "D.C. OAH hearing statement administrative rules"),
    DCTemplate("dc-llc-formation-checklist", "LLC Formation Checklist", "Small-business checklist for D.C. entity setup and attorney-review compliance.", "small_business", "beginner", ("business_name", "owners", "registered_agent", "business_activity"), "small_business_compliance", "LLC formation", "Create a D.C. LLC formation checklist.", "D.C. LLC formation business compliance official"),
    DCTemplate("dc-operating-agreement", "LLC Operating Agreement Starter", "Attorney-review operating agreement scaffold for a D.C. small business.", "small_business", "intermediate", ("members", "management_structure", "capital_contributions", "tax_preferences"), "contract_retainer_drafting", "operating agreement", "Draft a D.C. LLC operating agreement starter.", "D.C. LLC operating agreement business code"),
    DCTemplate("dc-business-license-memo", "Basic Business License Memo", "D.C. licensing issue checklist for small business intake.", "small_business", "beginner", ("business_activity", "location", "ownership", "timeline"), "small_business_compliance", "business license compliance", "Create a D.C. basic business license compliance memo.", "D.C. basic business license DCMR small business"),
    DCTemplate("dc-client-intake-general", "General Client Intake Questionnaire", "Matter-opening questionnaire for D.C. solo practice workflows.", "intake", "beginner", ("client_name", "matter_type", "opposing_parties", "client_goal"), "client_intake_matter_summary", "client intake", "Create a D.C. client intake questionnaire and matter summary.", "D.C. client intake conflict scope questionnaire"),
    DCTemplate("dc-client-intake-family", "Family Law Intake Questionnaire", "Family-law intake prompts covering parties, children, orders, safety, and deadlines.", "family", "beginner", ("client_name", "children", "current_orders", "safety_concerns"), "client_intake_matter_summary", "family intake", "Create a D.C. family-law intake questionnaire.", "D.C. Family Court intake questionnaire official forms"),
    DCTemplate("dc-demand-letter-contract", "Contract Demand Letter", "D.C. contract demand letter scaffold with fact and citation verification warnings.", "contracts", "intermediate", ("counterparty", "contract_terms", "breach_facts", "demand"), "contract_retainer_drafting", "demand letter", "Draft a D.C. contract demand letter.", "D.C. contract demand letter breach official sources"),
    DCTemplate("dc-demand-letter-consumer", "Consumer Protection Demand Letter", "Consumer-facing demand letter requiring D.C. source verification.", "consumer", "intermediate", ("business_name", "transaction", "harm", "requested_resolution"), "small_business_compliance", "consumer demand letter", "Draft a D.C. consumer protection demand letter.", "D.C. consumer protection demand letter official code"),
    DCTemplate("dc-settlement-agreement", "Settlement Agreement", "Settlement term sheet and agreement scaffold with confidentiality and authority checks.", "contracts", "intermediate", ("parties", "payment_terms", "release_scope", "confidentiality_terms"), "contract_retainer_drafting", "settlement agreement", "Draft a D.C. settlement agreement for attorney review.", "D.C. settlement agreement release confidentiality"),
    DCTemplate("dc-discovery-requests", "Civil Discovery Requests", "Interrogatories and requests for production scaffold for D.C. civil litigation.", "civil_litigation", "intermediate", ("claims_or_defenses", "documents_sought", "time_period", "definitions"), "motion_drafting_superior_court", "civil discovery requests", "Draft D.C. civil discovery requests for attorney review.", "D.C. Superior Court civil discovery interrogatories requests production"),
    DCTemplate("dc-citation-verification-report", "Citation Verification Report", "Verification checklist for D.C. cases, code sections, rules, and DCMR locators.", "research", "beginner", ("candidate_citations", "proposition", "filing_context"), "citation_generation_verification", "citation verification", "Prepare a D.C. citation verification report.", "D.C. citation verification official locator court rules code"),
)


def template_gallery_status() -> dict[str, Any]:
    practice_areas = sorted({template.practice_area for template in DC_TEMPLATE_GALLERY})
    return {
        "version": TEMPLATE_GALLERY_VERSION,
        "template_count": len(DC_TEMPLATE_GALLERY),
        "practice_areas": practice_areas,
        "endpoint": "/v1/templates/gallery",
        "generation_endpoint": "/v1/agent/execute",
        "prompt_registry_version": get_prompt_registry().version,
        "official_dc_grounding_required": True,
        "attorney_review_required": True,
    }


def list_template_gallery(
    *,
    tenant_context: dict[str, Any] | None = None,
    practice_area: str | None = None,
    difficulty: str | None = None,
    search: str | None = None,
) -> dict[str, Any]:
    practice_filter = (practice_area or "").strip().lower()
    difficulty_filter = (difficulty or "").strip().lower()
    search_filter = (search or "").strip().lower()
    templates = []
    for template in DC_TEMPLATE_GALLERY:
        haystack = " ".join(
            [
                template.title,
                template.description,
                template.practice_area,
                template.matter_type,
                template.generation_task,
                template.source_query,
            ]
        ).lower()
        if practice_filter and template.practice_area != practice_filter:
            continue
        if difficulty_filter and template.difficulty != difficulty_filter:
            continue
        if search_filter and search_filter not in haystack:
            continue
        templates.append(template.to_dict())

    trace_event(
        name="template_gallery_view",
        surface_context="template_gallery",
        category="templates",
        metadata={
            "tenant_id": (tenant_context or {}).get("tenant_id"),
            "user_id": (tenant_context or {}).get("user_id"),
            "template_count": len(templates),
            "practice_area": practice_area,
            "difficulty": difficulty,
            "search": bool(search_filter),
        },
    )
    return {
        **template_gallery_status(),
        "filters": {
            "practice_area": practice_area,
            "difficulty": difficulty,
            "search": search,
        },
        "templates": templates,
        "generated_at": datetime.now(UTC).isoformat(),
    }


def get_template(template_id: str) -> DCTemplate | None:
    return next((template for template in DC_TEMPLATE_GALLERY if template.template_id == template_id), None)


def trace_template_usage(
    *,
    template_id: str,
    surface_context: str,
    tenant_context: dict[str, Any] | None = None,
    matter_id: str | None = None,
    prompt_template_id: str | None = None,
) -> None:
    trace_event(
        name="template_generation_requested",
        surface_context=surface_context,
        category="templates",
        matter_reference=matter_id,
        metadata={
            "template_id": template_id,
            "prompt_template_id": prompt_template_id,
            "tenant_id": (tenant_context or {}).get("tenant_id"),
            "user_id": (tenant_context or {}).get("user_id"),
            "official_dc_grounding_required": True,
            "attorney_review_required": True,
        },
    )


__all__ = [
    "DC_TEMPLATE_GALLERY",
    "DCTemplate",
    "TEMPLATE_GALLERY_VERSION",
    "get_template",
    "list_template_gallery",
    "template_gallery_status",
    "trace_template_usage",
]
