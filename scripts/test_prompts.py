from __future__ import annotations

import argparse
import json
from typing import Any

from prompts.registry import get_prompt_registry


SAMPLE_TASKS = {
    "motion_drafting": "Draft a D.C. Superior Court motion section seeking leave to amend a complaint.",
    "legal_research": "Research the D.C. standard for a motion to dismiss in Superior Court.",
    "client_intake": "Summarize a new D.C. landlord-tenant intake and identify missing facts.",
    "contract_retainer": "Draft a limited-scope D.C. engagement letter provision for a solo attorney.",
    "family_law": "Prepare a D.C. family-law review memo for custody-related missing facts.",
    "zoning": "Analyze a D.C. variance issue for a small business storefront.",
    "administrative_appeal": "Draft an administrative appeal argument outline from an agency record.",
    "small_business_compliance": "Create a D.C. small-business compliance checklist for a new LLC.",
    "ethics_check": "Check D.C. ethics risks in an AI-assisted draft sent to a client.",
    "citation_verification": "Verify candidate citation grounding for a D.C. Code provision.",
}

SAMPLE_SOURCES = [
    {
        "citation_label": "D.C. Superior Court Civil Rule 15",
        "source_title": "D.C. Superior Court Rules of Civil Procedure",
        "authority_type": "court_rule",
        "jurisdiction": "DC",
        "official_locator": "https://www.dccourts.gov/superior-court/rules",
        "verification_status": "official_metadata_unquoted",
        "summary": "Official rule metadata for amendment of pleadings; attorney must verify current text and pinpoint support.",
    },
    {
        "citation_label": "D.C. Code sec. 16-3901",
        "source_title": "D.C. Official Code",
        "authority_type": "statute",
        "jurisdiction": "DC",
        "official_locator": "https://code.dccouncil.gov/",
        "verification_status": "official_metadata_unquoted",
        "summary": "Official D.C. Code locator metadata; attorney must verify current source text.",
    },
]


def test_prompts(task: str, count: int, template_id: str | None = None) -> dict[str, Any]:
    registry = get_prompt_registry()
    task_text = SAMPLE_TASKS.get(task, task)
    rendered = registry.render(
        template_id=template_id,
        task=task_text,
        matter_context={
            "jurisdiction": "District of Columbia",
            "matter_type": task,
            "surface_context": "prompt_cli",
            "tenant_id": "cli-preview-tenant",
        },
        retrieved_sources=SAMPLE_SOURCES,
        route_expert=_route_for_task(task),
        fewshot_count=count,
    )
    return {
        "registry": {
            "version": registry.version,
            "template_count": registry.status()["template_count"],
            "fewshot_example_count": registry.status()["fewshot_example_count"],
        },
        "selected_template": rendered.metadata(),
        "system_prompt_preview": rendered.system_prompt[:1200],
        "user_prompt_preview": rendered.user_prompt[:1800],
        "validation": {
            "has_attorney_review_disclaimer": "attorney must review and verify" in rendered.system_prompt.lower(),
            "official_dc_sources_only": "official district of columbia sources" in rendered.system_prompt.lower(),
            "fewshot_examples_rendered": len(rendered.examples),
            "uses_seeded_knowledge_context": "Retrieved official D.C. sources" in rendered.user_prompt
            or "Sources:" in rendered.user_prompt,
        },
    }


def _route_for_task(task: str) -> str:
    if task in {"motion_drafting", "contract_retainer", "family_law", "administrative_appeal"}:
        return "drafting"
    if task in {"ethics_check"}:
        return "compliance_guardrails"
    if task in {"citation_verification"}:
        return "citation_verifier"
    if task in {"client_intake"}:
        return "intake"
    return "research"


def main() -> None:
    parser = argparse.ArgumentParser(description="Render and validate Mercy D.C. legal prompt templates.")
    parser.add_argument("--task", default="motion_drafting", help="Task key or free-form task text.")
    parser.add_argument("--count", type=int, default=5, help="Number of few-shot examples to include.")
    parser.add_argument("--template", default=None, help="Optional explicit prompt template id.")
    args = parser.parse_args()
    print(json.dumps(test_prompts(args.task, max(0, args.count), args.template), indent=2, default=str))


if __name__ == "__main__":
    main()
