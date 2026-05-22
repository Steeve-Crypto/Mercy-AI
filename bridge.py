from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from system_prompts import (
    CLERK_OS_VERSION,
    build_clerk_prompt,
)


ROOT_DIR = Path(__file__).resolve().parent
DISCOVERY_SRC = ROOT_DIR / "legal_discovery_ai" / "src"
RUNTIME_DIR = ROOT_DIR / ".districtdraft_runtime"
RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

os.environ["LOCALAPPDATA"] = str(RUNTIME_DIR / "localappdata")
os.environ.setdefault("CREWAI_DISABLE_TELEMETRY", "true")
os.environ.setdefault("CREWAI_DISABLE_TRACKING", "true")

try:
    import appdirs

    appdirs.user_data_dir = lambda appname=None, appauthor=None, **_: str(
        RUNTIME_DIR / "crewai" / str(appname or "default")
    )
except Exception:
    pass

if str(DISCOVERY_SRC) not in sys.path:
    sys.path.insert(0, str(DISCOVERY_SRC))

try:
    from legal_discovery_ai.crew import PROJECT_ROOT, run_crew  # type: ignore[import-not-found] # noqa: E402
except ImportError as exc:
    PROJECT_ROOT = ROOT_DIR / "legal_discovery_ai"
    _CREW_IMPORT_ERROR = exc

    def run_crew(*, document_path: str, document_text: str | None = None) -> dict[str, Any]:
        text = (document_text or "").strip()
        if not text:
            try:
                text = Path(document_path).read_text(encoding="utf-8", errors="ignore")[:4000]
            except OSError:
                text = ""
        return {
            "case_summary": text[:1200] or "CrewAI discovery stack unavailable; attorney must review the source document directly.",
            "key_issues": ["CrewAI optional dependency unavailable; deterministic bridge fallback used."],
            "timeline": [],
            "fallback_reason": str(_CREW_IMPORT_ERROR),
        }


def _normalize_result(result: object) -> dict[str, Any]:
    if isinstance(result, dict):
        return result
    if isinstance(result, str):
        try:
            parsed = json.loads(result)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return {"case_summary": result}
    return {"case_summary": str(result)}


def _billing_hook(task: str, baseline_minutes: int, actual_minutes: int = 5) -> dict[str, Any]:
    saved = max(0, baseline_minutes - actual_minutes)
    return {
        "task": task,
        "baseline_minutes": baseline_minutes,
        "estimated_ai_assisted_minutes": actual_minutes,
        "estimated_minutes_saved": saved,
        "billing_note": (
            "D.C. Bar Ethics Opinion 388 requires reasonable fee treatment and "
            "attorney supervision; review engagement terms before billing."
        ),
    }


def run_discovery(document_path: str, document_text: str | None = None) -> dict[str, Any]:
    """Feed a document into the existing Legal Discovery AI crew."""
    result = run_crew(document_path=document_path, document_text=document_text)
    facts = _normalize_result(result)
    return {
        "workspace": "DistrictDraft",
        "engine": "legal_discovery_ai.run_crew",
        "document_path": document_path,
        "facts": facts,
        "citations": [
            {
                "label": Path(document_path).name,
                "source_type": "user_provided_document",
                "verification_status": "source_supplied_unverified",
                "note": "Document facts are user-supplied and require attorney verification against the source file.",
                "provenance": {"document_path": document_path},
            }
        ],
        "premium_billing_hook": _billing_hook("discovery_analysis", 180, 15),
    }


def _fallback_draft(
    facts: dict[str, Any],
    draft_type: str,
    target_court: str,
    requested_relief: str | None,
) -> str:
    case_summary = facts.get("case_summary") or facts.get("extracted_text_summary")
    key_issues = facts.get("key_issues") or facts.get("critical_risks") or []
    timeline = facts.get("timeline") or []
    relief = requested_relief or "[INSERT PRECISE RELIEF SOUGHT]"

    if isinstance(key_issues, dict):
        key_issues = [f"{k}: {v}" for k, v in key_issues.items()]
    if isinstance(timeline, dict):
        timeline = [f"{k}: {v}" for k, v in timeline.items()]

    issue_text = "\n".join(f"{idx}. {item}" for idx, item in enumerate(key_issues, 1))
    timeline_text = "\n".join(f"- {item}" for item in timeline)

    return f"""Draft Type: {draft_type}
Court: {target_court}

Statement
{case_summary or '[INSERT FACTUAL SUMMARY FROM VERIFIED RECORD]'}

Issues Presented
{issue_text or '[INSERT ISSUE PRESENTED WITH STANDARD OF REVIEW]'}

Record-Based Facts
{timeline_text or '[INSERT RECORD CITATIONS]'}

Argument
On the present record, counsel should frame the requested relief around the
verified facts and the applicable D.C. Circuit standard of review. [VERIFY CITE]
The draft should be conformed to Rule 28 before filing, including a jurisdictional
statement, statement of issues, summary of argument, argument with authorities
and record citations, and a precise conclusion.

Conclusion
For these reasons, the Court should {relief}.

Human Review Note
Attorney review is required for confidentiality, accuracy, legal authority,
record citations, and D.C. Bar Ethics Opinion 388 compliance.
"""


def _call_llm(prompt: str) -> str | None:
    # Workspace drafting is upgraded by main.py through llm_providers.py after
    # D.C. RAG grounding is attached. Keep the bridge fallback deterministic so
    # this brownfield helper cannot bypass the shared LiteLLM provider layer.
    _ = prompt
    return None


def draft_from_facts(
    facts: dict[str, Any],
    draft_type: str,
    target_court: str = "U.S. Court of Appeals for the D.C. Circuit",
    requested_relief: str | None = None,
) -> dict[str, Any]:
    prompt = build_clerk_prompt(
        facts=facts,
        draft_type=draft_type,
        target_court=target_court,
        requested_relief=requested_relief,
    )
    llm_draft = _call_llm(prompt)
    draft = llm_draft or _fallback_draft(facts, draft_type, target_court, requested_relief)
    return {
        "workspace": "DistrictDraft",
        "engine": "clerk_os",
        "clerk_os_version": CLERK_OS_VERSION,
        "target_court": target_court,
        "draft_type": draft_type,
        "draft": draft,
        "human_review_required": True,
        "citations": [
            {
                "label": "[VERIFY CITE]",
                "source_type": "placeholder",
                "verification_status": "missing_required",
                "note": "Draft output must be checked against official authority and record citations.",
                "provenance": {"engine": "clerk_os", "draft_type": draft_type},
            }
        ],
        "premium_billing_hook": _billing_hook("appellate_drafting", 240, 30),
    }


__all__ = ["PROJECT_ROOT", "run_discovery", "draft_from_facts"]
