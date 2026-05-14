from __future__ import annotations

import json
import os
import unittest

from agent_network import mcp_skill_manifest
from llm_providers import generate_legal_draft, generate_research_answer
from mercy_context import product_capabilities
from prompts.dc_legal_prompts import MANDATORY_REVIEW_DISCLAIMER, OFFICIAL_DC_GROUNDING_RULE
from prompts.registry import FEWSHOT_PATH, get_prompt_registry
from scripts.test_prompts import test_prompts


class PromptRegistryTests(unittest.TestCase):
    def setUp(self) -> None:
        for env_name in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY"):
            os.environ.pop(env_name, None)

    def test_registry_loads_dc_templates_and_fewshot_examples(self) -> None:
        registry = get_prompt_registry()
        status = registry.status()
        self.assertGreaterEqual(status["template_count"], 12)
        self.assertGreaterEqual(status["fewshot_example_count"], 12)
        for template in registry._templates.values():  # noqa: SLF001 - intentional registry invariant test
            self.assertIn(MANDATORY_REVIEW_DISCLAIMER, template.system)
            self.assertIn(OFFICIAL_DC_GROUNDING_RULE, template.system)
            self.assertTrue(template.output_contract)
            self.assertTrue(template.route_experts)

    def test_fewshot_jsonl_is_valid(self) -> None:
        lines = FEWSHOT_PATH.read_text(encoding="utf-8").splitlines()
        self.assertGreaterEqual(len([line for line in lines if line.strip()]), 12)
        for line in lines:
            if not line.strip():
                continue
            payload = json.loads(line)
            self.assertIn("example_id", payload)
            self.assertIn("input", payload)
            self.assertIn("output", payload)

    def test_motion_render_selects_drafting_template(self) -> None:
        registry = get_prompt_registry()
        rendered = registry.render(
            task="Draft a motion with citation verification notes for D.C. Superior Court.",
            matter_context={"jurisdiction": "District of Columbia", "surface_context": "test"},
            retrieved_sources=[{"citation_label": "D.C. Superior Court Civil Rule 15"}],
            route_expert="drafting",
            fewshot_count=2,
        )
        self.assertEqual(rendered.template.template_id, "motion_drafting_superior_court")
        self.assertGreaterEqual(len(rendered.examples), 1)
        self.assertIn("D.C. Superior Court", rendered.system_prompt)
        self.assertIn("D.C. Superior Court Civil Rule 15", rendered.user_prompt)

    def test_prompt_cli_preview(self) -> None:
        preview = test_prompts("motion_drafting", 5)
        self.assertEqual(preview["selected_template"]["template_id"], "motion_drafting_superior_court")
        self.assertTrue(preview["validation"]["has_attorney_review_disclaimer"])
        self.assertTrue(preview["validation"]["official_dc_sources_only"])
        self.assertGreaterEqual(preview["selected_template"]["fewshot_count"], 1)

    def test_capabilities_and_skill_manifest_report_prompt_templates(self) -> None:
        capabilities = product_capabilities()
        manifest = mcp_skill_manifest()
        self.assertIn("prompt_registry", capabilities)
        self.assertIn("prompt_registry", manifest)
        self.assertGreaterEqual(capabilities["prompt_registry"]["template_count"], 12)
        self.assertGreaterEqual(manifest["prompt_registry"]["fewshot_example_count"], 12)

    def test_llm_fallback_preserves_selected_prompt_metadata(self) -> None:
        retrieval = {
            "results": [
                {
                    "citation": {"label": "D.C. Superior Court Civil Rule 15"},
                    "summary": "Official metadata for amendment practice.",
                    "verification_status": "official_metadata_unquoted",
                    "official_locator": "https://www.dccourts.gov/superior-court/rules",
                }
            ]
        }
        route = {"expert": "drafting", "route_mode": "test"}
        draft = generate_legal_draft(
            task="Draft a motion for leave to amend in D.C. Superior Court.",
            matter_context={"jurisdiction": "District of Columbia", "surface_context": "test"},
            retrieval=retrieval,
            route=route,
            fallback="fallback draft",
        )
        self.assertFalse(draft.used_llm)
        self.assertEqual((draft.prompt_template or {}).get("template_id"), "motion_drafting_superior_court")

        research = generate_research_answer(
            query="Research D.C. amendment practice.",
            retrieval=retrieval,
            matter_context={"jurisdiction": "District of Columbia", "surface_context": "test"},
            route={"expert": "research", "route_mode": "test"},
            fallback="fallback research",
        )
        self.assertEqual((research.prompt_template or {}).get("template_id"), "legal_research_official_dc")


if __name__ == "__main__":
    unittest.main()
