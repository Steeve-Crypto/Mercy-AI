from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any

from observability import trace_event, trace_span
from prompts.registry import get_prompt_registry
from security_controls import record_security_audit, sanitize_payload, sanitize_text

os.environ.setdefault("LITELLM_LOCAL_MODEL_COST_MAP", "True")
os.environ.setdefault("LITELLM_LOG", "ERROR")

try:
    from litellm import completion, completion_cost  # type: ignore

    LITELLM_AVAILABLE = True
    LITELLM_IMPORT_ERROR = None
except Exception as exc:  # pragma: no cover - exercised when dependency is absent
    completion = None  # type: ignore
    completion_cost = None  # type: ignore
    LITELLM_AVAILABLE = False
    LITELLM_IMPORT_ERROR = str(exc)


LLM_PROVIDER_VERSION = "mercy-llm-providers-litellm-1.0"

PROVIDER_KEYS = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "groq": "GROQ_API_KEY",
    "gemini": "GEMINI_API_KEY",
}

DEFAULT_MODELS = {
    "openai": {
        "fast": "openai/gpt-4o-mini",
        "reasoning": "openai/gpt-4o",
    },
    "anthropic": {
        "fast": "anthropic/claude-3-5-haiku-20241022",
        "reasoning": "anthropic/claude-3-5-sonnet-20241022",
    },
    "groq": {
        "fast": "groq/llama-3.1-8b-instant",
        "reasoning": "groq/llama-3.3-70b-versatile",
    },
    "gemini": {
        "fast": "gemini/gemini-2.0-flash",
        "reasoning": "gemini/gemini-2.0-flash",
    },
}

REASONING_TASKS = {
    "legal_drafting",
    "agent_execution",
    "research_generation",
    "complex_research",
    "compliance_analysis",
}

FAST_TASKS = {
    "moe_router",
    "citation_skill",
    "simple_rewrite",
    "summarization",
}

APPROXIMATE_PRICING_PER_1M = {
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "o1-mini": (1.10, 4.40),
    "claude-3-5-sonnet": (3.00, 15.00),
    "claude-3-5-haiku": (0.80, 4.00),
    "llama-3.1-8b": (0.05, 0.08),
    "llama-3.3-70b": (0.59, 0.79),
    "gemini-2.0-flash": (0.10, 0.40),
}

ATTORNEY_REVIEW_DISCLAIMER = "This is AI-assisted drafting - attorney must review and verify all content before use."


@dataclass
class LLMProviderConfig:
    provider: str
    api_key_env: str
    fast_model: str
    reasoning_model: str

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "api_key_env": self.api_key_env,
            "fast_model": self.fast_model,
            "reasoning_model": self.reasoning_model,
        }


@dataclass
class LLMCallResult:
    content: str
    used_llm: bool
    task_type: str
    provider: str | None = None
    model: str | None = None
    fallback_reason: str | None = None
    estimated_cost_usd: float | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    trace_id: str | None = None
    prompt_template: dict[str, Any] | None = None
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def active_provider_configs() -> list[LLMProviderConfig]:
    preferred = str(os.getenv("MERCY_LLM_PROVIDER") or "").strip().lower()
    providers = [preferred] if preferred in PROVIDER_KEYS else []
    providers.extend(provider for provider in PROVIDER_KEYS if provider not in providers)
    active: list[LLMProviderConfig] = []
    for provider in providers:
        api_key_env = PROVIDER_KEYS[provider]
        if not os.getenv(api_key_env):
            continue
        defaults = DEFAULT_MODELS[provider]
        active.append(
            LLMProviderConfig(
                provider=provider,
                api_key_env=api_key_env,
                fast_model=_provider_model_override(provider, "fast") or defaults["fast"],
                reasoning_model=_provider_model_override(provider, "reasoning") or defaults["reasoning"],
            )
        )
    return active


def llm_provider_status() -> dict[str, Any]:
    active = active_provider_configs()
    selected = _select_provider("moe_router")
    reasoning = _select_provider("legal_drafting")
    return {
        "version": LLM_PROVIDER_VERSION,
        "litellm_available": LITELLM_AVAILABLE,
        "litellm_import_error": LITELLM_IMPORT_ERROR,
        "active": bool(active) and LITELLM_AVAILABLE,
        "fallback_active": not (active and LITELLM_AVAILABLE),
        "fallback_reason": _fallback_reason(active),
        "active_providers": [config.to_public_dict() for config in active],
        "selected_models": {
            "fast": selected[1] if selected else None,
            "reasoning": reasoning[1] if reasoning else None,
        },
        "supported_provider_env": sorted(PROVIDER_KEYS.values()),
        "smart_routing": {
            "fast_tasks": sorted(FAST_TASKS),
            "reasoning_tasks": sorted(REASONING_TASKS),
        },
    }


def complete_legal_task(
    *,
    task_type: str,
    system_prompt: str,
    user_prompt: str,
    matter_context: dict[str, Any] | None = None,
    route: dict[str, Any] | None = None,
    fallback: str,
    prompt_template: dict[str, Any] | None = None,
    max_tokens: int = 1200,
    temperature: float = 0.2,
) -> LLMCallResult:
    selected = _select_provider(task_type)
    if selected is None or completion is None:
        return _fallback_result(task_type, fallback, _fallback_reason(active_provider_configs()), prompt_template=prompt_template)
    provider, model = selected
    context = sanitize_payload(matter_context or {})
    safe_system_prompt = sanitize_text(system_prompt, max_length=20_000)
    safe_user_prompt = sanitize_text(user_prompt, max_length=40_000)
    surface_context = str(context.get("surface_context") or "llm_provider")
    metadata = _safe_trace_metadata(context, route, provider, model, task_type, prompt_template)
    with trace_span("llm_completion", surface_context, "llm", route=route, matter_reference=context.get("matter_id"), metadata=metadata) as span:
        try:
            record_security_audit(
                "llm_call_started",
                tenant_context=context.get("auth_context") if isinstance(context.get("auth_context"), dict) else None,
                matter_id=str(context.get("matter_id")) if context.get("matter_id") else None,
                category="llm",
                metadata={"task_type": task_type, "provider": provider.provider, "model": model, "surface_context": surface_context},
            )
            response = completion(  # type: ignore[misc]
                model=model,
                messages=[
                    {"role": "system", "content": safe_system_prompt},
                    {"role": "user", "content": safe_user_prompt},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
            )
            content = _extract_content(response).strip()
            usage = _extract_usage(response)
            estimated_cost = _completion_cost(response, model, safe_user_prompt, content, usage)
            result = LLMCallResult(
                content=sanitize_text(content or fallback, max_length=80_000),
                used_llm=bool(content),
                task_type=task_type,
                provider=provider.provider,
                model=model,
                fallback_reason=None if content else "empty_llm_response",
                estimated_cost_usd=estimated_cost,
                prompt_tokens=usage.get("prompt_tokens"),
                completion_tokens=usage.get("completion_tokens"),
                trace_id=str(span.get("trace_id")) if span.get("trace_id") else None,
                prompt_template=prompt_template,
            )
            span["metadata"] = {
                **metadata,
                "used_llm": result.used_llm,
                "estimated_cost_usd": result.estimated_cost_usd,
                "prompt_tokens": result.prompt_tokens,
                "completion_tokens": result.completion_tokens,
            }
            trace_event(
                name="llm_completion_result",
                surface_context=surface_context,
                category="llm",
                route=route,
                matter_reference=context.get("matter_id"),
                metadata=span["metadata"],
            )
            record_security_audit(
                "llm_call_completed",
                tenant_context=context.get("auth_context") if isinstance(context.get("auth_context"), dict) else None,
                matter_id=str(context.get("matter_id")) if context.get("matter_id") else None,
                category="llm",
                metadata={
                    "task_type": task_type,
                    "provider": provider.provider,
                    "model": model,
                    "used_llm": result.used_llm,
                    "estimated_cost_usd": result.estimated_cost_usd,
                },
            )
            return result
        except Exception as exc:
            result = _fallback_result(task_type, fallback, f"provider_error:{exc.__class__.__name__}", provider, model, prompt_template)
            span["metadata"] = {**metadata, "used_llm": False, "fallback_reason": result.fallback_reason}
            trace_event(
                name="llm_completion_fallback",
                surface_context=surface_context,
                category="llm",
                guardrail_status="warn",
                route=route,
                matter_reference=context.get("matter_id"),
                metadata=span["metadata"],
            )
            record_security_audit(
                "llm_call_fallback",
                tenant_context=context.get("auth_context") if isinstance(context.get("auth_context"), dict) else None,
                matter_id=str(context.get("matter_id")) if context.get("matter_id") else None,
                category="llm",
                metadata={"task_type": task_type, "provider": provider.provider, "model": model, "fallback_reason": result.fallback_reason},
                guardrail_status="warn",
            )
            return result


def classify_moe_route(
    query: str,
    matter_context: dict[str, Any],
    candidates: list[dict[str, Any]],
    fallback_expert: str,
) -> dict[str, Any] | None:
    fallback = json.dumps({"expert": fallback_expert, "confidence": None, "reasons": ["structured_router_fallback"]})
    selected_prompt = get_prompt_registry().select(task=query, route_expert=fallback_expert, matter_context=matter_context)
    prompt = {
        "query": query,
        "matter_context": _compact_context(matter_context),
        "candidate_experts": candidates,
        "allowed_experts": ["research", "drafting", "compliance_guardrails", "intake", "citation_verifier"],
        "recommended_prompt_template": selected_prompt.metadata(),
        "instruction": (
            "Return strict JSON with expert, confidence from 0 to 1, route_mode, and reasons. "
            "Prefer intake when required facts are missing. Prefer compliance for ethics, confidentiality, fee, or supervision risks."
        ),
    }
    result = complete_legal_task(
        task_type="moe_router",
        system_prompt="You are Mercy's MoE legal task router for District of Columbia solo attorneys. Return JSON only.",
        user_prompt=json.dumps(prompt, default=str),
        matter_context=matter_context,
        fallback=fallback,
        prompt_template=selected_prompt.metadata(),
        max_tokens=400,
        temperature=0.0,
    )
    if not result.used_llm:
        return None
    parsed = _parse_json_object(result.content)
    if not parsed:
        return None
    expert = str(parsed.get("expert") or "")
    if expert not in {"research", "drafting", "compliance_guardrails", "intake", "citation_verifier"}:
        return None
    try:
        confidence = float(parsed.get("confidence"))
    except (TypeError, ValueError):
        confidence = 0.0
    return {
        "expert": expert,
        "route_mode": str(parsed.get("route_mode") or ""),
        "confidence": max(0.0, min(confidence, 0.97)),
        "reasons": [str(item) for item in parsed.get("reasons", []) if item],
        "llm": result.to_dict(),
    }


def generate_research_answer(
    query: str,
    retrieval: dict[str, Any],
    matter_context: dict[str, Any],
    route: dict[str, Any] | None,
    fallback: str,
) -> LLMCallResult:
    sources = _source_pack(retrieval.get("results") or [])
    if not sources:
        return _fallback_result("research_generation", fallback, "no_retrieved_official_sources")
    rendered = get_prompt_registry().render(
        task=query,
        matter_context=matter_context,
        retrieved_sources=sources,
        route_expert=str((route or {}).get("expert") or "research"),
        fewshot_count=3,
    )
    return complete_legal_task(
        task_type="research_generation",
        system_prompt=rendered.system_prompt,
        user_prompt=rendered.user_prompt,
        matter_context=matter_context,
        route=route,
        fallback=fallback,
        prompt_template=rendered.metadata(),
        max_tokens=1400,
        temperature=0.15,
    )


def generate_legal_draft(
    task: str,
    matter_context: dict[str, Any],
    retrieval: dict[str, Any],
    route: dict[str, Any] | None,
    fallback: str,
) -> LLMCallResult:
    sources = _source_pack(retrieval.get("results") or [])
    if not sources:
        return _fallback_result("legal_drafting", fallback, "no_retrieved_official_sources")
    rendered = get_prompt_registry().render(
        task=task,
        matter_context=matter_context,
        retrieved_sources=sources,
        route_expert=str((route or {}).get("expert") or "drafting"),
        fewshot_count=3,
    )
    return complete_legal_task(
        task_type="legal_drafting",
        system_prompt=rendered.system_prompt,
        user_prompt=rendered.user_prompt,
        matter_context=matter_context,
        route=route,
        fallback=fallback,
        prompt_template=rendered.metadata(),
        max_tokens=2200,
        temperature=0.2,
    )


def generate_workspace_draft(
    facts: dict[str, Any],
    draft_type: str,
    target_court: str,
    requested_relief: str | None,
    matter_context: dict[str, Any],
    retrieval: dict[str, Any],
    route: dict[str, Any] | None,
    fallback: str,
) -> LLMCallResult:
    task = f"Draft {draft_type} for {target_court}. Requested relief: {requested_relief or 'not specified'}."
    context = {**matter_context, "facts": facts, "target_court": target_court}
    return generate_legal_draft(task, context, retrieval, route, fallback)


def _select_provider(task_type: str) -> tuple[LLMProviderConfig, str] | None:
    if not LITELLM_AVAILABLE:
        return None
    active = active_provider_configs()
    if not active:
        return None
    tier = "reasoning" if task_type in REASONING_TASKS else "fast"
    override = os.getenv("MERCY_LLM_REASONING_MODEL" if tier == "reasoning" else "MERCY_LLM_FAST_MODEL")
    config = active[0]
    model = override or (config.reasoning_model if tier == "reasoning" else config.fast_model)
    return config, model


def _provider_model_override(provider: str, tier: str) -> str | None:
    specific = os.getenv(f"MERCY_LLM_{provider.upper()}_{tier.upper()}_MODEL")
    if specific:
        return specific
    if provider == "gemini" and tier == "fast":
        return os.getenv("GEMINI_MODEL")
    return None


def _fallback_reason(active: list[LLMProviderConfig]) -> str:
    if not LITELLM_AVAILABLE:
        return "litellm_unavailable"
    if not active:
        return "no_provider_api_key_configured"
    return "none"


def _fallback_result(
    task_type: str,
    fallback: str,
    reason: str,
    provider: LLMProviderConfig | None = None,
    model: str | None = None,
    prompt_template: dict[str, Any] | None = None,
) -> LLMCallResult:
    return LLMCallResult(
        content=fallback,
        used_llm=False,
        task_type=task_type,
        provider=provider.provider if provider else None,
        model=model,
        fallback_reason=reason,
        prompt_template=prompt_template,
    )


def _extract_content(response: Any) -> str:
    choices = getattr(response, "choices", None)
    if choices is None and isinstance(response, dict):
        choices = response.get("choices")
    if not choices:
        return ""
    first = choices[0]
    message = getattr(first, "message", None)
    if message is None and isinstance(first, dict):
        message = first.get("message")
    content = getattr(message, "content", None)
    if content is None and isinstance(message, dict):
        content = message.get("content")
    return str(content or "")


def _extract_usage(response: Any) -> dict[str, int]:
    usage = getattr(response, "usage", None)
    if usage is None and isinstance(response, dict):
        usage = response.get("usage")
    if usage is None:
        return {}
    if isinstance(usage, dict):
        raw = usage
    else:
        raw = {
            "prompt_tokens": getattr(usage, "prompt_tokens", None),
            "completion_tokens": getattr(usage, "completion_tokens", None),
            "total_tokens": getattr(usage, "total_tokens", None),
        }
    return {key: int(value) for key, value in raw.items() if isinstance(value, int)}


def _completion_cost(response: Any, model: str, prompt: str, content: str, usage: dict[str, int]) -> float:
    if completion_cost is not None:
        try:
            return round(float(completion_cost(completion_response=response)), 6)  # type: ignore[misc]
        except Exception:
            pass
    prompt_tokens = usage.get("prompt_tokens") or max(1, len(prompt) // 4)
    completion_tokens = usage.get("completion_tokens") or max(1, len(content) // 4)
    input_price, output_price = _pricing_for_model(model)
    return round(((prompt_tokens / 1_000_000) * input_price) + ((completion_tokens / 1_000_000) * output_price), 6)


def _pricing_for_model(model: str) -> tuple[float, float]:
    lower = model.lower()
    for key, pricing in APPROXIMATE_PRICING_PER_1M.items():
        if key in lower:
            return pricing
    return 0.50, 1.50


def _source_pack(results: list[Any]) -> list[dict[str, Any]]:
    packed: list[dict[str, Any]] = []
    for result in results[:6]:
        if not isinstance(result, dict):
            continue
        citation = result.get("citation") if isinstance(result.get("citation"), dict) else {}
        provenance = citation.get("provenance") if isinstance(citation.get("provenance"), dict) else result.get("provenance", {})
        packed.append(
            {
                "citation_label": citation.get("label") or result.get("citation_label") or result.get("source_id"),
                "summary": result.get("summary"),
                "source_title": result.get("source_title") or provenance.get("source_title"),
                "verification_status": result.get("verification_status") or citation.get("verification_status"),
                "official_locator": result.get("official_locator") or provenance.get("official_locator"),
                "url": result.get("url") or provenance.get("url"),
                "combined_score": result.get("combined_score"),
            }
        )
    return packed


def _compact_context(context: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "matter_id",
        "tenant_id",
        "jurisdiction",
        "client_role",
        "matter_type",
        "requested_relief",
        "facts",
        "key_facts",
        "draft_type",
        "surface_context",
    )
    return {key: context[key] for key in keys if key in context}


def _safe_trace_metadata(
    context: dict[str, Any],
    route: dict[str, Any] | None,
    provider: LLMProviderConfig,
    model: str,
    task_type: str,
    prompt_template: dict[str, Any] | None = None,
) -> dict[str, Any]:
    auth_context = context.get("auth_context") if isinstance(context.get("auth_context"), dict) else {}
    return {
        "provider": provider.provider,
        "model": model,
        "task_type": task_type,
        "tenant_id": auth_context.get("tenant_id") or context.get("tenant_id"),
        "user_id": auth_context.get("user_id") or context.get("user_id"),
        "matter_id": context.get("matter_id"),
        "route_expert": route.get("expert") if isinstance(route, dict) else None,
        "route_mode": route.get("route_mode") if isinstance(route, dict) else None,
        "prompt_template_id": prompt_template.get("template_id") if isinstance(prompt_template, dict) else None,
        "prompt_template_version": prompt_template.get("version") if isinstance(prompt_template, dict) else None,
        "client_data_training": "disabled_by_policy",
    }


def _parse_json_object(text: str) -> dict[str, Any] | None:
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
    "ATTORNEY_REVIEW_DISCLAIMER",
    "LLM_PROVIDER_VERSION",
    "LLMCallResult",
    "active_provider_configs",
    "classify_moe_route",
    "complete_legal_task",
    "generate_legal_draft",
    "generate_research_answer",
    "generate_workspace_draft",
    "llm_provider_status",
]
