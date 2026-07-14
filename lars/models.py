"""Canonical LARS / ALTS data models.

These models are JSON-serializable and used by the durable store, API, and UI.
They do not replace MoE route decisions, agent results, or response envelopes.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any
from uuid import uuid4


LARS_VERSION = "mercy-lars-1.0"
ALTS_VERSION = "mercy-alts-1.0"
ALTS_MOE_VERSION = "mercy-alts-moe-1.0"


def utc_now() -> datetime:
    return datetime.now(UTC)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:16]}"


class JobStatus(str, Enum):
    DRAFT = "draft"
    QUEUED = "queued"
    RUNNING = "running"
    PAUSED = "paused"
    WAITING_ATTORNEY = "waiting_attorney"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELED = "canceled"
    BLOCKED = "blocked"


class NodeType(str, Enum):
    ROOT = "root_assignment"
    ISSUE = "issue"
    HYPOTHESIS = "hypothesis"
    RESEARCH = "research"
    EVIDENCE = "evidence"
    CONTRARY_AUTHORITY = "contrary_authority"
    FACTUAL_DEPENDENCY = "factual_dependency"
    CONTRADICTION = "contradiction"
    DRAFT = "draft"
    CRITIQUE = "critique"
    REVISION = "revision"
    SYNTHESIS = "synthesis"
    VERIFICATION = "verification"
    ATTORNEY_CHECKPOINT = "attorney_checkpoint"
    FINAL_ARTIFACT = "final_artifact"


class NodeStatus(str, Enum):
    OPEN = "open"
    ACTIVE = "active"
    RETAINED = "retained"
    REVISED = "revised"
    MERGED = "merged"
    PRUNED = "pruned"
    CHALLENGED = "challenged"
    VERIFIED = "verified"
    BLOCKED = "blocked"
    COMPLETE = "complete"


class AltsAction(str, Enum):
    EXPAND_WIDER = "EXPAND_WIDER"
    DEEPEN = "DEEPEN"
    CHALLENGE = "CHALLENGE"
    REVISE = "REVISE"
    MERGE = "MERGE"
    PRUNE = "PRUNE"
    PAUSE_FOR_ATTORNEY = "PAUSE_FOR_ATTORNEY"
    SYNTHESIZE = "SYNTHESIZE"
    VERIFY = "VERIFY"
    COMPLETE = "COMPLETE"


class GateType(str, Enum):
    ASSIGNMENT = "assignment_approval"
    RESEARCH_PLAN = "research_plan_approval"
    FACTUAL_ASSUMPTION = "factual_assumption_approval"
    HIGH_RISK_THEORY = "high_risk_theory_approval"
    CONTRADICTION = "contradiction_resolution_approval"
    DRAFT = "draft_approval"
    FINAL = "final_deliverable_approval"


class ContradictionType(str, Enum):
    AUTHORITY_VS_AUTHORITY = "authority_vs_authority"
    FACT_VS_FACT = "matter_fact_vs_matter_fact"
    FACT_VS_ASSUMPTION = "matter_fact_vs_assumption"
    AUTHORITY_VS_DRAFT = "authority_vs_draft_proposition"
    JURISDICTION_MISMATCH = "jurisdiction_mismatch"
    DATE_MISMATCH = "date_mismatch"
    CITATION_MISMATCH = "citation_mismatch"
    TREATMENT_CONFLICT = "treatment_conflict"
    AGENT_CONFLICT = "agent_conclusion_conflict"
    DOCUMENT_METADATA = "document_metadata_conflict"


# Attorney contradiction decisions that close a conflict for ALTS budgeting.
CONTRADICTION_TERMINAL_STATUSES = frozenset(
    {
        "resolved",
        "preserve_both",
        "immaterial",
        "accepted_risk",
    }
)


def contradiction_is_open(status: str | None) -> bool:
    """True when the contradiction still needs attorney/ALTS attention."""
    normalized = (status or "open").strip().lower().replace("-", "_").replace(" ", "_")
    if normalized in {"open", "reopen", "reopened"}:
        return True
    return normalized not in CONTRADICTION_TERMINAL_STATUSES


DELIVERABLE_TYPES = frozenset(
    {
        "research_memorandum",
        "motion",
        "brief",
        "contract_review",
        "chronology",
        "authority_table",
        "claims_evidence_matrix",
        "risk_report",
        "executive_summary",
        "source_appendix",
        "client_communication",
        "word_document",
        "presentation_summary",
    }
)

DEFAULT_BUDGETS = {
    "max_tree_depth": 6,
    "max_active_branches": 8,
    "max_children_per_node": 4,
    "max_revisions_per_node": 3,
    "max_model_calls": 40,
    "max_tool_calls": 60,
    "max_duration_seconds": 1800,
    "max_cost_usd": 5.0,
    "max_unresolved_contradictions": 2,
    "max_retry_count": 3,
    "max_steps_per_tick": 4,
}


def _dt(value: datetime | None = None) -> str:
    return (value or utc_now()).isoformat()


@dataclass
class BudgetState:
    max_tree_depth: int = DEFAULT_BUDGETS["max_tree_depth"]
    max_active_branches: int = DEFAULT_BUDGETS["max_active_branches"]
    max_children_per_node: int = DEFAULT_BUDGETS["max_children_per_node"]
    max_revisions_per_node: int = DEFAULT_BUDGETS["max_revisions_per_node"]
    max_model_calls: int = DEFAULT_BUDGETS["max_model_calls"]
    max_tool_calls: int = DEFAULT_BUDGETS["max_tool_calls"]
    max_duration_seconds: int = DEFAULT_BUDGETS["max_duration_seconds"]
    max_cost_usd: float = DEFAULT_BUDGETS["max_cost_usd"]
    max_unresolved_contradictions: int = DEFAULT_BUDGETS["max_unresolved_contradictions"]
    max_retry_count: int = DEFAULT_BUDGETS["max_retry_count"]
    max_steps_per_tick: int = DEFAULT_BUDGETS["max_steps_per_tick"]
    model_calls_used: int = 0
    tool_calls_used: int = 0
    cost_usd_used: float = 0.0
    started_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> "BudgetState":
        raw = data or {}
        known = {key: raw[key] for key in cls.__dataclass_fields__ if key in raw}
        return cls(**known)


@dataclass
class LegalAssignment:
    assignment_id: str
    tenant_id: str
    user_id: str
    firm_id: str | None
    matter_id: str | None
    workspace: str
    jurisdiction: str
    legal_questions: list[str]
    deliverable_type: str
    query: str
    factual_assumptions: list[str] = field(default_factory=list)
    disputed_facts: list[str] = field(default_factory=list)
    selected_document_ids: list[str] = field(default_factory=list)
    source_restrictions: list[str] = field(default_factory=list)
    official_source_preference: bool = True
    intended_audience: str = "attorney"
    tone: str = "professional_dc"
    research_depth: str = "standard"
    citation_requirements: list[str] = field(default_factory=lambda: ["official_dc_sources_preferred", "no_fabricated_citations"])
    approval_checkpoints: list[str] = field(
        default_factory=lambda: [
            GateType.ASSIGNMENT.value,
            GateType.DRAFT.value,
            GateType.FINAL.value,
        ]
    )
    privilege_constraints: list[str] = field(default_factory=lambda: ["attorney_client_privilege_preserved"])
    confidentiality_constraints: list[str] = field(default_factory=lambda: ["tenant_isolated", "matter_scoped"])
    excluded_theories: list[str] = field(default_factory=list)
    excluded_sources: list[str] = field(default_factory=list)
    require_adverse_authority_review: bool = True
    require_treatment_validation: bool = True
    required_output_formats: list[str] = field(default_factory=lambda: ["structured_json", "attorney_review_markdown"])
    governing_law: str = "District of Columbia"
    relevant_date: str | None = None
    deadline: str | None = None
    missing_critical_inputs: list[str] = field(default_factory=list)
    constrained_assumptions: list[str] = field(default_factory=list)
    clarification_required: bool = False
    budgets: BudgetState = field(default_factory=BudgetState)
    created_at: str = field(default_factory=_dt)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["budgets"] = self.budgets.to_dict()
        return payload

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "LegalAssignment":
        payload = dict(data)
        budgets = BudgetState.from_dict(payload.pop("budgets", None))
        known = {key: payload[key] for key in cls.__dataclass_fields__ if key in payload and key != "budgets"}
        return cls(budgets=budgets, **known)


@dataclass
class Hypothesis:
    hypothesis_id: str
    legal_proposition: str
    supporting_factual_conditions: list[str] = field(default_factory=list)
    required_authority: list[str] = field(default_factory=list)
    possible_defenses: list[str] = field(default_factory=list)
    counterarguments: list[str] = field(default_factory=list)
    contrary_authority: list[str] = field(default_factory=list)
    procedural_implications: list[str] = field(default_factory=list)
    confidence: float = 0.0
    status: str = "open"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Hypothesis":
        known = {key: data[key] for key in cls.__dataclass_fields__ if key in data}
        return cls(**known)


@dataclass
class EvaluationScores:
    controlling_authority_strength: float = 0.0
    jurisdiction_fit: float = 0.0
    source_authenticity: float = 0.0
    authority_hierarchy: float = 0.0
    factual_record_support: float = 0.0
    matter_document_grounding: float = 0.0
    citation_entailment: float = 0.0
    citation_completeness: float = 0.0
    treatment_validity: float = 0.0
    procedural_relevance: float = 0.0
    temporal_validity: float = 0.0
    adverse_authority_coverage: float = 0.0
    counterargument_coverage: float = 0.0
    contradiction_resolution: float = 0.0
    legal_risk: float = 0.5
    privilege_risk: float = 0.0
    confidentiality_risk: float = 0.0
    unsupported_claim_risk: float = 0.5
    outdated_law_risk: float = 0.2
    missing_fact_risk: float = 0.5
    redundancy: float = 0.0
    novelty: float = 0.5
    expected_value_of_further_research: float = 0.5
    overall: float = 0.0
    explanation: str = ""
    weights: dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> "EvaluationScores":
        raw = data or {}
        known = {key: raw[key] for key in cls.__dataclass_fields__ if key in raw}
        return cls(**known)


@dataclass
class AuthorityRecord:
    authority_id: str
    citation: str
    title: str
    court_or_body: str
    jurisdiction: str
    date: str | None
    authority_type: str
    precedential_weight: str
    classification: str
    official_source_url: str | None
    retrieved_text: str
    relevant_passages: list[str]
    proposition_supported: str | None
    proposition_contradicted: str | None
    treatment_status: str
    validation_status: str
    retrieval_timestamp: str
    source_authenticity_result: str
    node_id: str | None = None
    branch_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "AuthorityRecord":
        known = {key: data[key] for key in cls.__dataclass_fields__ if key in data}
        return cls(**known)


@dataclass
class MatterEvidenceRecord:
    evidence_id: str
    document_id: str | None
    page_or_paragraph: str | None
    text_span: str
    metadata: dict[str, Any]
    relevant_fact: str
    fact_status: str
    disputed: bool
    hypothesis_id: str | None
    confidence: float
    attorney_validation_status: str
    node_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "MatterEvidenceRecord":
        known = {key: data[key] for key in cls.__dataclass_fields__ if key in data}
        return cls(**known)


@dataclass
class ContradictionRecord:
    contradiction_id: str
    contradiction_type: str
    conflicting_items: list[dict[str, Any]]
    severity: str
    impacted_branch_ids: list[str]
    proposed_resolution: str
    resolution_evidence: list[str]
    resolution_status: str
    responsible_node_id: str | None = None
    created_at: str = field(default_factory=_dt)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ContradictionRecord":
        known = {key: data[key] for key in cls.__dataclass_fields__ if key in data}
        return cls(**known)


@dataclass
class ApprovalGate:
    gate_id: str
    gate_type: str
    status: str
    required: bool
    prompt: str
    decision: str | None = None
    decided_by: str | None = None
    decided_at: str | None = None
    notes: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ApprovalGate":
        known = {key: data[key] for key in cls.__dataclass_fields__ if key in data}
        return cls(**known)


@dataclass
class TreeNode:
    node_id: str
    job_id: str
    branch_id: str
    parent_ids: list[str]
    child_ids: list[str]
    node_type: str
    hypothesis: str | None
    research_question: str | None
    proposed_legal_theory: str | None
    factual_dependencies: list[str]
    jurisdiction: str
    relevant_date: str | None
    assigned_agents: list[str]
    assigned_models: list[str]
    tools_used: list[str]
    search_queries: list[str]
    matter_documents_used: list[str]
    authorities_found: list[dict[str, Any]]
    supporting_evidence: list[dict[str, Any]]
    contrary_evidence: list[dict[str, Any]]
    missing_evidence: list[str]
    contradictions: list[str]
    draft_conclusions: list[str]
    confidence: float
    evaluation: EvaluationScores
    cost_consumed: float
    time_consumed_ms: int
    token_usage: dict[str, Any]
    status: str
    retention_decision: str
    decision_explanation: str
    moe_route: dict[str, Any] = field(default_factory=dict)
    agent_result: dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=_dt)
    updated_at: str = field(default_factory=_dt)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["evaluation"] = self.evaluation.to_dict()
        return payload

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TreeNode":
        payload = dict(data)
        evaluation = EvaluationScores.from_dict(payload.pop("evaluation", None))
        known = {key: payload[key] for key in cls.__dataclass_fields__ if key in payload and key != "evaluation"}
        return cls(evaluation=evaluation, **known)


@dataclass
class ResearchJob:
    job_id: str
    tenant_id: str
    user_id: str
    firm_id: str | None
    assignment: LegalAssignment
    status: str
    root_node_id: str
    active_branch_ids: list[str]
    retained_branch_ids: list[str]
    pruned_branch_ids: list[str]
    nodes: dict[str, TreeNode]
    hypotheses: dict[str, Hypothesis]
    authorities: dict[str, AuthorityRecord]
    evidence: dict[str, MatterEvidenceRecord]
    contradictions: dict[str, ContradictionRecord]
    gates: list[ApprovalGate]
    events: list[dict[str, Any]]
    artifacts: list[dict[str, Any]]
    budgets: BudgetState
    last_action: str | None = None
    last_error: str | None = None
    retry_count: int = 0
    created_at: str = field(default_factory=_dt)
    updated_at: str = field(default_factory=_dt)
    completed_at: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "tenant_id": self.tenant_id,
            "user_id": self.user_id,
            "firm_id": self.firm_id,
            "assignment": self.assignment.to_dict(),
            "status": self.status,
            "root_node_id": self.root_node_id,
            "active_branch_ids": list(self.active_branch_ids),
            "retained_branch_ids": list(self.retained_branch_ids),
            "pruned_branch_ids": list(self.pruned_branch_ids),
            "nodes": {key: node.to_dict() for key, node in self.nodes.items()},
            "hypotheses": {key: hyp.to_dict() for key, hyp in self.hypotheses.items()},
            "authorities": {key: auth.to_dict() for key, auth in self.authorities.items()},
            "evidence": {key: item.to_dict() for key, item in self.evidence.items()},
            "contradictions": {key: item.to_dict() for key, item in self.contradictions.items()},
            "gates": [gate.to_dict() for gate in self.gates],
            "events": list(self.events),
            "artifacts": list(self.artifacts),
            "budgets": self.budgets.to_dict(),
            "last_action": self.last_action,
            "last_error": self.last_error,
            "retry_count": self.retry_count,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "completed_at": self.completed_at,
            "metadata": dict(self.metadata),
            "lars_version": LARS_VERSION,
            "alts_version": ALTS_VERSION,
            "alts_moe_version": ALTS_MOE_VERSION,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ResearchJob":
        return cls(
            job_id=str(data["job_id"]),
            tenant_id=str(data["tenant_id"]),
            user_id=str(data["user_id"]),
            firm_id=data.get("firm_id"),
            assignment=LegalAssignment.from_dict(data["assignment"]),
            status=str(data["status"]),
            root_node_id=str(data["root_node_id"]),
            active_branch_ids=list(data.get("active_branch_ids") or []),
            retained_branch_ids=list(data.get("retained_branch_ids") or []),
            pruned_branch_ids=list(data.get("pruned_branch_ids") or []),
            nodes={key: TreeNode.from_dict(value) for key, value in (data.get("nodes") or {}).items()},
            hypotheses={key: Hypothesis.from_dict(value) for key, value in (data.get("hypotheses") or {}).items()},
            authorities={key: AuthorityRecord.from_dict(value) for key, value in (data.get("authorities") or {}).items()},
            evidence={key: MatterEvidenceRecord.from_dict(value) for key, value in (data.get("evidence") or {}).items()},
            contradictions={
                key: ContradictionRecord.from_dict(value) for key, value in (data.get("contradictions") or {}).items()
            },
            gates=[ApprovalGate.from_dict(item) for item in (data.get("gates") or [])],
            events=list(data.get("events") or []),
            artifacts=list(data.get("artifacts") or []),
            budgets=BudgetState.from_dict(data.get("budgets")),
            last_action=data.get("last_action"),
            last_error=data.get("last_error"),
            retry_count=int(data.get("retry_count") or 0),
            created_at=str(data.get("created_at") or _dt()),
            updated_at=str(data.get("updated_at") or _dt()),
            completed_at=data.get("completed_at"),
            metadata=dict(data.get("metadata") or {}),
        )


def append_event(job: ResearchJob, event_type: str, detail: dict[str, Any] | None = None) -> None:
    job.events.append(
        {
            "event_id": new_id("evt"),
            "event_type": event_type,
            "detail": detail or {},
            "timestamp": _dt(),
        }
    )
    job.updated_at = _dt()
