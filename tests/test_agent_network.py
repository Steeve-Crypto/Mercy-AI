from __future__ import annotations

import os
import unittest

os.environ.setdefault("MERCY_ENV", "local")
for _key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY"):
    os.environ[_key] = ""

from agent_network import (  # noqa: E402
    AGENT_NETWORK_VERSION,
    LANGGRAPH_AVAILABLE,
    _local_langgraph_fallback_allowed,
    check_dc_ethics,
    cite_and_verify,
    execute_agent_task,
    langgraph_runtime_metadata,
    mcp_skill_manifest,
)
from legal_task_router import delegate_to_agent_network  # noqa: E402
from mercy_context import get_matter_context, update_matter_context  # noqa: E402

TEST_AUTH = {"tenant_id": "tenant-agent", "user_id": "user-agent", "auth_mode": "unit_test"}


class AgentNetworkTests(unittest.TestCase):
    def test_mcp_manifest_exposes_agents_and_json_schemas(self) -> None:
        manifest = mcp_skill_manifest()
        skill_names = {skill["name"] for skill in manifest["skills"]}
        agent_names = {agent["name"] for agent in manifest["agents"]}

        self.assertEqual(manifest["agent_network_version"], AGENT_NETWORK_VERSION)
        self.assertIn("available", manifest["langgraph"])
        self.assertIn("llm_providers", manifest)
        self.assertIn("fallback_active", manifest["llm_providers"])
        self.assertIn("runtime", manifest["langgraph"])
        if LANGGRAPH_AVAILABLE:
            self.assertTrue(manifest["langgraph"]["available"])
            self.assertEqual(manifest["langgraph"]["runtime"], "native_state_graph")
        self.assertIn("ResearchAgent", agent_names)
        self.assertIn("DraftingAgent", agent_names)
        self.assertIn("ComplianceAgent", agent_names)
        self.assertIn("IntakeAgent", agent_names)
        self.assertIn("CitationVerifierAgent", agent_names)
        for expected in {"cite_and_verify", "check_dc_ethics", "update_matter_context", "export_to_word"}:
            self.assertIn(expected, skill_names)
        for skill in manifest["skills"]:
            self.assertTrue(skill["mcp_compatible"])
            self.assertEqual(skill["input_schema"]["type"], "object")
            self.assertEqual(skill["output_schema"]["type"], "object")

    def test_cite_and_verify_returns_dc_grounding(self) -> None:
        result = cite_and_verify("D.C. Bar Ethics Op. 388", {"jurisdiction": "District of Columbia"})

        self.assertEqual(result["skill_name"], "cite_and_verify")
        self.assertIn(result["status"], {"pass", "warn"})
        self.assertTrue(result["verified_citation"]["label"])
        self.assertTrue(result["citations"])
        self.assertTrue(result["ragas_eval_hook"]["available"])

    def test_check_dc_ethics_returns_rules_flags_and_score(self) -> None:
        result = check_dc_ethics(
            "Review a D.C. legal AI draft.",
            "Attorney review required. [VERIFY CITE] Preserve confidentiality and verify all sources.",
        )

        self.assertEqual(result["skill_name"], "check_dc_ethics")
        self.assertGreaterEqual(result["ethics_compliance_score"], 0)
        self.assertIn(result["status"], {"pass", "warn"})
        self.assertIn("ethics_388", result["guardrails"])

    def test_execute_agent_task_delegates_to_selected_agent(self) -> None:
        result = execute_agent_task(
            task="Research D.C. AI ethics requirements for legal drafting.",
            params={"top_k": 2},
            matter_context={"jurisdiction": "District of Columbia", "surface_context": "unit_test_agent"},
            route={"expert": "research", "route_mode": "dc_research", "confidence": 0.94, "guardrail_status": "pass"},
        )

        self.assertEqual(result["selected_agent"], "ResearchAgent")
        self.assertIn("cite_and_verify", result["mcp_skills_used"])
        self.assertTrue(result["citations"])
        self.assertTrue(result["grounding_policy"]["strict_grounding"])
        self.assertIn("llm", result)
        self.assertIn("available", result["langgraph_runtime"])

    def test_drafting_agent_returns_attorney_review_irac_scaffold(self) -> None:
        result = execute_agent_task(
            task="Draft a D.C. attorney review clause about citation verification.",
            params={"top_k": 2},
            matter_context={"jurisdiction": "District of Columbia", "surface_context": "unit_test_agent"},
            route={"expert": "drafting", "route_mode": "dc_drafting", "confidence": 0.9, "guardrail_status": "pass"},
        )

        draft = result["agent_result"]["draft"]

        self.assertEqual(result["selected_agent"], "DraftingAgent")
        self.assertIn("This is AI-assisted drafting - attorney must review and verify all content before use.", draft)
        self.assertIn("Issue", draft)
        self.assertIn("Rule and source grounding to verify", draft)
        self.assertIn("Application", draft)
        self.assertIn("Citation verification checklist", draft)

    def test_langgraph_runtime_policy_is_fail_closed_outside_local(self) -> None:
        self.assertTrue(_local_langgraph_fallback_allowed())
        runtime = langgraph_runtime_metadata(graph_compiled=LANGGRAPH_AVAILABLE)
        self.assertIn("fallback_allowed", runtime)
        if not LANGGRAPH_AVAILABLE:
            self.assertTrue(runtime["fallback_active"])
            self.assertEqual(runtime["runtime"], "compatible_deterministic_state_graph")

    def test_intake_agent_updates_shared_matter_context(self) -> None:
        matter_id = "test-agent-network-matter"
        update_matter_context(
            {
                "matter_id": matter_id,
                "client_id": "agent-client",
                "matter_name": "Agent network matter",
                "jurisdiction": "District of Columbia",
                "source": "unit_test",
            },
            tenant_context=TEST_AUTH,
        )

        result = execute_agent_task(
            task="Update the matter context with a new intake fact.",
            params={"matter_id": matter_id, "new_facts": {"new_issue": "Citation verification needed."}, "auth_context": TEST_AUTH},
            matter_context={"matter_id": matter_id, "surface_context": "unit_test_agent", "auth_context": TEST_AUTH},
            route={"expert": "intake", "route_mode": "intake", "confidence": 0.91, "guardrail_status": "pass"},
        )

        stored = get_matter_context(matter_id, tenant_context=TEST_AUTH)

        self.assertEqual(result["selected_agent"], "IntakeAgent")
        self.assertEqual(stored["key_facts"]["new_issue"], "Citation verification needed.")
        self.assertIn("update_matter_context", result["mcp_skills_used"])

    def test_router_can_delegate_to_agent_network(self) -> None:
        result = delegate_to_agent_network(
            "Verify citation status for D.C. Bar Ethics Op. 388.",
            {"jurisdiction": "District of Columbia", "surface_context": "unit_test_agent"},
            params={"law_or_case": "D.C. Bar Ethics Op. 388"},
        )

        self.assertEqual(result["selected_agent"], "CitationVerifierAgent")
        self.assertIn("cite_and_verify", result["mcp_skills_used"])
        self.assertTrue(result["citations"])


if __name__ == "__main__":
    unittest.main()
