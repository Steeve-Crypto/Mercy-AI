from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from observability import trace_event
from prompts.dc_legal_prompts import DC_LEGAL_PROMPTS, PROMPT_LIBRARY_VERSION, PromptTemplate


FEWSHOT_PATH = Path(__file__).resolve().parent / "fewshot" / "dc_examples.jsonl"


@dataclass(frozen=True)
class FewShotExample:
    example_id: str
    task: str
    tags: tuple[str, ...]
    input: str
    output: str

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "FewShotExample":
        return cls(
            example_id=str(payload["example_id"]),
            task=str(payload["task"]),
            tags=tuple(str(tag) for tag in payload.get("tags", [])),
            input=str(payload["input"]),
            output=str(payload["output"]),
        )

    def to_prompt_block(self) -> str:
        return f"Example {self.example_id}\nInput: {self.input}\nOutput: {self.output}"


@dataclass(frozen=True)
class RenderedPrompt:
    template: PromptTemplate
    system_prompt: str
    user_prompt: str
    examples: tuple[FewShotExample, ...]

    def metadata(self) -> dict[str, Any]:
        return {
            **self.template.metadata(),
            "fewshot_example_ids": [example.example_id for example in self.examples],
            "fewshot_count": len(self.examples),
        }


class PromptRegistry:
    def __init__(self, fewshot_path: Path | None = None) -> None:
        self.version = PROMPT_LIBRARY_VERSION
        self._templates = {template.template_id: template for template in DC_LEGAL_PROMPTS}
        self._examples = self._load_examples(fewshot_path or FEWSHOT_PATH)

    def list_templates(self) -> list[dict[str, Any]]:
        return [template.metadata() for template in sorted(self._templates.values(), key=lambda item: item.template_id)]

    def status(self) -> dict[str, Any]:
        tasks = sorted({template.task for template in self._templates.values()})
        return {
            "version": self.version,
            "template_count": len(self._templates),
            "fewshot_example_count": len(self._examples),
            "tasks": tasks,
            "templates": self.list_templates(),
            "grounding": "official_dc_sources_pd032_pd038",
            "seeded_knowledge_requirement": "uses seeded D.C. knowledge base with 1,145+ chunks when available",
            "attorney_review_required": True,
        }

    def get(self, template_id: str) -> PromptTemplate:
        if template_id not in self._templates:
            raise KeyError(f"Unknown prompt template: {template_id}")
        return self._templates[template_id]

    def select(
        self,
        *,
        task: str,
        route_expert: str | None = None,
        matter_context: dict[str, Any] | None = None,
    ) -> PromptTemplate:
        task_lower = task.lower()
        context = matter_context or {}
        requested = str(context.get("prompt_template") or "").strip()
        if requested and requested in self._templates:
            template = self._templates[requested]
        else:
            template = self._select_by_signals(task_lower, route_expert, context)
        trace_event(
            name="prompt_template_selected",
            surface_context=str(context.get("surface_context") or "prompt_registry"),
            category="prompt",
            matter_reference=str(context.get("matter_id")) if context.get("matter_id") else None,
            metadata={
                "template_id": template.template_id,
                "task": template.task,
                "route_expert": route_expert,
                "version": template.version,
                "fewshot_tags": list(template.fewshot_tags),
            },
        )
        return template

    def render(
        self,
        *,
        template_id: str | None = None,
        task: str,
        matter_context: dict[str, Any] | None = None,
        retrieved_sources: list[dict[str, Any]] | None = None,
        route_expert: str | None = None,
        fewshot_count: int = 3,
    ) -> RenderedPrompt:
        template = self.get(template_id) if template_id else self.select(task=task, route_expert=route_expert, matter_context=matter_context)
        examples = self.examples_for(template, count=fewshot_count)
        payload = {
            "task": task,
            "matter_context": json.dumps(matter_context or {}, default=str),
            "retrieved_sources": json.dumps(retrieved_sources or [], default=str),
            "fewshot_examples": "\n\n".join(example.to_prompt_block() for example in examples),
        }
        rendered = RenderedPrompt(
            template=template,
            system_prompt=template.system,
            user_prompt=template.user_template.format(**payload),
            examples=tuple(examples),
        )
        trace_event(
            name="prompt_rendered",
            surface_context=str((matter_context or {}).get("surface_context") or "prompt_registry"),
            category="prompt",
            matter_reference=str((matter_context or {}).get("matter_id")) if (matter_context or {}).get("matter_id") else None,
            metadata=rendered.metadata(),
        )
        return rendered

    def examples_for(self, template: PromptTemplate, count: int = 3) -> list[FewShotExample]:
        tags = set(template.fewshot_tags)
        matches = [
            example
            for example in self._examples
            if example.task == template.task or tags.intersection(example.tags)
        ]
        return matches[: max(0, count)]

    def _select_by_signals(self, task_lower: str, route_expert: str | None, context: dict[str, Any]) -> PromptTemplate:
        practice_area = str(context.get("practice_area") or context.get("matter_type") or "").lower()
        draft_type = str(context.get("draft_type") or context.get("workflow") or "").lower()
        signals = f"{task_lower} {practice_area} {draft_type}"
        if route_expert == "citation_verifier":
            return self._templates["citation_generation_verification"]
        if route_expert == "compliance_guardrails":
            return self._templates["dc_ethics_rpc_check"]
        if route_expert == "intake":
            return self._templates["client_intake_matter_summary"]
        if route_expert == "drafting":
            drafting_order = [
                ("contract_redline_review", ("redline", "clause", "revise contract", "contract review")),
                ("contract_retainer_drafting", ("retainer", "engagement", "contract", "agreement")),
                ("family_law_review", ("family", "custody", "support", "domestic", "neglect")),
                ("zoning_land_use_analysis", ("zoning", "land use", "variance", "permit")),
                ("administrative_appeal_briefing", ("administrative", "agency", "petition for review", "record")),
                ("small_business_compliance", ("small business", "llc", "compliance", "license", "employment")),
                ("landlord_tenant_motion", ("landlord", "tenant", "possession", "housing")),
                ("motion_drafting_superior_court", ("motion", "opposition", "reply", "superior court", "draft")),
                ("pleading_drafting_superior_court", ("complaint", "answer", "pleading", "small claims")),
            ]
            for template_id, keywords in drafting_order:
                if any(keyword in signals for keyword in keywords):
                    return self._templates[template_id]
            return self._templates["motion_drafting_superior_court"]
        ordered = [
            ("citation_generation_verification", ("citation", "cite", "bluebook", "pinpoint", "verify")),
            ("dc_ethics_rpc_check", ("ethics", "rpc", "professional conduct", "fee", "confidentiality", "conflict")),
            ("client_intake_matter_summary", ("intake", "new matter", "client", "scope", "conflict")),
            ("contract_retainer_drafting", ("retainer", "engagement", "contract draft", "agreement")),
            ("contract_redline_review", ("redline", "clause", "revise contract", "contract review")),
            ("family_law_review", ("family", "custody", "support", "domestic", "neglect")),
            ("zoning_land_use_analysis", ("zoning", "land use", "variance", "permit")),
            ("administrative_appeal_briefing", ("administrative", "agency", "petition for review", "record")),
            ("small_business_compliance", ("small business", "llc", "compliance", "license", "employment")),
            ("landlord_tenant_motion", ("landlord", "tenant", "possession", "housing")),
            ("motion_drafting_superior_court", ("motion", "opposition", "reply", "superior court")),
            ("pleading_drafting_superior_court", ("complaint", "answer", "pleading", "small claims")),
        ]
        for template_id, keywords in ordered:
            if any(keyword in signals for keyword in keywords):
                return self._templates[template_id]
        if route_expert == "research":
            return self._templates["legal_research_official_dc"]
        return self._templates["legal_research_official_dc"]

    @staticmethod
    def _load_examples(path: Path) -> list[FewShotExample]:
        if not path.exists():
            return []
        examples: list[FewShotExample] = []
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            payload = json.loads(line)
            examples.append(FewShotExample.from_payload(payload))
        return examples


_REGISTRY: PromptRegistry | None = None


def get_prompt_registry() -> PromptRegistry:
    global _REGISTRY
    if _REGISTRY is None:
        _REGISTRY = PromptRegistry()
    return _REGISTRY


def prompt_registry_status() -> dict[str, Any]:
    return get_prompt_registry().status()


__all__ = [
    "FewShotExample",
    "PromptRegistry",
    "RenderedPrompt",
    "get_prompt_registry",
    "prompt_registry_status",
]
