from __future__ import annotations

import argparse
import json
import os
from typing import Any

from agent_network import execute_agent_task


AGENT_TO_EXPERT = {
    "ResearchAgent": "research",
    "DraftingAgent": "drafting",
    "ComplianceAgent": "compliance_guardrails",
    "CitationVerifierAgent": "citation_verifier",
    "IntakeAgent": "intake",
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Exercise Mercy ReACT agent cycles with sandboxed MCP skills.")
    parser.add_argument("--agent", default="ResearchAgent", choices=sorted(AGENT_TO_EXPERT), help="Specialized agent class to run.")
    parser.add_argument("--cycles", type=int, default=3, help="Maximum ReACT cycles to allow.")
    parser.add_argument("--task", default=None, help="Optional task override.")
    parser.add_argument("--use-llm", action="store_true", help="Allow configured LLM provider keys during the smoke run.")
    args = parser.parse_args()
    os.environ.setdefault("MERCY_ENV", "local")
    if not args.use_llm:
        for key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY", "MERCY_LLM_PROVIDER"):
            os.environ[key] = ""
    task = args.task or _default_task(args.agent)
    matter_context = {
        "jurisdiction": "District of Columbia",
        "practice_area": "professional_responsibility",
        "surface_context": "agent_react_cli",
        "auth_context": {"tenant_id": "react-cli-tenant", "user_id": "react-cli-user", "auth_mode": "cli"},
    }
    params: dict[str, Any] = {"cycles": args.cycles, "top_k": 3}
    if args.agent == "CitationVerifierAgent":
        params["law_or_case"] = "D.C. Bar Ethics Op. 388"
    if args.agent == "IntakeAgent":
        params.update({"matter_id": "react-cli-matter", "new_facts": {"cli_react_test": "Sandboxed ReACT check."}})
        matter_context["matter_id"] = "react-cli-matter"
    if args.agent == "ComplianceAgent":
        params["draft"] = "Attorney review required. Verify all D.C. citations before use."
    result = execute_agent_task(
        task=task,
        params=params,
        matter_context=matter_context,
        route={"expert": AGENT_TO_EXPERT[args.agent], "route_mode": "react_cli", "confidence": 0.98, "guardrail_status": "pass"},
    )
    react = result.get("react_loop") if isinstance(result.get("react_loop"), dict) else {}
    print(
        json.dumps(
            {
                "agent": result.get("selected_agent"),
                "expert": result.get("selected_expert"),
                "status": result.get("agent_result", {}).get("status"),
                "react_enabled": bool(react.get("enabled")),
                "cycles_completed": react.get("cycles_completed"),
                "step_count": len(react.get("steps") or []),
                "skills_used": result.get("mcp_skills_used", []),
                "sandbox_statuses": [
                    (item.get("sandbox") or {}).get("status")
                    for item in result.get("mcp_skill_results", [])
                    if isinstance(item, dict)
                ],
                "citations": result.get("citations", []),
            },
            indent=2,
            sort_keys=True,
        )
    )


def _default_task(agent: str) -> str:
    if agent == "DraftingAgent":
        return "Draft D.C. attorney-review language for citation verification."
    if agent == "ComplianceAgent":
        return "Review this D.C. legal draft for professional responsibility issues."
    if agent == "CitationVerifierAgent":
        return "Verify citation status for D.C. Bar Ethics Op. 388."
    if agent == "IntakeAgent":
        return "Update matter context with a new intake fact."
    return "Research D.C. legal AI citation and ethics grounding for solo attorneys."


if __name__ == "__main__":
    main()
