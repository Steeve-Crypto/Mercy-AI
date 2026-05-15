from __future__ import annotations

import os
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from importlib import metadata
from typing import Any, Callable

from dc_guardrails import evaluate_dc_guardrails
from dc_knowledge_rag import rag_backend_status, retrieve_dc_knowledge
from hermes_intelligence import HermesAgent, hermes_status
from llm_providers import generate_legal_draft, generate_research_answer, llm_provider_status
from mercy_context import get_matter_context, set_langgraph_runtime, update_matter_context as persist_matter_context
from mercy_storage import persistent_storage_configured, record_langgraph_checkpoint
from observability import trace_event, trace_span
from prompts.registry import get_prompt_registry, prompt_registry_status
from ragas_eval import METRICS as RAGAS_METRICS
from security_controls import sanitize_payload

try:
    from langgraph.graph import END, StateGraph  # type: ignore

    LANGGRAPH_AVAILABLE = True
    LANGGRAPH_IMPORT_ERROR = None
except Exception:
    END = "__end__"
    StateGraph = None
    LANGGRAPH_AVAILABLE = False
    LANGGRAPH_IMPORT_ERROR = "langgraph_import_failed"


AGENT_NETWORK_VERSION = "agent-network-langgraph-1.0"
MCP_MANIFEST_VERSION = "mcp-skill-manifest-1.0"
REACT_LOOP_VERSION = "agent-react-langgraph-cycles-1.0"
MCP_SANDBOX_VERSION = "mcp-secure-sandbox-1.0"
SUPPORTED_EXPERTS = {
    "research": "ResearchAgent",
    "drafting": "DraftingAgent",
    "compliance_guardrails": "ComplianceAgent",
    "intake": "IntakeAgent",
    "citation_verifier": "CitationVerifierAgent",
}


class LangGraphRuntimeUnavailable(RuntimeError):
    pass


def _local_langgraph_fallback_allowed() -> bool:
    return os.getenv("MERCY_ENV") == "local" or os.getenv("MERCY_AUTH_MODE") == "dev"


def _package_version(package_name: str) -> str | None:
    try:
        return metadata.version(package_name)
    except metadata.PackageNotFoundError:
        return None


def langgraph_runtime_metadata(graph_compiled: bool = False) -> dict[str, Any]:
    fallback_allowed = _local_langgraph_fallback_allowed()
    if LANGGRAPH_AVAILABLE:
        return {
            "available": True,
            "runtime": "native_state_graph" if graph_compiled else "native_state_graph_imported",
            "version": _package_version("langgraph"),
            "checkpoint_version": _package_version("langgraph-checkpoint"),
            "langchain_core_version": _package_version("langchain-core"),
            "fallback_allowed": fallback_allowed,
            "fallback_active": False,
            "compile_status": "compiled" if graph_compiled else "pending",
        }
    return {
        "available": False,
        "runtime": "compatible_deterministic_state_graph" if fallback_allowed else "unavailable",
        "version": None,
        "checkpoint_version": _package_version("langgraph-checkpoint"),
        "langchain_core_version": _package_version("langchain-core"),
        "fallback_allowed": fallback_allowed,
        "fallback_active": fallback_allowed,
        "compile_status": "fallback" if fallback_allowed else "blocked",
        "error": LANGGRAPH_IMPORT_ERROR,
    }


def _enforce_langgraph_runtime_policy() -> None:
    if LANGGRAPH_AVAILABLE or _local_langgraph_fallback_allowed():
        return
    raise LangGraphRuntimeUnavailable(
        "LangGraph is required when MERCY_ENV is not 'local' and MERCY_AUTH_MODE is not 'dev'. "
        "Install langgraph, langgraph-checkpoint, and langchain-core or run only in explicit local/dev mode."
    )


_enforce_langgraph_runtime_policy()


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
        payload["sandbox_status"] = _sandbox_status(self.name)
        payload["react_enabled"] = True
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


def _sandbox_status(skill_name: str) -> dict[str, Any]:
    return {
        "version": MCP_SANDBOX_VERSION,
        "enabled": True,
        "skill_name": skill_name,
        "execution_environment": "restricted_in_process_allowlisted_handler",
        "arbitrary_code_execution": False,
        "input_validation": "json_schema_required_fields_and_no_extra_properties",
        "output_validation": "required_status_skill_name_human_review_citations_provenance",
        "sanitization": "security_controls.sanitize_payload",
        "failure_mode": "blocked_skill_result_with_user_safe_message",
    }


def execute_mcp_skill_sandboxed(skill: MCPSkill, arguments: dict[str, Any], *, matter_context: dict[str, Any] | None = None) -> dict[str, Any]:
    safe_arguments = sanitize_payload(arguments)
    with trace_span(
        "mcp_sandbox_execute",
        "agent_network",
        "agent_skill",
        metadata={"skill": skill.name, "sandbox_version": MCP_SANDBOX_VERSION},
    ) as span:
        try:
            _validate_skill_input(skill, safe_arguments)
            result = skill.handler(**safe_arguments)
            safe_result = sanitize_payload(result)
            _validate_skill_output(skill, safe_result)
            safe_result["sandbox"] = {
                **_sandbox_status(skill.name),
                "status": "pass",
                "tenant_id": ((matter_context or {}).get("auth_context") or {}).get("tenant_id") if isinstance((matter_context or {}).get("auth_context"), dict) else (matter_context or {}).get("tenant_id"),
            }
            span["metadata"] = {"skill": skill.name, "sandbox_status": "pass"}
            return safe_result
        except Exception as exc:
            safe_message = _sandbox_error_message(skill.name, exc)
            blocked = {
                "skill_name": skill.name,
                "status": "block",
                "human_review_required": True,
                "citations": [],
                "provenance": {"sandbox_version": MCP_SANDBOX_VERSION},
                "grounding_policy": _grounding_policy("block", ["sandbox_execution_blocked"]),
                "error": {
                    "code": "MCP_SANDBOX_BLOCKED",
                    "message": safe_message,
                    "technical_detail": exc.__class__.__name__,
                },
                "sandbox": {**_sandbox_status(skill.name), "status": "block", "failure": exc.__class__.__name__},
            }
            span["metadata"] = {"skill": skill.name, "sandbox_status": "block", "error": exc.__class__.__name__}
            trace_event(
                name="mcp_sandbox_blocked",
                surface_context="agent_network",
                category="agent_skill",
                guardrail_status="block",
                metadata={"skill": skill.name, "error": exc.__class__.__name__, "message": safe_message},
            )
            return blocked


def _validate_skill_input(skill: MCPSkill, arguments: dict[str, Any]) -> None:
    schema = skill.input_schema
    if schema.get("additionalProperties") is False:
        allowed = set((schema.get("properties") or {}).keys())
        extra = set(arguments) - allowed
        if extra:
            raise ValueError(f"Unsupported input fields: {', '.join(sorted(extra))}.")
    missing = []
    for name in schema.get("required", []):
        value = arguments.get(name)
        if name not in arguments or value is None or value == "":
            missing.append(name)
    if missing:
        raise ValueError(f"Missing required input fields: {', '.join(missing)}.")
    properties = schema.get("properties") if isinstance(schema.get("properties"), dict) else {}
    for name, spec in properties.items():
        if name not in arguments or not isinstance(spec, dict):
            continue
        value = arguments[name]
        expected = spec.get("type")
        if expected == "string" and not isinstance(value, str):
            raise TypeError(f"{name} must be a string.")
        if expected == "object" and not isinstance(value, dict):
            raise TypeError(f"{name} must be an object.")
        if expected == "array" and not isinstance(value, list):
            raise TypeError(f"{name} must be an array.")
        if isinstance(spec.get("enum"), list) and value not in spec["enum"]:
            raise ValueError(f"{name} must be one of: {', '.join(str(item) for item in spec['enum'])}.")


def _validate_skill_output(skill: MCPSkill, result: dict[str, Any]) -> None:
    required = {"skill_name", "status", "human_review_required", "citations", "provenance"}
    missing = [name for name in required if name not in result]
    if missing:
        raise ValueError(f"Skill output missing required fields: {', '.join(missing)}.")
    if result.get("skill_name") != skill.name:
        raise ValueError("Skill output name mismatch.")
    if result.get("status") not in {"pass", "warn", "block"}:
        raise ValueError("Skill output status must be pass, warn, or block.")


def _sandbox_error_message(skill_name: str, exc: Exception) -> str:
    return (
        f"The {skill_name} skill could not run inside Mercy's secure sandbox. "
        "No content was exported or persisted. Review the input, confirm matter access, and retry."
    )


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
        rendered_prompt = get_prompt_registry().render(
            task=law_or_case,
            matter_context=matter_context or {"jurisdiction": "District of Columbia"},
            retrieved_sources=[],
            route_expert="citation_verifier",
            template_id="citation_generation_verification",
            fewshot_count=1,
        )
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
            "prompt_template": rendered_prompt.metadata(),
            "grounding_policy": _grounding_policy(status, issues),
            "ragas_eval_hook": _ragas_hook(),
            "human_review_required": True,
        }
        span["metadata"] = {"skill": "cite_and_verify", "status": status, "citation_count": len(citations)}
        span["rag"] = retrieval
        return result


def check_dc_ethics(query: str, draft: str, matter_context: dict[str, Any] | None = None) -> dict[str, Any]:
    with trace_span("mcp_check_dc_ethics", "agent_network", "agent_skill") as span:
        rendered_prompt = get_prompt_registry().render(
            task=query,
            matter_context=matter_context or {"jurisdiction": "District of Columbia"},
            retrieved_sources=[],
            route_expert="compliance_guardrails",
            template_id="dc_ethics_rpc_check",
            fewshot_count=1,
        )
        guardrails = evaluate_dc_guardrails(
            {
                "draft": draft or query,
                "draft_type": "agent_network_output",
                "human_review_required": True,
            }
        )
        retrieval = retrieve_dc_knowledge(
            query=f"D.C. ethics compliance for: {query}",
            matter_context={**(matter_context or {}), "jurisdiction": "District of Columbia"},
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
            "prompt_template": rendered_prompt.metadata(),
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
                    "matter_context": {"type": "object"},
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


def _react_state(state: dict[str, Any]) -> dict[str, Any]:
    react = state.get("react") if isinstance(state.get("react"), dict) else {}
    params = state.get("params") if isinstance(state.get("params"), dict) else {}
    try:
        max_cycles = int(params.get("cycles") or params.get("react_cycles") or react.get("max_cycles") or 3)
    except (TypeError, ValueError):
        max_cycles = 3
    return {
        "cycle": int(react.get("cycle") or 0),
        "max_cycles": max(1, min(max_cycles, 8)),
        "done": bool(react.get("done", False)),
        "steps": react.get("steps") if isinstance(react.get("steps"), list) else [],
        **{key: value for key, value in react.items() if key not in {"cycle", "max_cycles", "done", "steps"}},
    }


def _react_next_step(state: dict[str, Any]) -> str:
    react = _react_state(state)
    if react.get("done"):
        return "end"
    if int(react.get("cycle") or 0) >= int(react.get("max_cycles") or 1):
        return "end"
    return "reason"


class BaseLegalAgent:
    expert: str = "base"
    name: str = "BaseLegalAgent"
    description: str = "Base legal agent."
    skill_names: tuple[str, ...] = ()

    def __init__(self, skills: dict[str, MCPSkill]) -> None:
        self.skills = skills
        self.hermes = HermesAgent(owner_agent_name=self.name, expert=self.expert)

    def execute(self, state: dict[str, Any]) -> dict[str, Any]:
        return self._execute_core(state)

    def _execute_core(self, state: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    def metadata(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "expert": self.expert,
            "description": self.description,
            "skills": list(self.skill_names),
            "react_enabled": True,
            "hermes": self.hermes.metadata(),
            "react_loop": {
                "version": REACT_LOOP_VERSION,
                "cycle": "Reason -> Act -> Observe -> Repeat",
                "langgraph_stateful_cycles": True,
                "default_max_cycles": 3,
            },
        }

    def _call_skill(self, name: str, **kwargs: Any) -> dict[str, Any]:
        skill = self.skills[name]
        return execute_mcp_skill_sandboxed(skill, kwargs, matter_context=kwargs.get("matter_context"))

    def reason(self, state: dict[str, Any]) -> dict[str, Any]:
        react = _react_state(state)
        cycle = int(react.get("cycle") or 0) + 1
        hermes = self.hermes.reason(state=state, cycle=cycle, available_skills=list(self.skill_names))
        thought = str(hermes.get("reasoning_summary") or self._thought_for_cycle(state, cycle))
        step = {
            "cycle": cycle,
            "phase": "reason",
            "agent": self.name,
            "thought": thought,
            "hermes": {
                "version": hermes.get("version"),
                "skill_plan": hermes.get("skill_plan", []),
                "workflow_reflection": hermes.get("workflow_reflection"),
                "used_llm": hermes.get("llm", {}).get("used_llm") if isinstance(hermes.get("llm"), dict) else False,
                "model": hermes.get("llm", {}).get("model") if isinstance(hermes.get("llm"), dict) else None,
            },
            "timestamp": datetime.now(UTC).isoformat(),
        }
        with trace_span(
            "agent_react_reason",
            str(state.get("matter_context", {}).get("surface_context") or "agent_network"),
            "agent",
            route=state.get("route"),
            metadata={"agent": self.name, "cycle": cycle, "thought": thought},
        ):
            trace_event(name="agent_react_reason", surface_context="agent_network", category="agent", route=state.get("route"), metadata=step)
        return {**state, "hermes": hermes, "react": {**react, "cycle": cycle, "current_reason": thought, "steps": [*react.get("steps", []), step]}}

    def act(self, state: dict[str, Any]) -> dict[str, Any]:
        react = _react_state(state)
        cycle = int(react.get("cycle") or 1)
        action = "execute_core_agent_task" if not isinstance(state.get("agent_result"), dict) else "review_existing_result"
        with trace_span(
            "agent_react_act",
            str(state.get("matter_context", {}).get("surface_context") or "agent_network"),
            "agent",
            route=state.get("route"),
            metadata={"agent": self.name, "cycle": cycle, "action": action},
        ):
            if action == "execute_core_agent_task":
                result = self._execute_core(state)
            else:
                result = state["agent_result"]
        step = {
            "cycle": cycle,
            "phase": "act",
            "agent": self.name,
            "action": action,
            "skills": result.get("skills_used", []) if isinstance(result, dict) else [],
            "timestamp": datetime.now(UTC).isoformat(),
        }
        return {**state, "agent_result": result, "react": {**react, "steps": [*react.get("steps", []), step]}}

    def observe(self, state: dict[str, Any]) -> dict[str, Any]:
        react = _react_state(state)
        result = state.get("agent_result") if isinstance(state.get("agent_result"), dict) else {}
        status = str(result.get("status") or "warn")
        cycle = int(react.get("cycle") or 1)
        max_cycles = int(react.get("max_cycles") or 3)
        should_repeat = cycle < max_cycles and status not in {"block"}
        observation = {
            "cycle": cycle,
            "phase": "observe",
            "agent": self.name,
            "status": status,
            "citation_count": len(result.get("citations", [])) if isinstance(result.get("citations"), list) else 0,
            "grounding_status": (result.get("grounding_policy") or {}).get("status") if isinstance(result.get("grounding_policy"), dict) else status,
            "repeat": should_repeat,
            "timestamp": datetime.now(UTC).isoformat(),
        }
        with trace_span(
            "agent_react_observe",
            str(state.get("matter_context", {}).get("surface_context") or "agent_network"),
            "agent",
            route=state.get("route"),
            metadata=observation,
        ):
            trace_event(name="agent_react_observe", surface_context="agent_network", category="agent", route=state.get("route"), metadata=observation)
        result = {
            **result,
            "hermes": {
                "reasoning": state.get("hermes") if isinstance(state.get("hermes"), dict) else {},
                "reflection": self.hermes.observe(state=state, observation=observation),
                "agent": self.hermes.metadata(),
            },
            "react_loop": {
                "version": REACT_LOOP_VERSION,
                "enabled": True,
                "agent": self.name,
                "cycles_completed": cycle,
                "max_cycles": max_cycles,
                "steps": [*react.get("steps", []), observation],
                "final_observation": observation,
            },
        }
        return {**state, "agent_result": result, "react": {**react, "done": not should_repeat, "steps": result["react_loop"]["steps"]}}

    def _thought_for_cycle(self, state: dict[str, Any], cycle: int) -> str:
        if cycle == 1:
            return f"Select the safest {self.name} action plan with tenant-scoped matter context and official D.C. grounding."
        return "Review observations, confirm citations/guardrails, and stop unless another secure action is required."


class ResearchAgent(BaseLegalAgent):
    expert = "research"
    name = "ResearchAgent"
    description = "Retrieves D.C. legal grounding with citation provenance."
    skill_names = ("cite_and_verify", "check_dc_ethics")

    def _execute_core(self, state: dict[str, Any]) -> dict[str, Any]:
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
        fallback_answer = _grounded_research_summary(retrieval)
        llm_answer = generate_research_answer(
            query=task,
            retrieval=retrieval,
            matter_context=context,
            route=state["route"],
            fallback=fallback_answer,
        )
        return {
            "agent": self.name,
            "status": retrieval.get("verification", {}).get("status") or "warn",
            "answer": llm_answer.content,
            "llm": llm_answer.to_dict(),
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

    def _execute_core(self, state: dict[str, Any]) -> dict[str, Any]:
        task = state["task"]
        context = state["matter_context"]
        retrieval = retrieve_dc_knowledge(
            query=task,
            matter_context=context,
            top_k=int(state["params"].get("top_k") or 4),
            route=state["route"],
            agentic=True,
        )
        fallback_draft = _grounded_draft(task, context, retrieval)
        llm_draft = generate_legal_draft(
            task=task,
            matter_context=context,
            retrieval=retrieval,
            route=state["route"],
            fallback=fallback_draft,
        )
        draft = llm_draft.content
        ethics = self._call_skill("check_dc_ethics", query=task, draft=draft, matter_context=context)
        export = self._call_skill("export_to_word", content=draft, format=str(state["params"].get("format") or "docx"))
        status = "block" if not retrieval.get("results") else ethics.get("status", "warn")
        return {
            "agent": self.name,
            "status": status,
            "draft": draft,
            "llm": llm_draft.to_dict(),
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

    def _execute_core(self, state: dict[str, Any]) -> dict[str, Any]:
        params = state["params"]
        draft = str(params.get("draft") or params.get("content") or state["task"])
        ethics = self._call_skill("check_dc_ethics", query=state["task"], draft=draft, matter_context=state["matter_context"])
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

    def _execute_core(self, state: dict[str, Any]) -> dict[str, Any]:
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

    def _execute_core(self, state: dict[str, Any]) -> dict[str, Any]:
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
        _enforce_langgraph_runtime_policy()
        self.skills = _skill_registry()
        self.agents: dict[str, BaseLegalAgent] = {
            "research": ResearchAgent(self.skills),
            "drafting": DraftingAgent(self.skills),
            "compliance_guardrails": ComplianceAgent(self.skills),
            "intake": IntakeAgent(self.skills),
            "citation_verifier": CitationVerifierAgent(self.skills),
        }
        self._graph = self._build_langgraph()
        self._langgraph_runtime = langgraph_runtime_metadata(graph_compiled=self._graph is not None)
        set_langgraph_runtime(self._langgraph_runtime)

    def manifest(self) -> dict[str, Any]:
        return {
            "manifest_version": MCP_MANIFEST_VERSION,
            "agent_network_version": AGENT_NETWORK_VERSION,
            "langgraph": dict(self._langgraph_runtime),
            "react_loop": {
                "version": REACT_LOOP_VERSION,
                "enabled": True,
                "cycle": "Reason -> Act -> Observe -> Repeat",
                "langgraph_stateful_cycles": True,
            },
            "sandbox": {
                "version": MCP_SANDBOX_VERSION,
                "enabled": True,
                "restricted_execution": True,
                "arbitrary_code_execution": False,
            },
            "hermes": hermes_status(),
            "agents": [agent.metadata() for agent in self.agents.values()],
            "skills": [skill.metadata() for skill in self.skills.values()],
            "rag_backend": rag_backend_status(),
            "llm_providers": llm_provider_status(),
            "prompt_registry": prompt_registry_status(),
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

        context["langgraph_runtime"] = dict(self._langgraph_runtime)

        with trace_span("agent_network_execute", str(context.get("surface_context") or "agent_network"), "agent", route=route, matter_reference=context.get("matter_id")) as span:
            state = {
                "task": task,
                "params": params,
                "matter_context": context,
                "route": route,
                "user_type": user_type,
                "selected_agent": agent.name,
                "react": {"max_cycles": int(params.get("cycles") or params.get("react_cycles") or 3), "steps": [], "done": False},
            }
            result = self._run_graph(state, agent)
            status = str(result.get("status") or "warn")
            response = {
                "agent_network_version": AGENT_NETWORK_VERSION,
                "langgraph_runtime": dict(self._langgraph_runtime),
                "selected_agent": agent.name,
                "selected_expert": expert,
                "task": task,
                "params": _safe_params(params),
                "agent_result": result,
                "llm": result.get("llm") if isinstance(result.get("llm"), dict) else llm_provider_status(),
                "mcp_skills_used": result.get("skills_used", []),
                "mcp_skill_results": result.get("skill_results", []),
                "citations": result.get("citations", []),
                "grounding_policy": result.get("grounding_policy") or _grounding_policy(status),
                "react_loop": result.get("react_loop"),
                "hermes": result.get("hermes"),
                "human_review_required": True,
                "executed_at": datetime.now(UTC).isoformat(),
            }
            span["route"] = route
            span["rag"] = result.get("rag") if isinstance(result.get("rag"), dict) else None
            span["metadata"] = {
                "agent": agent.name,
                "status": status,
                "skill_count": len(response["mcp_skills_used"]),
                "react_cycles": (result.get("react_loop") or {}).get("cycles_completed") if isinstance(result.get("react_loop"), dict) else None,
                "hermes_enabled": True,
                "hermes_model": (result.get("hermes", {}).get("reasoning", {}).get("llm") or {}).get("model") if isinstance(result.get("hermes"), dict) else None,
                "langgraph_runtime": self._langgraph_runtime.get("runtime"),
                "langgraph_available": self._langgraph_runtime.get("available"),
                "llm_used": bool(result.get("llm", {}).get("used_llm")) if isinstance(result.get("llm"), dict) else False,
                "llm_model": result.get("llm", {}).get("model") if isinstance(result.get("llm"), dict) else None,
            }
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
            auth_context = context.get("auth_context") if isinstance(context.get("auth_context"), dict) else {}
            tenant_id = auth_context.get("tenant_id") or context.get("tenant_id")
            if persistent_storage_configured() and tenant_id:
                record_langgraph_checkpoint(
                    checkpoint_id=str(response.get("executed_at")),
                    tenant_id=str(tenant_id),
                    thread_id=str(context.get("matter_id") or params.get("matter_id") or "agent-network"),
                    matter_id=str(context.get("matter_id")) if context.get("matter_id") else None,
                    state={
                        "task": task,
                        "selected_agent": agent.name,
                        "selected_expert": expert,
                        "status": status,
                        "route": route,
                        "skills_used": response["mcp_skills_used"],
                        "react_loop": response["react_loop"],
                        "hermes": response["hermes"],
                    },
                )
            return response

    def _build_langgraph(self) -> Any:
        if not LANGGRAPH_AVAILABLE or StateGraph is None:
            return None
        try:
            with trace_span("langgraph_compile", "agent_network", "agent_graph", metadata=langgraph_runtime_metadata()) as span:
                graph = StateGraph(dict)
                graph.add_node("reason", lambda state: state["agent"].reason(state))
                graph.add_node("act", lambda state: state["agent"].act(state))
                graph.add_node("observe", lambda state: state["agent"].observe(state))
                graph.set_entry_point("reason")
                graph.add_edge("reason", "act")
                graph.add_edge("act", "observe")
                graph.add_conditional_edges("observe", _react_next_step, {"reason": "reason", "end": END})
                compiled = graph.compile()
                span["metadata"] = langgraph_runtime_metadata(graph_compiled=True)
                return compiled
        except Exception as exc:
            if not _local_langgraph_fallback_allowed():
                raise LangGraphRuntimeUnavailable("LangGraph compilation failed in non-local mode.") from exc
            trace_event(
                name="langgraph_compile_fallback",
                surface_context="agent_network",
                category="agent_graph",
                guardrail_status="warn",
                metadata={**langgraph_runtime_metadata(), "error": str(exc)},
            )
            return None

    def _run_graph(self, state: dict[str, Any], agent: BaseLegalAgent) -> dict[str, Any]:
        if self._graph is not None:
            try:
                graph_state = self._graph.invoke({**state, "agent": agent})
                if isinstance(graph_state, dict) and isinstance(graph_state.get("agent_result"), dict):
                    return graph_state["agent_result"]
            except Exception as exc:
                if not _local_langgraph_fallback_allowed():
                    raise LangGraphRuntimeUnavailable("LangGraph execution failed in non-local mode.") from exc
        graph_state = {**state, "agent": agent}
        while True:
            graph_state = agent.reason(graph_state)
            graph_state = agent.act(graph_state)
            graph_state = agent.observe(graph_state)
            if _react_next_step(graph_state) == "end":
                result = graph_state.get("agent_result")
                return result if isinstance(result, dict) else {"agent": agent.name, "status": "warn", "skill_results": [], "skills_used": []}


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
        return (
            "DRAFTING BLOCKED\n\n"
            "This is AI-assisted drafting - attorney must review and verify all content before use.\n\n"
            "Mercy did not retrieve verified D.C. grounding for this request. Supply official D.C. source material, "
            "rerun citation verification, and confirm matter facts before preparing client-facing language."
        )
    facts = context.get("facts") if isinstance(context.get("facts"), dict) else context.get("key_facts", {})
    fact_summary = "; ".join(f"{key}: {value}" for key, value in list((facts or {}).items())[:4]) or "facts pending"
    jurisdiction = str(context.get("jurisdiction") or "District of Columbia")
    requested_relief = str(context.get("requested_relief") or "client objective pending")
    matter_type = str(context.get("matter_type") or "D.C. legal matter")
    authority_lines = []
    for index, result in enumerate(results[:4], start=1):
        citation = result.get("citation", {}) if isinstance(result.get("citation"), dict) else {}
        provenance = citation.get("provenance", {}) if isinstance(citation.get("provenance"), dict) else {}
        label = citation.get("label") or result.get("source_id") or "[VERIFY CITE]"
        verification = result.get("verification_status") or citation.get("verification_status") or "verification_required"
        source_url = provenance.get("url") or result.get("url") or "official locator pending"
        summary = result.get("summary") or "Candidate D.C. source metadata requires attorney verification."
        authority_lines.append(
            f"{index}. {label} - {summary} Verification: {verification}. Official source: {source_url}."
        )
    authorities = "\n".join(authority_lines)
    top_labels = "; ".join(
        str((result.get("citation") or {}).get("label") or result.get("source_id") or "[VERIFY CITE]")
        for result in results[:3]
    )
    return (
        "This is AI-assisted drafting - attorney must review and verify all content before use.\n\n"
        f"Drafting objective: {task}\n"
        f"Matter posture: {matter_type}; jurisdiction: {jurisdiction}; requested relief/objective: {requested_relief}.\n"
        f"Known matter facts to confirm: {fact_summary}.\n\n"
        "Issue\n"
        "Prepare D.C.-specific attorney-review language responsive to the drafting objective while preserving "
        "confidentiality, source verification, and professional-responsibility safeguards.\n\n"
        "Rule and source grounding to verify\n"
        f"{authorities}\n\n"
        "Application\n"
        "Based on the current matter context, frame the analysis around the client objective, the operative document "
        "language, and any D.C. procedural or ethics constraints. Do not present this section as final legal advice "
        f"until counsel verifies the official source text, current validity, and pinpoint support for {top_labels}.\n\n"
        "Conclusion / proposed attorney-review language\n"
        "[Insert tailored clause, argument paragraph, or client-facing explanation here after attorney verification of "
        "facts, source text, record support, and client instructions. Preserve D.C. phrasing, avoid overstatement, and "
        "use citation placeholders only where the official source has been checked.]\n\n"
        "Citation verification checklist\n"
        "- Verify each cited D.C. source in its official locator before filing, sending, or billing for final work.\n"
        "- Confirm the source is current and supports the precise proposition stated.\n"
        "- Confirm the matter facts and procedural posture match the drafted language.\n"
        "- Keep the attorney-review warning with any draft exported to Word or shared for review."
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
