from __future__ import annotations

import os
import unittest

from dc_knowledge_rag import retrieve_dc_knowledge
from legal_task_router import moe_route
from observability import (
    TRACE_STORE,
    configure_langsmith_environment,
    langsmith_project_config,
    observability_dashboard,
    trace_event,
)


class ObservabilityTests(unittest.TestCase):
    def setUp(self) -> None:
        TRACE_STORE.clear()

    def test_langsmith_config_uses_environment_shape(self) -> None:
        original_project = os.environ.get("LANGSMITH_PROJECT")
        original_tracing = os.environ.get("LANGSMITH_TRACING")
        try:
            os.environ["LANGSMITH_PROJECT"] = "mercy-test-project"
            os.environ["LANGSMITH_TRACING"] = "true"
            config = langsmith_project_config()

            self.assertTrue(config.tracing_enabled)
            self.assertEqual(config.project_name, "mercy-test-project")
            self.assertIn("LANGSMITH_API_KEY", config.environment_variables)
            self.assertIn("mercy-test-project", config.ui_url)
        finally:
            if original_project is None:
                os.environ.pop("LANGSMITH_PROJECT", None)
            else:
                os.environ["LANGSMITH_PROJECT"] = original_project
            if original_tracing is None:
                os.environ.pop("LANGSMITH_TRACING", None)
            else:
                os.environ["LANGSMITH_TRACING"] = original_tracing

    def test_dashboard_tracks_router_rag_guardrails_and_latency(self) -> None:
        configure_langsmith_environment()
        decision = moe_route(
            "Draft D.C. attorney review notes for an AI-generated brief.",
            {
                "jurisdiction": "District of Columbia",
                "facts": {"task": "AI-assisted appellate drafting"},
                "surface_context": "mercy_legal_web",
            },
        )
        retrieval = retrieve_dc_knowledge(
            "What D.C. ethics sources should ground AI drafting review?",
            matter_context={"jurisdiction": "District of Columbia", "surface_context": "mercy_legal_plugin"},
            route=decision.to_dict(),
        )
        trace_event(
            "manual_latency_sample",
            surface_context="mercy_legal_plugin",
            category="manual",
            metadata={"surface": "word_addin"},
        )

        dashboard = observability_dashboard()

        self.assertGreaterEqual(dashboard["summary"]["trace_count"], 3)
        self.assertTrue(dashboard["router_decisions"])
        self.assertTrue(dashboard["rag_retrieval_quality"])
        self.assertIn("mercy_legal_plugin", dashboard["latency_by_surface"])
        self.assertTrue(dashboard["langsmith"]["project_name"])
        self.assertTrue(retrieval["results"])

    def test_trace_metadata_redacts_raw_matter_document_and_prompt_text(self) -> None:
        trace_event(
            "raw_text_redaction_sample",
            surface_context="unit_test",
            category="telemetry",
            metadata={
                "matter_id": "matter-safe-id",
                "document_id": "doc-safe-id",
                "prompt": "raw client prompt should not be retained",
                "document_text": "raw document text should not be retained",
                "nested": {
                    "client_facts": "private matter facts",
                    "prompt_text": "nested prompt text",
                    "count": 2,
                },
            },
        )

        payload = observability_dashboard(limit=10)
        serialized = str(payload)
        self.assertIn("matter-safe-id", serialized)
        self.assertIn("doc-safe-id", serialized)
        self.assertNotIn("raw client prompt", serialized)
        self.assertNotIn("raw document text", serialized)
        self.assertNotIn("private matter facts", serialized)
        self.assertNotIn("nested prompt text", serialized)


if __name__ == "__main__":
    unittest.main()
