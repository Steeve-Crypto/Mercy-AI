from __future__ import annotations

import argparse
import json
import os
from typing import Any

from agent_network import execute_agent_task, mcp_skill_manifest


AGENT_TO_EXPERT = {
    "ResearchAgent": "research",
    "DraftingAgent": "drafting",
    "ComplianceAgent": "compliance_guardrails",
    "CitationVerifierAgent": "citation_verifier",
    "IntakeAgent": "intake",
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Exercise Hermes-powered Mercy expert agents.")
    parser.add_argument("--agent", default="DraftingAgent", choices=sorted(AGENT_TO_EXPERT), help="Specialized agent to run.")
    parser.add_argument("--cycles", type=int, default=3, help="Maximum ReACT cycles.")
    parser.add_argument("--task", default=None, help="Optional task override.")
    parser.add_argument("--use-llm", action="store_true", help="Allow configured Hermes/LiteLLM provider keys.")
    args = parser.parse_args()
    os.environ.setdefault("MERCY_ENV", "local")
    if not args.use_llm:
        for key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "MERCY_LLM_PROVIDER"):
            os.environ[key] = ""
    task = args.task or _default_task(args.agent)
    matter_context = {
        "jurisdiction": "District of Columbia",
        "practice_area": "professional_responsibility",
        "surface_context": "hermes_cli",
        "auth_context": {"tenant_id": "hermes-cli-tenant", "user_id": "hermes-cli-user", "auth_mode": "cli"},
    }
    params: dict[str, Any] = {"cycles": args.cycles, "top_k": 3}
    if args.agent == "DraftingAgent":
        matter_context["key_facts"] = {"objective": "Prepare attorney-review D.C. citation verification language."}
    if args.agent == "CitationVerifierAgent":
        params["law_or_case"] = "D.C. Bar Ethics Op. 388"
    if args.agent == "ComplianceAgent":
        params["draft"] = "Attorney review required. Verify D.C. citations and preserve confidentiality."
    if args.agent == "IntakeAgent":
        params.update({"matter_id": "hermes-cli-matter", "new_facts": {"hermes_test": "Persistent memory check."}})
        matter_context["matter_id"] = "hermes-cli-matter"
    result = execute_agent_task(
        task=task,
        params=params,
        matter_context=matter_context,
        route={
            "expert": AGENT_TO_EXPERT[args.agent],
            "route_mode": "hermes_cli",
            "confidence": 0.98,
            "guardrail_status": "pass",
            "hermes_delegation": {"delegate_to_hermes": True, "selected_layer": "hermes_powered_expert_agent"},
        },
    )
    manifest = mcp_skill_manifest()
    hermes = result.get("hermes") if isinstance(result.get("hermes"), dict) else {}
    reasoning = hermes.get("reasoning") if isinstance(hermes.get("reasoning"), dict) else {}
    reflection = hermes.get("reflection") if isinstance(hermes.get("reflection"), dict) else {}
    print(
        json.dumps(
            {
                "agent": result.get("selected_agent"),
                "expert": result.get("selected_expert"),
                "status": result.get("agent_result", {}).get("status"),
                "cycles_completed": (result.get("react_loop") or {}).get("cycles_completed"),
                "hermes_enabled": manifest["hermes"]["enabled"],
                "hermes_model_status": manifest["hermes"]["models"],
                "hermes_skill_plan": reasoning.get("skill_plan", []),
                "hermes_memory": reflection.get("memory", {}),
                "workflow_improvement": reflection.get("workflow_improvement", {}),
                "domain_learning": reasoning.get("domain_learning", {}),
                "skills_used": result.get("mcp_skills_used", []),
            },
            indent=2,
            sort_keys=True,
        )
    )


def _default_task(agent: str) -> str:
    if agent == "ResearchAgent":
        return "Research official D.C. sources for legal AI citation verification and ethics safeguards."
    if agent == "ComplianceAgent":
        return "Evaluate D.C. attorney supervision and confidentiality safeguards for an AI-assisted draft."
    if agent == "CitationVerifierAgent":
        return "Verify D.C. Bar Ethics Op. 388 and identify official-source grounding."
    if agent == "IntakeAgent":
        return "Improve matter context using Hermes memory from an intake update."
    return "Draft D.C.-specific attorney-review language for citation verification using official sources."


if __name__ == "__main__":
    main()
