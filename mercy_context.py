from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4


PRODUCT_NAME = "Mercy"
CORE_NAME = "Mercy Shared Intelligence Core"
DEFAULT_TIER = "free"


@dataclass
class MatterContext:
    matter_id: str
    name: str
    tier: str = DEFAULT_TIER
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    facts: dict[str, Any] = field(default_factory=dict)
    drafts: list[dict[str, Any]] = field(default_factory=list)
    billing_events: list[dict[str, Any]] = field(default_factory=list)


class InMemoryMatterStore:
    """Stateless-by-default case context for local development.

    This keeps product workflow state available to the dashboard and Word add-in
    without creating a persistent client-data vault.
    """

    def __init__(self) -> None:
        self._matters: dict[str, MatterContext] = {}

    def create(self, name: str, tier: str = DEFAULT_TIER) -> dict[str, Any]:
        matter = MatterContext(matter_id=str(uuid4()), name=name, tier=tier)
        self._matters[matter.matter_id] = matter
        return asdict(matter)

    def get(self, matter_id: str) -> dict[str, Any] | None:
        matter = self._matters.get(matter_id)
        return asdict(matter) if matter else None

    def list(self) -> list[dict[str, Any]]:
        return [asdict(matter) for matter in self._matters.values()]

    def attach_facts(self, matter_id: str, facts: dict[str, Any]) -> None:
        matter = self._matters.get(matter_id)
        if matter:
            matter.facts = facts

    def attach_draft(self, matter_id: str, draft: dict[str, Any]) -> None:
        matter = self._matters.get(matter_id)
        if matter:
            matter.drafts.append(draft)

    def attach_billing_event(self, matter_id: str, event: dict[str, Any]) -> None:
        matter = self._matters.get(matter_id)
        if matter:
            matter.billing_events.append(event)


MATTERS = InMemoryMatterStore()


def build_billing_report(matter: dict[str, Any]) -> dict[str, Any]:
    events = matter.get("billing_events") or []
    total_minutes = sum(int(event.get("estimated_minutes_saved", 0)) for event in events)
    line_items = [
        {
            "description": f"AI-assisted {event.get('task', 'legal workflow').replace('_', ' ')}",
            "estimated_minutes_saved": event.get("estimated_minutes_saved", 0),
            "client_disbursement_note": "Review client engagement terms before billing.",
        }
        for event in events
    ]
    return {
        "matter_id": matter["matter_id"],
        "matter_name": matter["name"],
        "generated_at": datetime.now(UTC).isoformat(),
        "line_items": line_items,
        "total_estimated_minutes_saved": total_minutes,
        "ethics_note": (
            "D.C. Bar Ethics Opinion 388 requires competent supervision, "
            "confidentiality safeguards, citation verification, and reasonable fees."
        ),
    }


def product_capabilities() -> dict[str, Any]:
    return {
        "product": PRODUCT_NAME,
        "core": CORE_NAME,
        "positioning": "Affordable D.C.-native alternative for appellate and administrative practice.",
        "windows": ["standalone_platform", "word_plugin"],
        "tiers": {
            "free": [
                "single-document drafting",
                "basic citation placeholders",
                "basic D.C. guardrail checks",
            ],
            "premium": [
                "multi-document administrative record indexing",
                "audit trail and citation verification workflow",
                "client billing report",
                "project context sync between platform and plugin",
            ],
        },
        "security_posture": {
            "mode": "zero-retention local development",
            "storage": "in-memory matter context unless a deployment store is explicitly configured",
            "training_use": "client data is not used for model training by Mercy",
        },
    }
