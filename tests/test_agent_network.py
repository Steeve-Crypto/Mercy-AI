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

TEST_AUTH = {
    "firm_id": "firm-agent",
    "tenant_id": "tenant-agent",
    "user_id": "user-agent",
    "auth_mode": "unit_test",
}


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
        self.assertTrue(manifest["react_loop"]["enabled"])
        self.assertTrue(manifest["sandbox"]["enabled"])
        self.assertTrue(manifest["hermes"]["enabled"])
        self.assertIn("models", manifest["hermes"])
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
            self.assertTrue(skill["react_enabled"])
            self.assertTrue(skill["sandbox_status"]["enabled"])
            self.assertFalse(skill["sandbox_status"]["arbitrary_code_execution"])
            self.assertEqual(skill["input_schema"]["type"], "object")
            self.assertEqual(skill["output_schema"]["type"], "object")
        for agent in manifest["agents"]:
            self.assertTrue(agent["hermes"]["enabled"])
            self.assertEqual(agent["hermes"]["name"], "HermesAgent")
            self.assertIn("NousResearch", agent["hermes"]["provider"])
            self.assertTrue(agent["hermes"]["persistent_memory"])

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
        self.assertTrue(result["react_loop"]["enabled"])
        self.assertGreaterEqual(result["react_loop"]["cycles_completed"], 1)
        self.assertTrue(result["mcp_skill_results"][0]["sandbox"]["enabled"])
        self.assertIn("hermes", result)
        self.assertIn("reasoning", result["hermes"])
        self.assertIn("reflection", result["hermes"])
        self.assertTrue(result["hermes"]["reflection"]["memory"]["tenant_id"])

    def test_hermes_memory_reuses_successful_skills_across_cycles(self) -> None:
        result = execute_agent_task(
            task="Draft D.C. attorney review language about official citation verification.",
            params={"top_k": 2, "cycles": 3},
            matter_context={
                "jurisdiction": "District of Columbia",
                "surface_context": "unit_test_hermes",
                "auth_context": TEST_AUTH,
                "matter_id": "hermes-memory-matter",
                "key_facts": {"objective": "Citation verification clause."},
            },
            route={"expert": "drafting", "route_mode": "dc_drafting", "confidence": 0.93, "guardrail_status": "pass"},
        )

        hermes = result["hermes"]
        memory = hermes["reflection"]["memory"]

        self.assertEqual(result["selected_agent"], "DraftingAgent")
        self.assertEqual(result["react_loop"]["cycles_completed"], 3)
        self.assertIn("check_dc_ethics", memory["preferred_skills"])
        self.assertIn("pd044_golden_dataset", hermes["reasoning"]["domain_learning"])

    def test_mcp_sandbox_blocks_invalid_skill_input(self) -> None:
        from agent_network import execute_mcp_skill_sandboxed, get_agent_network

        skill = get_agent_network().skills["export_to_word"]
        result = execute_mcp_skill_sandboxed(skill, {"content": "Safe text.", "format": "pdf"})

        self.assertEqual(result["status"], "block")
        self.assertEqual(result["error"]["code"], "MCP_SANDBOX_BLOCKED")
        self.assertEqual(result["sandbox"]["status"], "block")

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

    def test_approved_outlook_capture_is_tenant_scoped_matter_history(self) -> None:
        matter_id = "test-agent-network-outlook-history"
        update_matter_context(
            {
                "matter_id": matter_id,
                "client_id": "outlook-client",
                "matter_name": "Outlook correspondence matter",
                "jurisdiction": "District of Columbia",
                "source": "unit_test",
            },
            tenant_context=TEST_AUTH,
        )

        result = execute_agent_task(
            task="Save attorney-approved Outlook correspondence to the selected matter history.",
            params={
                "matter_id": matter_id,
                "new_facts": {
                    "office_addin_note": "Subject: Scheduling order\nFrom: counsel@example.com\nDeadline: July 20.",
                    "office_capture": {
                        "surface": "outlook",
                        "capture_kind": "correspondence",
                        "attorney_approved": True,
                        "approval_method": "explicit_save_to_matter_action",
                    },
                },
                "auth_context": TEST_AUTH,
            },
            matter_context={"matter_id": matter_id, "surface_context": "office_outlook", "auth_context": TEST_AUTH},
            route={"expert": "intake", "route_mode": "intake", "confidence": 0.96, "guardrail_status": "pass"},
        )

        stored = get_matter_context(matter_id, tenant_context=TEST_AUTH)
        events = [event for event in stored["history"] if event.get("event") == "office_correspondence_saved"]
        skill_result = result["mcp_skill_results"][0]

        self.assertEqual(result["agent_result"]["status"], "pass")
        self.assertEqual(len(events), 1)
        self.assertTrue(events[0]["attorney_approved"])
        self.assertEqual(events[0]["surface"], "outlook")
        self.assertEqual(events[0]["data_scope"], "selected_tenant_matter_history")
        self.assertEqual(events[0]["firm_id"], "firm-agent")
        self.assertEqual(events[0]["account_id"], "firm-agent")
        self.assertEqual(events[0]["tenant_id"], "tenant-agent")
        self.assertEqual(events[0]["actor_user_id"], "user-agent")
        self.assertEqual(events[0]["provenance"]["office_host"], "outlook")
        self.assertFalse(events[0]["provenance"]["attachment_bodies_included"])
        self.assertIn("[REDACTED_EMAIL]", events[0]["content"])
        self.assertNotIn("counsel@example.com", events[0]["content"])
        self.assertNotIn("office_addin_note", stored["key_facts"])
        self.assertNotIn("office_capture", stored["key_facts"])
        self.assertEqual(skill_result["provenance"]["history_event"], "office_correspondence_saved")
        self.assertTrue(skill_result["provenance"]["attorney_approved"])

    def test_cross_tenant_outlook_capture_is_blocked_without_mutation(self) -> None:
        from agent_network import execute_mcp_skill_sandboxed, get_agent_network

        matter_id = "test-agent-network-outlook-cross-tenant"
        update_matter_context(
            {
                "matter_id": matter_id,
                "client_id": "outlook-owner-client",
                "matter_name": "Tenant owner matter",
                "source": "unit_test",
            },
            tenant_context=TEST_AUTH,
        )
        other_auth = {"tenant_id": "tenant-other", "user_id": "user-other", "auth_mode": "unit_test"}
        skill = get_agent_network().skills["update_matter_context"]

        result = execute_mcp_skill_sandboxed(
            skill,
            {
                "matter_id": matter_id,
                "new_facts": {
                    "office_addin_note": "This must not be stored.",
                    "office_capture": {
                        "surface": "outlook",
                        "capture_kind": "correspondence",
                        "attorney_approved": True,
                        "approval_method": "explicit_save_to_matter_action",
                    },
                },
                "auth_context": other_auth,
            },
            matter_context={"matter_id": matter_id, "auth_context": other_auth},
        )

        stored = get_matter_context(matter_id, tenant_context=TEST_AUTH)

        self.assertEqual(result["status"], "block")
        self.assertEqual(result["error"]["code"], "MCP_SANDBOX_BLOCKED")
        self.assertFalse(any(event.get("event") == "office_correspondence_saved" for event in stored["history"]))
        self.assertNotIn("office_addin_note", stored["key_facts"])

    def test_outlook_capture_requires_an_existing_selected_matter(self) -> None:
        from agent_network import execute_mcp_skill_sandboxed, get_agent_network

        skill = get_agent_network().skills["update_matter_context"]
        result = execute_mcp_skill_sandboxed(
            skill,
            {
                "matter_id": "missing-outlook-matter",
                "new_facts": {
                    "office_addin_note": "This must not create a matter.",
                    "office_capture": {
                        "surface": "outlook",
                        "capture_kind": "correspondence",
                        "attorney_approved": True,
                        "approval_method": "explicit_save_to_matter_action",
                    },
                },
                "auth_context": TEST_AUTH,
            },
            matter_context={"matter_id": "missing-outlook-matter", "auth_context": TEST_AUTH},
        )

        self.assertEqual(result["status"], "block")
        self.assertEqual(result["error"]["code"], "MCP_SANDBOX_BLOCKED")
        self.assertIsNone(get_matter_context("missing-outlook-matter", tenant_context=TEST_AUTH))

    def test_unapproved_office_capture_is_blocked_without_persistence(self) -> None:
        from agent_network import execute_mcp_skill_sandboxed, get_agent_network

        matter_id = "test-agent-network-unapproved-office-capture"
        update_matter_context(
            {
                "matter_id": matter_id,
                "client_id": "unapproved-office-client",
                "matter_name": "Unapproved Office capture matter",
                "source": "unit_test",
            },
            tenant_context=TEST_AUTH,
        )
        skill = get_agent_network().skills["update_matter_context"]
        result = execute_mcp_skill_sandboxed(
            skill,
            {
                "matter_id": matter_id,
                "new_facts": {"office_addin_note": "Do not persist this text without approval."},
                "auth_context": TEST_AUTH,
            },
            matter_context={"matter_id": matter_id, "auth_context": TEST_AUTH},
        )
        stored = get_matter_context(matter_id, tenant_context=TEST_AUTH)

        self.assertEqual(result["status"], "block")
        self.assertFalse(any(event.get("event") == "office_correspondence_saved" for event in stored["history"]))
        self.assertNotIn("office_addin_note", stored["key_facts"])

    def test_approved_word_context_is_saved_without_generic_fact_mutation(self) -> None:
        from agent_network import execute_mcp_skill_sandboxed, get_agent_network

        matter_id = "test-agent-network-approved-word-context"
        update_matter_context(
            {
                "matter_id": matter_id,
                "client_id": "approved-word-client",
                "matter_name": "Approved Word context matter",
                "source": "unit_test",
            },
            tenant_context=TEST_AUTH,
        )
        skill = get_agent_network().skills["update_matter_context"]
        result = execute_mcp_skill_sandboxed(
            skill,
            {
                "matter_id": matter_id,
                "new_facts": {
                    "office_addin_note": "Selected clause for client@example.com.",
                    "office_capture": {
                        "surface": "word",
                        "capture_kind": "document_context",
                        "attorney_approved": True,
                        "approval_method": "explicit_update_matter_action",
                    },
                },
                "auth_context": TEST_AUTH,
            },
            matter_context={"matter_id": matter_id, "auth_context": TEST_AUTH},
        )
        stored = get_matter_context(matter_id, tenant_context=TEST_AUTH)
        events = [event for event in stored["history"] if event.get("event") == "office_document_context_saved"]

        self.assertEqual(result["status"], "pass")
        self.assertEqual(result["provenance"]["history_event"], "office_document_context_saved")
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["surface"], "word")
        self.assertEqual(events[0]["provenance"]["office_host"], "word")
        self.assertIn("[REDACTED_EMAIL]", events[0]["content"])
        self.assertNotIn("office_addin_note", stored["key_facts"])

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
