from __future__ import annotations

import json
from collections import Counter
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from evals.regression_status import latest_regression_health
from llm_providers import complete_hermes_reasoning, hermes_model_status
from observability import TRACE_STORE, trace_event, trace_span
from security_controls import sanitize_payload, sanitize_text


HERMES_INTELLIGENCE_VERSION = "hermes-agent-intelligence-1.0"
HERMES_SYSTEM_PROMPT = (
    "You are Hermes, Mercy's internal reasoning layer for D.C. legal expert agents. "
    "Use only tenant-scoped matter metadata, official D.C. source grounding, sandboxed MCP skills, "
    "and attorney-review safeguards. Return concise JSON with reasoning_summary, skill_plan, memory_updates, "
    "workflow_reflection, and stop_condition. Do not reveal chain-of-thought; provide short rationale summaries only."
)


@dataclass
class HermesMemoryRecord:
    agent_name: str
    expert: str
    tenant_id: str
    matter_id: str | None
    practice_area: str | None
    learned_patterns: list[str] = field(default_factory=list)
    preferred_skills: list[str] = field(default_factory=list)
    observations: list[dict[str, Any]] = field(default_factory=list)
    domain_learning: dict[str, Any] = field(default_factory=dict)
    updated_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


_HERMES_MEMORY: dict[str, HermesMemoryRecord] = {}


def hermes_status() -> dict[str, Any]:
    return {
        "version": HERMES_INTELLIGENCE_VERSION,
        "enabled": True,
        "models": hermes_model_status(),
        "memory_records": len(_HERMES_MEMORY),
        "domain_learning": _domain_learning_snapshot(),
        "trace_analysis": _trace_analysis_summary(),
        "respects": {
            "react_loop": True,
            "mcp_sandbox": True,
            "tenant_isolation": True,
            "official_dc_sources": True,
            "langsmith_tracing": True,
        },
    }


def agent_hermes_metadata(agent_name: str, expert: str) -> dict[str, Any]:
    return {
        "version": HERMES_INTELLIGENCE_VERSION,
        "enabled": True,
        "agent": agent_name,
        "expert": expert,
        "persistent_memory": True,
        "skill_reuse": True,
        "domain_learning": "PD038 seeded D.C. knowledge + PD044 golden regression metadata",
        "workflow_improvement": "internal reflection over ReACT observations and LangSmith trace summaries",
        "models": hermes_model_status(),
    }


def hermes_reason(
    *,
    agent_name: str,
    expert: str,
    state: dict[str, Any],
    cycle: int,
    available_skills: list[str],
) -> dict[str, Any]:
    context = state.get("matter_context") if isinstance(state.get("matter_context"), dict) else {}
    route = state.get("route") if isinstance(state.get("route"), dict) else {}
    memory = _memory_for(agent_name, expert, context)
    domain = _domain_learning_snapshot()
    prompt_payload = {
        "agent": agent_name,
        "expert": expert,
        "cycle": cycle,
        "task": sanitize_text(str(state.get("task") or ""), max_length=4000),
        "route": route,
        "available_skills": available_skills,
        "memory": memory.to_dict(),
        "domain_learning": domain,
        "trace_analysis": _trace_analysis_summary(),
        "constraints": {
            "official_dc_sources_only": True,
            "tenant_id": memory.tenant_id,
            "matter_id": memory.matter_id,
            "attorney_review_required": True,
            "sandboxed_skills_only": True,
        },
    }
    fallback = _fallback_reasoning(agent_name, expert, prompt_payload, memory)
    with trace_span(
        "hermes_reasoning",
        str(context.get("surface_context") or "agent_network"),
        "agent",
        route=route,
        matter_reference=context.get("matter_id"),
        metadata={"agent": agent_name, "expert": expert, "cycle": cycle, "hermes": True},
    ) as span:
        result = complete_hermes_reasoning(
            system_prompt=HERMES_SYSTEM_PROMPT,
            user_prompt=json.dumps(prompt_payload, default=str),
            matter_context=context,
            route=route,
            fallback=json.dumps(fallback, sort_keys=True),
            prompt_template={"template_id": "hermes_internal_agent_reasoning", "version": HERMES_INTELLIGENCE_VERSION},
        )
        parsed = _parse_hermes_json(result.content) or fallback
        parsed = _normalize_reasoning(parsed, fallback, available_skills)
        parsed["llm"] = result.to_dict()
        parsed["memory_key"] = _memory_key(agent_name, expert, context)
        parsed["domain_learning"] = domain
        span["metadata"] = {
            "agent": agent_name,
            "expert": expert,
            "cycle": cycle,
            "hermes_model": result.model,
            "hermes_used_llm": result.used_llm,
            "recommended_skills": parsed.get("skill_plan", []),
        }
    trace_event(
        name="hermes_reasoning_summary",
        surface_context=str(context.get("surface_context") or "agent_network"),
        category="agent",
        route=route,
        matter_reference=context.get("matter_id"),
        metadata={
            "agent": agent_name,
            "expert": expert,
            "cycle": cycle,
            "used_llm": parsed.get("llm", {}).get("used_llm") if isinstance(parsed.get("llm"), dict) else False,
            "skill_plan": parsed.get("skill_plan", []),
            "hermes": True,
        },
    )
    return parsed


def hermes_observe(
    *,
    agent_name: str,
    expert: str,
    state: dict[str, Any],
    observation: dict[str, Any],
) -> dict[str, Any]:
    context = state.get("matter_context") if isinstance(state.get("matter_context"), dict) else {}
    result = state.get("agent_result") if isinstance(state.get("agent_result"), dict) else {}
    memory = _memory_for(agent_name, expert, context)
    skill_counter = Counter(memory.preferred_skills)
    for skill in result.get("skills_used", []) if isinstance(result.get("skills_used"), list) else []:
        skill_counter[str(skill)] += 1
    memory.preferred_skills = [skill for skill, _ in skill_counter.most_common(6)]
    status = str(result.get("status") or observation.get("status") or "warn")
    memory.observations.append(
        {
            "cycle": observation.get("cycle"),
            "status": status,
            "citation_count": observation.get("citation_count"),
            "grounding_status": observation.get("grounding_status"),
            "skills_used": result.get("skills_used", []),
            "recorded_at": datetime.now(UTC).isoformat(),
        }
    )
    del memory.observations[:-12]
    pattern = _workflow_pattern(expert, status, result)
    if pattern and pattern not in memory.learned_patterns:
        memory.learned_patterns.append(pattern)
    memory.domain_learning = _domain_learning_snapshot()
    memory.updated_at = datetime.now(UTC).isoformat()
    _HERMES_MEMORY[_memory_key(agent_name, expert, context)] = memory
    reflection = {
        "version": HERMES_INTELLIGENCE_VERSION,
        "agent": agent_name,
        "expert": expert,
        "status": status,
        "memory": memory.to_dict(),
        "workflow_improvement": _workflow_improvement(memory, result),
        "trace_analysis": _trace_analysis_summary(),
    }
    trace_event(
        name="hermes_observation_reflection",
        surface_context=str(context.get("surface_context") or "agent_network"),
        category="agent",
        route=state.get("route") if isinstance(state.get("route"), dict) else None,
        matter_reference=context.get("matter_id"),
        metadata=sanitize_payload(reflection),
    )
    return reflection


def _memory_for(agent_name: str, expert: str, context: dict[str, Any]) -> HermesMemoryRecord:
    key = _memory_key(agent_name, expert, context)
    if key in _HERMES_MEMORY:
        return _HERMES_MEMORY[key]
    auth_context = context.get("auth_context") if isinstance(context.get("auth_context"), dict) else {}
    record = HermesMemoryRecord(
        agent_name=agent_name,
        expert=expert,
        tenant_id=str(auth_context.get("tenant_id") or context.get("tenant_id") or "local"),
        matter_id=str(context.get("matter_id")) if context.get("matter_id") else None,
        practice_area=str(context.get("practice_area") or context.get("matter_type") or "") or None,
        domain_learning=_domain_learning_snapshot(),
    )
    _HERMES_MEMORY[key] = record
    return record


def _memory_key(agent_name: str, expert: str, context: dict[str, Any]) -> str:
    auth_context = context.get("auth_context") if isinstance(context.get("auth_context"), dict) else {}
    tenant_id = str(auth_context.get("tenant_id") or context.get("tenant_id") or "local")
    matter_id = str(context.get("matter_id") or "no-matter")
    return f"{tenant_id}:{matter_id}:{expert}:{agent_name}"


def _domain_learning_snapshot() -> dict[str, Any]:
    regression = latest_regression_health()
    seed = _latest_seed_report()
    golden_path = Path("evals/datasets/dc_regression_golden.jsonl")
    try:
        golden_cases = len([line for line in golden_path.read_text(encoding="utf-8").splitlines() if line.strip()])
    except Exception:
        golden_cases = int(regression.get("dataset_size") or 0)
    return {
        "pd038_seeded_knowledge": {
            "source_count": seed.get("sources_ingested") or (regression.get("corpus") or {}).get("source_count"),
            "chunk_count": seed.get("chunks_created") or (regression.get("corpus") or {}).get("chunk_count"),
            "coverage": (seed.get("coverage_summary") or {}).get("practice_areas", {}),
            "health": seed.get("health") or seed.get("overall_health"),
        },
        "pd044_golden_dataset": {
            "case_count": golden_cases,
            "latest_status": regression.get("status"),
            "overall_score": regression.get("overall_score"),
            "pass_rate": regression.get("pass_rate"),
            "citation_accuracy": regression.get("citation_accuracy"),
            "dc_grounding_score": regression.get("dc_grounding_score"),
        },
    }


def _trace_analysis_summary() -> dict[str, Any]:
    try:
        records = TRACE_STORE.list(limit=100)
    except Exception:
        records = []
    categories = Counter(str(record.get("category") or "unknown") for record in records)
    guardrails = Counter(str(record.get("guardrail_status") or "none") for record in records)
    agent_records = [record for record in records if record.get("category") == "agent"]
    return {
        "recent_trace_count": len(records),
        "categories": dict(categories.most_common(8)),
        "guardrail_statuses": dict(guardrails.most_common(6)),
        "recent_agent_traces": len(agent_records),
        "reflection_mode": "local_trace_summary_plus_optional_langsmith",
    }


def _fallback_reasoning(agent_name: str, expert: str, payload: dict[str, Any], memory: HermesMemoryRecord) -> dict[str, Any]:
    skills = [str(skill) for skill in payload.get("available_skills", [])]
    if memory.preferred_skills:
        ordered = [skill for skill in memory.preferred_skills if skill in skills] + [skill for skill in skills if skill not in memory.preferred_skills]
    else:
        ordered = skills
    return {
        "reasoning_summary": f"Hermes selected a tenant-scoped {agent_name} plan using official D.C. grounding and sandboxed tools.",
        "skill_plan": ordered[:3],
        "memory_updates": ["reuse_successful_skills", "preserve_official_dc_grounding", "require_attorney_review"],
        "workflow_reflection": f"Use {expert} workflow patterns from prior ReACT observations and PD044 regression health.",
        "stop_condition": "Stop when grounding, citations, guardrails, and attorney-review metadata are present.",
    }


def _normalize_reasoning(parsed: dict[str, Any], fallback: dict[str, Any], available_skills: list[str]) -> dict[str, Any]:
    skill_plan = parsed.get("skill_plan") if isinstance(parsed.get("skill_plan"), list) else fallback["skill_plan"]
    allowed = [str(skill) for skill in available_skills]
    return {
        "version": HERMES_INTELLIGENCE_VERSION,
        "reasoning_summary": sanitize_text(str(parsed.get("reasoning_summary") or fallback["reasoning_summary"]), max_length=1200),
        "skill_plan": [str(skill) for skill in skill_plan if str(skill) in allowed],
        "memory_updates": [str(item) for item in parsed.get("memory_updates", fallback["memory_updates"]) if item],
        "workflow_reflection": sanitize_text(str(parsed.get("workflow_reflection") or fallback["workflow_reflection"]), max_length=1200),
        "stop_condition": sanitize_text(str(parsed.get("stop_condition") or fallback["stop_condition"]), max_length=800),
    }


def _workflow_pattern(expert: str, status: str, result: dict[str, Any]) -> str:
    skills = ",".join(str(skill) for skill in result.get("skills_used", []) if skill)
    return f"{expert}:{status}:skills={skills or 'none'}"


def _workflow_improvement(memory: HermesMemoryRecord, result: dict[str, Any]) -> dict[str, Any]:
    return {
        "preferred_skills_next": memory.preferred_skills,
        "learned_patterns": memory.learned_patterns[-6:],
        "repeat_low_confidence_check": result.get("status") != "pass",
        "recommendation": "Reuse successful sandboxed skills and rerun official D.C. grounding before final attorney-facing output.",
    }


def _latest_seed_report() -> dict[str, Any]:
    try:
        data = json.loads(Path("reports/dc_knowledge_seed_latest.json").read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _parse_hermes_json(text: str) -> dict[str, Any] | None:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:].strip()
    try:
        parsed = json.loads(stripped)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start >= 0 and end > start:
            try:
                parsed = json.loads(stripped[start : end + 1])
                return parsed if isinstance(parsed, dict) else None
            except json.JSONDecodeError:
                return None
    return None


__all__ = [
    "HERMES_INTELLIGENCE_VERSION",
    "agent_hermes_metadata",
    "hermes_observe",
    "hermes_reason",
    "hermes_status",
]
