from __future__ import annotations

import os
import unittest
from unittest.mock import patch

import llm_providers
from llm_providers import (
    ATTORNEY_REVIEW_DISCLAIMER,
    classify_moe_route,
    generate_legal_draft,
    llm_provider_status,
)


class FakeMessage:
    content = '{"expert":"drafting","confidence":0.93,"route_mode":"drafting","reasons":["drafting request"]}'


class FakeChoice:
    message = FakeMessage()


class FakeResponse:
    choices = [FakeChoice()]
    usage = {"prompt_tokens": 100, "completion_tokens": 30}


class LLMProviderTests(unittest.TestCase):
    def test_provider_status_uses_template_fallback_without_keys(self) -> None:
        with patch.dict(
            os.environ,
            {"OPENAI_API_KEY": "", "ANTHROPIC_API_KEY": "", "GROQ_API_KEY": "", "GEMINI_API_KEY": ""},
        ):
            status = llm_provider_status()

        self.assertIn("fallback_active", status)
        self.assertFalse(status["active"])
        self.assertEqual(status["fallback_reason"], "no_provider_api_key_configured" if status["litellm_available"] else "litellm_unavailable")

    def test_legal_draft_uses_structured_fallback_without_grounding(self) -> None:
        result = generate_legal_draft(
            task="Draft a D.C. review clause.",
            matter_context={"jurisdiction": "District of Columbia"},
            retrieval={"results": []},
            route={"expert": "drafting"},
            fallback=f"{ATTORNEY_REVIEW_DISCLAIMER}\n\nFallback draft.",
        )

        self.assertFalse(result.used_llm)
        self.assertEqual(result.fallback_reason, "no_retrieved_official_sources")
        self.assertIn(ATTORNEY_REVIEW_DISCLAIMER, result.content)

    def test_router_classification_uses_litellm_when_key_configured(self) -> None:
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key", "MERCY_LLM_PROVIDER": "openai"}):
            with patch.object(llm_providers, "completion", return_value=FakeResponse()):
                with patch.object(llm_providers, "completion_cost", return_value=0.001):
                    result = classify_moe_route(
                        query="Draft a D.C. motion.",
                        matter_context={"jurisdiction": "District of Columbia"},
                        candidates=[{"expert": "drafting", "confidence": 0.9}],
                        fallback_expert="drafting",
                    )

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["expert"], "drafting")
        self.assertTrue(result["llm"]["used_llm"])
        self.assertEqual(result["llm"]["provider"], "openai")
        self.assertEqual(result["llm"]["estimated_cost_usd"], 0.001)


if __name__ == "__main__":
    unittest.main()
