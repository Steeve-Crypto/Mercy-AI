from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any, Callable

from dc_guardrails import evaluate_dc_guardrails
from dc_knowledge_rag import retrieve_dc_knowledge
from mercy_context import get_matter_context, update_matter_context as persist_matter_context
from observability import trace_event, trace_span
from ragas_eval import METRICS as RAGAS_METRICS

try:
    from langgraph.graph import END, StateGraph  # type: ignore

    LANGGRAPH_AVAILABLE = True
except Exception:
    END = "__end__"
    StateGraph = None
    LANGGRAPH_AVAILABLE = False


AGENT_NETWORK_VERSION = "agent-network-langgraph-1.0"
MCP_MANIFEST_VERSION = "mcp-skill-manifest-1.0"
SUPPORTED_EXPERTS = {
    "research": "ResearchAgent",
    "drafting": "DraftingAgent",
    "compliance_guardrails": "ComplianceAgent",
    "intake": "IntakeAgent",
    "citation_verifier": "CitationVerifierAgent",
}


@dataclass
class MCPSkill:
    name: str
    description: str
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    handler: Callable[..., dict[str, Any]] = field(repr=False)
    tags: list[str] = field(default_factory=list)

    def metadata(self) -> dict[str, Any]:
        payload = asdict(self)
        payload.pop("handler", None)
        payload["mcp_compatible"] = True
        return payload


def _json_schema(properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": properties,
        "required": required,
    }


def _skill_output_schema(properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    base = {
        "skill_name": {"type": "string"},
        "status": {"type": "string", "enum": ["pass", "warn", "block"]},
        "human_review_required": {"type": "boolean"},
        "citations": {"type": "array", "items": {"type": "object"}},
        "provenance": {"type": "object"},
    }
    return _json_schema({**base, **properties}, ["skill_name", "status", "human_review_required", *(required or [])])


def _ragas_hook() -> dict[str, Any]:
    return {
        "available": True,
        "endpoint": "/v1/rag/evaluate",
        "metrics": list(RAGAS_METRICS),
        "mode": "local_deterministic_ci_ready",
    }


def _grounding_policy(status: str, issues: list[str] | None = None) -> dict[str, Any]:
    return {
        "status": status,
        "strict_grounding": True,
        "no_unverified_output": status == "pass",
        "issues": issues or [],
        "instruction": "Do not rely on this output until D.C. counsel verifies official sources, quotes, and record support.",
    }


def _auth_context_from(context: dict[str, Any] | None, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
    for candidate in (params, context):
        if isinstance(candidate, dict) and isinstance(candidate.get("auth_context"), dict):
            return candidate["auth_context"]
    if isinstance(context, dict) and context.get("tenant_id") and context.get("user_id"):
        return {
            "tenant_id": context["tenant_id"],
            "user_id": context["user_id"],
            "auth_mode": context.get("auth_mode") or "unknown",
        }
    if isinstance(params, dict) and params.get("tenant_id") and params.get("user_id"):
        return {
            "tenant_id": params["tenant_id"],
            "user_id": params["user_id"],
            "auth_mode": params.get("auth_mode") or "unknown",
        }
    return None


def _matter_context(
    matter_id: str | None,
    context: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    auth_context = _auth_context_from(context, params)
    stored = get_matter_context(matter_id, tenant_context=auth_context) if matter_id else None
    return {**(stored or {}), **(context or {})}


def _citations_from_retrieval(retrieval: dict[str, Any]) -> list[dict[str, Any]]:
    return [citation for citation in retrieval.get("citations") or [] if isinstance(citation, dict)]


def _status_from_guardrails(guardrails: dict[str, Any]) -> str:
    if guardrails.get("status") == "pass":
        return "pass"
    return "warn"


def _citation_label(law_or_case: str, retrieval: dict[str, Any]) -> str:
    citations = _citations_from_retrieval(retrieval)
    if citations:
        return str(citations[0].get("label") or law_or_case)
    return law_or_case.strip() or "[VERIFY CITE]"


def cite_and_verify(law_or_case: str, matter_context: dict[str, Any] | None = None) -> dict[str, Any]:
    with trace_span("mcp_cite_and_verify", "agent_network", "agent_skill") as span:
        retrieval = retrieve_dc_knowledge(
            query=f"Verify D.C. grounding and citation status for {law_or_case}",
            matter_context=matter_context or {"jurisdiction": "District of Columbia"},
            top_k=3,
            route={"expert": "citation_verifier", "route_mode": "source_verification"},
            agentic=True,
        )
        citations = _citations_from_retrieval(retrieval)
        issues = []
        if not citations:
            issues.append("no_candidate_grounding_found")
        if any(citation.get("verification_status") != "official_metadata_unquoted" for citation in citations):
            issues.append("non_official_or_unverified_candidate_present")
        status = "pass" if citations and not issues else "warn"
        result = {
            "skill_name": "cite_and_verify",
            "status": status,
            "verified_citation": {
                "label": _citation_label(law_or_case, retrieval),
                "verification_status": "candidate_grounded_requires_attorney_verification",
                "dc_grounded": bool(citations),
            },
            "dc_grounding": retrieval.get("results", []),
            "citations": citations,
            "provenance": {"retrieval": retrieval.get("backend_status"), "rag_version": retrieval.get("rag_version")},
            "grounding_policy": _grounding_policy(status, issues),
            "ragas_eval_hook": _ragas_hook(),
            "human_review_required": True,
        }
        span["metadata"] = {"skill": "cite_and_verify", "status": status, "citation_count": len(citations)}
        span["rag"] = retrieval
        return result


def check_dc_ethics(query: str, draft: str) -> dict[str, Any]:
    with trace_span("mcp_check_dc_ethics", "agent_network", "agent_skill") as span:
        guardrails = evaluate_dc_guardrails(
            {
                "draft": draft or query,
                "draft_type": "agent_network_output",
                "human_review_required": True,
            }
        )
        retrieval = retrieve_dc_knowledge(
            query=f"D.C. ethics compliance for: {query}",
            matter_context={"jurisdiction": "District of Columbia"},
            top_k=3,
            route={"expert": "compliance_guardrails", "route_mode": "compliance_check"},
            agentic=True,
        )
        review_flags = guardrails.get("review_flags", [])
        score = max(0.0, round(1.0 - (len(review_flags) * 0.08), 2))
        status = _status_from_guardrails(guardrails)
        result = {
            "skill_name": "check_dc_ethics",
            "status": status,
            "ethics_compliance_score": score,
            "dc_rules_flags": review_flags,
            "guardrails": guardrails,
            "citations": _citations_from_retrieval(retrieval),
            "provenance": {"guardrail_schema": guardrails.get("schema"), "rag_version": retrieval.get("rag_version")},
            "grounding_policy": _grounding_policy(status, review_flags),
            "human_review_required": True,
        }
        span["metadata"] = {"skill": "check_dc_ethics", "status": status, "score": score}
        span["rag"] = retrieval
        return result


def update_matter_context(
    matter_id: str,
    new_facts: dict[str, Any],
    auth_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    with trace_span("mcp_update_matter_context", "agent_network", "agent_skill", matter_reference=matter_id) as span:
        updated = persist_matter_context(
            {
                "matter_id": matter_id,
                "key_facts": new_facts,
                "facts": new_facts,
                "source": "agent_network_mcp_skill",
                "history": [
                    {
                        "event": "agent_network_mcp_update",
                        "timestamp": datetime.now(UTC).isoformat(),
                        "source": "update_matter_context",
                    }
                ],
            },
            tenant_context=auth_context,
        )
        result = {
            "skill_name": "update_matter_context",
            "status": "pass",
            "matter_context": updated,
            "citations": [],
            "provenance": {"matter_id": matter_id, "storage_mode": "local_nonpersistent_by_default"},
            "grounding_policy": _grounding_policy("pass"),
            "human_review_required": True,
        }
        span["metadata"] = {
            "skill": "update_matter_context",
            "matter_id": matter_id,
            "tenant_id": (auth_context or {}).get("tenant_id"),
            "user_id": (auth_context or {}).get("user_id"),
        }
        return result


def export_to_word(content: str, format: str = "docx") -> dict[str, Any]:
    with trace_span("mcp_export_to_word", "agent_network", "agent_skill") as span:
        normalized_format = format.lower().strip() or "docx"
        supported = normalized_format in {"docx", "html", "text"}
        status = "pass" if supported and bool(content.strip()) else "block"
        payload_type = "ooxml" if normalized_format == "docx" else normalized_format
        result = {
            "skill_name": "export_to_word",
            "status": status,
            "format": normalized_format,
            "office_js_payload": {
                "coercion_type": payload_type,
                "content": content,
                "insert_mode": "replace_selection",
                "requires_word_api": True,
            },
            "file": None,
            "citations": [],
            "provenance": {"target_surface": "office_word_addin", "generated_file": False},
            "grounding_policy": _grounding_policy(status, [] if status == "pass" else ["empty_or_unsupported_export"]),
            "human_review_required": True,
        }
        span["metadata"] = {"skill": "export_to_word", "status": status, "format": normalized_format}
        return result


def _skill_registry() -> dict[str, MCPSkill]:
    return {
        "cite_and_verify": MCPSkill(
            name="cite_and_verify",
            description="Verify candidate D.C. legal citation grounding with provenance and attorney-review flags.",
            input_schema=_json_schema(
                {
                    "law_or_case": {"type": "string", "minLength": 1},
                    "matter_context": {"type": "object"},
                },
                ["law_or_case"],
            ),
            output_schema=_skill_output_schema(
                {
                    "verified_citation": {"type": "object"},
                    "dc_grounding": {"type": "array", "items": {"type": "object"}},
                    "grounding_policy": {"type": "object"},
                    "ragas_eval_hook": {"type": "object"},
                },
                ["verified_citation", "grounding_policy"],
            ),
            handler=cite_and_verify,
            tags=["citation", "dc_grounding", "rag"],
        ),
        "check_dc_ethics": MCPSkill(
            name="check_dc_ethics",
            description="Run D.C. legal ethics and guardrail review over a query and draft.",
            input_schema=_json_schema(
                {
                    "query": {"type": "string"},
                    "draft": {"type": "string"},
                },
                ["query", "draft"],
            ),
            output_schema=_skill_output_schema(
                {
                    "ethics_compliance_score": {"type": "number"},
                    "dc_rules_flags": {"type": "array", "items": {"type": "string"}},
                    "guardrails": {"type": "object"},
                    "grounding_policy": {"type": "object"},
                },
                ["ethics_compliance_score", "dc_rules_flags"],
            ),
            handler=check_dc_ethics,
            tags=["compliance", "ethics_388", "dc_rules"],
        ),
        "update_matter_context": MCPSkill(
            name="update_matter_context",
            description="Update shared matter context state with new structured facts.",
            input_schema=_json_schema(
                {
                    "matter_id": {"type": "string", "minLength": 1},
                    "new_facts": {"type": "object"},
                    "auth_context": {"type": "object"},
                },
                ["matter_id", "new_facts"],
            ),
            output_schema=_skill_output_schema(
                {
                    "matter_context": {"type": "object"},
                    "grounding_policy": {"type": "object"},
                },
                ["matter_context"],
            ),
            handler=update_matter_context,
            tags=["matter_context", "state"],
        ),
        "export_to_word": MCPSkill(
            name="export_to_word",
            description="Create an Office.js-ready Word insertion payload from grounded content.",
            input_schema=_json_schema(
                {
                    "content": {"type": "string"},
                    "format": {"type": "string", "enum": ["docx", "html", "text"]},
                },
                ["content"],
            ),
            output_schema=_skill_output_schema(
                {
                    "format": {"type": "string"},
                    "office_js_payload": {"type": "object"},
                    "file": {"type": ["object", "null"]},
                    "grounding_policy": {"type": "object"},
                },
                ["office_js_payload"],
            ),
            handler=export_to_word,
            tags=["office", "word_addin", "export"],
        ),
    }


class BaseLegalAgent:
    expert: str = "base"
    name: str = "BaseLegalAgent"
    description: str = "Base legal agent."
    skill_names: tuple[str, ...] = ()

    def __init__(self, skills: dict[str, MCPSkill]) -> None:
        self.skills = skills

    def execute(self, state: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    def metadata(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "expert": self.expert,
            "description": self.description,
            "skills": list(self.skill_names),
        }

    def _call_skill(self, name: str, **kwargs: Any) -> dict[str, Any]:
        skill = self.skills[name]
        return skill.handler(**kwargs)


class ResearchAgent(BaseLegalAgent):
    expert = "research"
    name = "ResearchAgent"
    description = "Retrieves D.C. legal grounding with citation provenance."
    skill_names = ("cite_and_verify", "check_dc_ethics")

    def execute(self, state: dict[str, Any]) -> dict[str, Any]:
        task = state["task"]
        context = state["matter_context"]
        retrieval = retrieve_dc_knowledge(
            query=task,
            matter_context=context,
            top_k=int(state["params"].get("top_k") or 5),
            route=state["route"],
            agentic=True,
        )
        citation_check = self._call_skill("cite_and_verify", law_or_case=task, matter_context=context)
        return {
            "agent": self.name,
            "status": retrieval.get("verification", {}).get("status") or "warn",
            "answer": _grounded_research_summary(retrieval),
            "skills_used": ["cite_and_verify"],
            "skill_results": [citation_check],
            "rag": retrieval,
            "citations": retrieval.get("citations") or citation_check.get("citations") or [],
            "grounding_policy": _grounding_policy("pass" if retrieval.get("results") else "block"),
            "ragas_eval_hook": _ragas_hook(),
        }


class DraftingAgent(BaseLegalAgent):
    expert = "drafting"
    name = "DraftingAgent"
    description = "Creates attorney-review drafting scaffolds grounded in retrieved D.C. context."
    skill_names = ("cite_and_verify", "check_dc_ethics", "export_to_word")

    def execute(self, state: dict[str, Any]) -> dict[str, Any]:
        task = state["task"]
        context = state["matter_context"]
        retrieval = retrieve_dc_knowledge(
            query=task,
            matter_context=context,
            top_k=int(state["params"].get("top_k") or 4),
            route=state["route"],
            agentic=True,
        )
        draft = _grounded_draft(task, context, retrieval)
        ethics = self._call_skill("check_dc_ethics", query=task, draft=draft)
        export = self._call_skill("export_to_word", content=draft, format=str(state["params"].get("format") or "docx"))
        status = "block" if not retrieval.get("results") else ethics.get("status", "warn")
        return {
            "agent": self.name,
            "status": status,
            "draft": draft,
            "skills_used": ["check_dc_ethics", "export_to_word"],
            "skill_results": [ethics, export],
            "rag": retrieval,
            "citations": retrieval.get("citations") or [],
            "grounding_policy": _grounding_policy(status, [] if retrieval.get("results") else ["no_grounding_for_draft"]),
            "ragas_eval_hook": _ragas_hook(),
        }


class ComplianceAgent(BaseLegalAgent):
    expert = "compliance_guardrails"
    name = "ComplianceAgent"
    description = "Reviews outputs for D.C. ethics, confidentiality, supervision, and verification flags."
    skill_names = ("check_dc_ethics",)

    def execute(self, state: dict[str, Any]) -> dict[str, Any]:
        params = state["params"]
        draft = str(params.get("draft") or params.get("content") or state["task"])
        ethics = self._call_skill("check_dc_ethics", query=state["task"], draft=draft)
        return {
            "agent": self.name,
            "status": ethics["status"],
            "compliance": ethics,
            "skills_used": ["check_dc_ethics"],
            "skill_results": [ethics],
            "citations": ethics.get("citations") or [],
            "grounding_policy": ethics["grounding_policy"],
        }


class IntakeAgent(BaseLegalAgent):
    expert = "intake"
    name = "IntakeAgent"
    description = "Updates shared matter state and identifies intake readiness gaps."
    skill_names = ("update_matter_context", "check_dc_ethics")

    def execute(self, state: dict[str, Any]) -> dict[str, Any]:
        matter_id = str(state["params"].get("matter_id") or state["matter_context"].get("matter_id") or "")
        new_facts = state["params"].get("new_facts")
        if not isinstance(new_facts, dict):
            new_facts = {"agent_task": state["task"]}
        if not matter_id:
            return {
                "agent": self.name,
                "status": "block",
                "skills_used": [],
                "skill_results": [],
                "citations": [],
                "grounding_policy": _grounding_policy("block", ["matter_id_required"]),
                "missing_inputs": ["matter_id"],
            }
        update_result = self._call_skill(
            "update_matter_context",
            matter_id=matter_id,
            new_facts=new_facts,
            auth_context=_auth_context_from(state["matter_context"], state["params"]),
        )
        return {
            "agent": self.name,
            "status": update_result["status"],
            "matter_context": update_result["matter_context"],
            "skills_used": ["update_matter_context"],
            "skill_results": [update_result],
            "citations": [],
            "grounding_policy": update_result["grounding_policy"],
        }


class CitationVerifierAgent(BaseLegalAgent):
    expert = "citation_verifier"
    name = "CitationVerifierAgent"
    description = "Verifies candidate citation grounding and provenance before use."
    skill_names = ("cite_and_verify",)

    def execute(self, state: dict[str, Any]) -> dict[str, Any]:
        law_or_case = str(state["params"].get("law_or_case") or state["task"])
        citation = self._call_skill("cite_and_verify", law_or_case=law_or_case, matter_context=state["matter_context"])
        return {
            "agent": self.name,
            "status": citation["status"],
            "verification": citation,
            "skills_used": ["cite_and_verify"],
            "skill_results": [citation],
            "citations": citation.get("citations") or [],
            "grounding_policy": citation["grounding_policy"],
        }


class AgentNetwork:
    def __init__(self) -> None:
        self.skills = _skill_registry()
        self.agents: dict[str, BaseLegalAgent] = {
            "research": ResearchAgent(self.skills),
            "drafting": DraftingAgent(self.skills),
            "compliance_guardrails": ComplianceAgent(self.skills),
            "intake": IntakeAgent(self.skills),
            "citation_verifier": CitationVerifierAgent(self.skills),
        }
        self._graph = self._build_langgraph()

    def manifest(self) -> dict[str, Any]:
        return {
            "manifest_version": MCP_MANIFEST_VERSION,
            "agent_network_version": AGENT_NETWORK_VERSION,
            "langgraph": {
                "available": LANGGRAPH_AVAILABLE,
                "runtime": "native_state_graph" if LANGGRAPH_AVAILABLE else "compatible_deterministic_state_graph",
            },
            "agents": [agent.metadata() for agent in self.agents.values()],
            "skills": [skill.metadata() for skill in self.skills.values()],
            "strict_grounding": True,
            "langsmith_tracing": True,
        }

    def execute(
        self,
        task: str,
        params: dict[str, Any] | None = None,
        matter_context: dict[str, Any] | None = None,
        route: dict[str, Any] | None = None,
        user_type: str = "solo",
    ) -> dict[str, Any]:
        from legal_task_router import moe_route

        params = params or {}
        context = _matter_context(
            str(params.get("matter_id") or (matter_context or {}).get("matter_id") or ""),
            matter_context,
            params,
        )
        context.setdefault("surface_context", params.get("surface_context") or "agent_network")
        route = route or moe_route(task, context, user_type=user_type).to_dict()
        expert = str(route.get("expert") or "compliance_guardrails")
        agent = self.agents.get(expert) or self.agents["compliance_guardrails"]

        with trace_span("agent_network_execute", str(context.get("surface_context") or "agent_network"), "agent", route=route, matter_reference=context.get("matter_id")) as span:
            state = {
                "task": task,
                "params": params,
                "matter_context": context,
                "route": route,
                "user_type": user_type,
                "selected_agent": agent.name,
            }
            result = self._run_graph(state, agent)
            status = str(result.get("status") or "warn")
            response = {
                "agent_network_version": AGENT_NETWORK_VERSION,
                "langgraph_runtime": self.manifest()["langgraph"],
                "selected_agent": agent.name,
                "selected_expert": expert,
                "task": task,
                "params": _safe_params(params),
                "agent_result": result,
                "mcp_skills_used": result.get("skills_used", []),
                "mcp_skill_results": result.get("skill_results", []),
                "citations": result.get("citations", []),
                "grounding_policy": result.get("grounding_policy") or _grounding_policy(status),
                "human_review_required": True,
                "executed_at": datetime.now(UTC).isoformat(),
            }
            span["route"] = route
            span["rag"] = result.get("rag") if isinstance(result.get("rag"), dict) else None
            span["metadata"] = {"agent": agent.name, "status": status, "skill_count": len(response["mcp_skills_used"])}
            trace_event(
                name="agent_network_result",
                surface_context=str(context.get("surface_context") or "agent_network"),
                category="agent",
                route=route,
                rag=result.get("rag") if isinstance(result.get("rag"), dict) else None,
                guardrail_status=status if status in {"pass", "warn", "block"} else route.get("guardrail_status"),
                matter_reference=context.get("matter_id"),
                metadata={"agent": agent.name, "skills": response["mcp_skills_used"]},
            )
            return response

    def _build_langgraph(self) -> Any:
        if not LANGGRAPH_AVAILABLE or StateGraph is None:
            return None
        try:
            graph = StateGraph(dict)
            graph.add_node("agent", lambda state: {**state, "agent_result": state["agent"].execute(state)})
            graph.set_entry_point("agent")
            graph.add_edge("agent", END)
            return graph.compile()
        except Exception:
            return None

    def _run_graph(self, state: dict[str, Any], agent: BaseLegalAgent) -> dict[str, Any]:
        if self._graph is not None:
            try:
                graph_state = self._graph.invoke({**state, "agent": agent})
                if isinstance(graph_state, dict) and isinstance(graph_state.get("agent_result"), dict):
                    return graph_state["agent_result"]
            except Exception:
                pass
        return agent.execute(state)


_NETWORK: AgentNetwork | None = None


def get_agent_network() -> AgentNetwork:
    global _NETWORK
    if _NETWORK is None:
        _NETWORK = AgentNetwork()
    return _NETWORK


def mcp_skill_manifest() -> dict[str, Any]:
    return get_agent_network().manifest()


def execute_agent_task(
    task: str,
    params: dict[str, Any] | None = None,
    matter_context: dict[str, Any] | None = None,
    route: dict[str, Any] | None = None,
    user_type: str = "solo",
) -> dict[str, Any]:
    return get_agent_network().execute(
        task=task,
        params=params,
        matter_context=matter_context,
        route=route,
        user_type=user_type,
    )


def _grounded_research_summary(retrieval: dict[str, Any]) -> str:
    results = retrieval.get("results") or []
    if not results:
        return "No D.C. grounding was retrieved. Do not answer substantively until official sources are supplied."
    lines = []
    for result in results[:3]:
        citation = result.get("citation", {}).get("label") or "[VERIFY CITE]"
        summary = result.get("summary") or "Candidate source requires attorney verification."
        lines.append(f"{summary} Source: {citation}.")
    return " ".join(lines)


def _grounded_draft(task: str, context: dict[str, Any], retrieval: dict[str, Any]) -> str:
    results = retrieval.get("results") or []
    if not results:
        return "[BLOCKED: No verified D.C. grounding retrieved. Attorney must supply sources before drafting.]"
    facts = context.get("facts") if isinstance(context.get("facts"), dict) else context.get("key_facts", {})
    fact_summary = "; ".join(f"{key}: {value}" for key, value in list((facts or {}).items())[:4]) or "facts pending"
    authorities = "; ".join(result.get("citation", {}).get("label", "[VERIFY CITE]") for result in results[:3])
    return (
        "Attorney-review draft scaffold:\n"
        f"Task: {task}\n"
        f"Matter facts: {fact_summary}\n"
        f"Grounding to verify: {authorities}\n"
        "Draft note: Use the retrieved authorities only after attorney verification of official text, current validity, "
        "pinpoint support, and record citations."
    )


def _safe_params(params: dict[str, Any]) -> dict[str, Any]:
    blocked = {"document_text", "selected_text", "draft", "content"}
    return {key: value for key, value in params.items() if key not in blocked}


__all__ = [
    "AGENT_NETWORK_VERSION",
    "CitationVerifierAgent",
    "ComplianceAgent",
    "DraftingAgent",
    "IntakeAgent",
    "ResearchAgent",
    "cite_and_verify",
    "check_dc_ethics",
    "execute_agent_task",
    "export_to_word",
    "get_agent_network",
    "mcp_skill_manifest",
    "update_matter_context",
]
