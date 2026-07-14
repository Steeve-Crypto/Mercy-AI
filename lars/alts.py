"""Mercy ALTS — Adaptive Legal Tree Search controller."""

from __future__ import annotations

from typing import Any

from lars.evaluator import branch_rank, evaluate_node
from lars.models import (
    ALTS_VERSION,
    AltsAction,
    ApprovalGate,
    EvaluationScores,
    GateType,
    Hypothesis,
    JobStatus,
    NodeStatus,
    NodeType,
    ResearchJob,
    TreeNode,
    append_event,
    contradiction_is_open,
    new_id,
    utc_now,
)


def _budget_exhausted(job: ResearchJob) -> str | None:
    budgets = job.budgets
    if budgets.model_calls_used >= budgets.max_model_calls:
        return "max_model_calls"
    if budgets.tool_calls_used >= budgets.max_tool_calls:
        return "max_tool_calls"
    if budgets.cost_usd_used >= budgets.max_cost_usd:
        return "max_cost_usd"
    if budgets.started_at:
        try:
            started = budgets.started_at
            # ISO parse without dependency: compare string duration via stored ms on nodes
            total_ms = sum(node.time_consumed_ms for node in job.nodes.values())
            if total_ms / 1000.0 >= budgets.max_duration_seconds:
                return "max_duration_seconds"
        except Exception:
            pass
    unresolved = [
        item
        for item in job.contradictions.values()
        if contradiction_is_open(item.resolution_status) and item.severity in {"critical", "high"}
    ]
    if len(unresolved) > budgets.max_unresolved_contradictions and job.status not in {
        JobStatus.WAITING_ATTORNEY.value,
        JobStatus.VERIFYING.value,
    }:
        return "max_unresolved_contradictions"
    return None


def _pending_required_gate(job: ResearchJob) -> ApprovalGate | None:
    """Return a pending gate only when it is in-scope for the current phase.

    Draft/final gates are created up front for attorney visibility, but they must
    not block early research. Phase-aware gating keeps long-horizon jobs moving
    until the relevant checkpoint is actually due.
    """
    has_synthesis = any(node.node_type == NodeType.SYNTHESIS.value for node in job.nodes.values())
    has_verification = any(node.node_type == NodeType.VERIFICATION.value for node in job.nodes.values())
    has_final = any(node.node_type == NodeType.FINAL_ARTIFACT.value for node in job.nodes.values())
    has_hypotheses = bool(job.hypotheses) or any(
        node.node_type == NodeType.HYPOTHESIS.value for node in job.nodes.values()
    )
    open_contradictions = any(
        contradiction_is_open(item.resolution_status) and item.severity in {"critical", "high"}
        for item in job.contradictions.values()
    )

    for gate in job.gates:
        if not (gate.required and gate.status == "pending"):
            continue
        gate_type = gate.gate_type
        if gate_type == GateType.ASSIGNMENT.value:
            return gate
        if gate_type == GateType.RESEARCH_PLAN.value and has_hypotheses:
            return gate
        if gate_type == GateType.DRAFT.value and has_synthesis and not has_final:
            return gate
        if gate_type == GateType.FINAL.value and has_final:
            return gate
        if gate_type == GateType.CONTRADICTION.value and open_contradictions:
            return gate
        if gate_type in {
            GateType.FACTUAL_ASSUMPTION.value,
            GateType.HIGH_RISK_THEORY.value,
        }:
            return gate
        # Unknown custom gates remain blocking for safety.
        if gate_type not in {item.value for item in GateType}:
            return gate
    return None


def _active_nodes(job: ResearchJob) -> list[TreeNode]:
    return [
        node
        for node in job.nodes.values()
        if node.status in {NodeStatus.OPEN.value, NodeStatus.ACTIVE.value, NodeStatus.CHALLENGED.value}
        and node.branch_id in job.active_branch_ids
    ]


def _depth_of(job: ResearchJob, node: TreeNode) -> int:
    depth = 0
    current = node
    seen: set[str] = set()
    while current.parent_ids:
        parent_id = current.parent_ids[0]
        if parent_id in seen or parent_id not in job.nodes:
            break
        seen.add(parent_id)
        current = job.nodes[parent_id]
        depth += 1
    return depth


def _best_active_node(job: ResearchJob) -> TreeNode | None:
    nodes = _active_nodes(job)
    if not nodes:
        return None
    return sorted(nodes, key=lambda node: (node.evaluation.overall, node.confidence), reverse=True)[0]


def choose_action(job: ResearchJob) -> tuple[AltsAction, str, TreeNode | None]:
    """Deterministic + score-driven action selection for the next ALTS step."""
    pending = _pending_required_gate(job)
    if pending:
        return AltsAction.PAUSE_FOR_ATTORNEY, f"Required gate pending: {pending.gate_type}", None

    exhausted = _budget_exhausted(job)
    if exhausted:
        if any(node.node_type == NodeType.SYNTHESIS.value for node in job.nodes.values()):
            return AltsAction.VERIFY, f"Budget limit reached ({exhausted}); verify current synthesis", _best_active_node(job)
        return AltsAction.SYNTHESIZE, f"Budget limit reached ({exhausted}); synthesize retained branches", _best_active_node(job)

    unresolved_critical = [
        item
        for item in job.contradictions.values()
        if contradiction_is_open(item.resolution_status) and item.severity == "critical"
    ]
    if unresolved_critical and job.status != JobStatus.WAITING_ATTORNEY.value:
        target = job.nodes.get(unresolved_critical[0].responsible_node_id or "")
        return AltsAction.CHALLENGE, "Critical contradiction requires challenge or attorney gate", target or _best_active_node(job)

    active = _active_nodes(job)
    if not active:
        if any(node.node_type == NodeType.FINAL_ARTIFACT.value and node.status == NodeStatus.COMPLETE.value for node in job.nodes.values()):
            return AltsAction.COMPLETE, "Final artifact present", None
        if any(node.node_type == NodeType.SYNTHESIS.value for node in job.nodes.values()):
            return AltsAction.VERIFY, "No active nodes; verify synthesis", _best_active_node(job)
        return AltsAction.EXPAND_WIDER, "No active nodes; expand from root", job.nodes.get(job.root_node_id)

    node = _best_active_node(job)
    assert node is not None
    depth = _depth_of(job, node)
    children = len(node.child_ids)

    # Completion path
    synthesis_nodes = [n for n in job.nodes.values() if n.node_type == NodeType.SYNTHESIS.value]
    verification_nodes = [n for n in job.nodes.values() if n.node_type == NodeType.VERIFICATION.value]
    if verification_nodes and all(n.evaluation.overall >= 0.72 and n.evaluation.unsupported_claim_risk <= 0.35 for n in verification_nodes[-1:]):
        if not unresolved_critical:
            return AltsAction.COMPLETE, "Verification thresholds met", verification_nodes[-1]
    if synthesis_nodes and not verification_nodes and node.evaluation.expected_value_of_further_research < 0.35:
        return AltsAction.VERIFY, "Synthesis ready for verification", synthesis_nodes[-1]

    # Prune weak saturated branches
    if (
        node.evaluation.overall < 0.35
        and node.evaluation.unsupported_claim_risk > 0.6
        and children >= 1
        and len(job.active_branch_ids) > 1
    ):
        return AltsAction.PRUNE, "Low-support branch pruned", node

    # Merge near-duplicate high-scoring branches
    if len(job.active_branch_ids) >= 2:
        ranked = sorted(job.active_branch_ids, key=lambda branch_id: branch_rank(job, branch_id), reverse=True)
        top_a, top_b = ranked[0], ranked[1]
        if abs(branch_rank(job, top_a) - branch_rank(job, top_b)) < 0.05 and branch_rank(job, top_a) >= 0.7:
            return AltsAction.MERGE, "Compatible high-scoring branches selected for merge", node

    # Challenge weak citation support
    if node.authorities_found and node.evaluation.adverse_authority_coverage < 0.35 and job.assignment.require_adverse_authority_review:
        return AltsAction.CHALLENGE, "Adverse-authority coverage insufficient", node

    # Revise draft with missing evidence
    if node.node_type in {NodeType.DRAFT.value, NodeType.RESEARCH.value} and node.missing_evidence and node.metadata.get("revision_count", 0) < job.budgets.max_revisions_per_node:
        return AltsAction.REVISE, "Missing evidence requires revision", node

    # Deepen promising path
    if node.evaluation.overall >= 0.55 and depth < job.budgets.max_tree_depth and children < job.budgets.max_children_per_node:
        if node.evaluation.expected_value_of_further_research >= 0.45:
            return AltsAction.DEEPEN, "Promising branch selected for deepening", node

    # Expand if under branch capacity
    if len(job.active_branch_ids) < job.budgets.max_active_branches and depth < job.budgets.max_tree_depth:
        return AltsAction.EXPAND_WIDER, "Explore additional legal hypothesis branch", node

    if not synthesis_nodes:
        return AltsAction.SYNTHESIZE, "Branch capacity reached; synthesize retained work", node
    return AltsAction.VERIFY, "Default verification step", node


def create_child_node(
    job: ResearchJob,
    parent: TreeNode,
    *,
    node_type: str,
    branch_id: str | None = None,
    hypothesis: str | None = None,
    research_question: str | None = None,
    proposed_legal_theory: str | None = None,
    status: str = NodeStatus.OPEN.value,
) -> TreeNode:
    node = TreeNode(
        node_id=new_id("node"),
        job_id=job.job_id,
        branch_id=branch_id or parent.branch_id,
        parent_ids=[parent.node_id],
        child_ids=[],
        node_type=node_type,
        hypothesis=hypothesis,
        research_question=research_question,
        proposed_legal_theory=proposed_legal_theory,
        factual_dependencies=list(parent.factual_dependencies),
        jurisdiction=parent.jurisdiction or job.assignment.jurisdiction,
        relevant_date=parent.relevant_date or job.assignment.relevant_date,
        assigned_agents=[],
        assigned_models=[],
        tools_used=[],
        search_queries=[],
        matter_documents_used=list(parent.matter_documents_used),
        authorities_found=[],
        supporting_evidence=[],
        contrary_evidence=[],
        missing_evidence=[],
        contradictions=[],
        draft_conclusions=[],
        confidence=0.0,
        evaluation=EvaluationScores(),
        cost_consumed=0.0,
        time_consumed_ms=0,
        token_usage={},
        status=status,
        retention_decision="pending",
        decision_explanation="",
        metadata={"alts_version": ALTS_VERSION},
    )
    node.evaluation = evaluate_node(job, node)
    job.nodes[node.node_id] = node
    parent.child_ids.append(node.node_id)
    parent.updated_at = utc_now().isoformat()
    if node.branch_id not in job.active_branch_ids and node.status != NodeStatus.PRUNED.value:
        job.active_branch_ids.append(node.branch_id)
    return node


def ensure_hypotheses(job: ResearchJob, parent: TreeNode, count: int = 3) -> list[Hypothesis]:
    existing = [hyp for hyp in job.hypotheses.values() if hyp.status == "open"]
    if existing:
        return existing[:count]
    questions = job.assignment.legal_questions or [job.assignment.query]
    seeds = [
        f"Primary claim: {questions[0]} is supported by controlling D.C. authority and the matter record.",
        f"Counterclaim: {questions[0]} is limited by adverse D.C. authority, waiver, or factual gaps.",
        f"Procedural/public-policy alternative: even if the primary claim is weak, a narrower D.C.-grounded theory may still control the outcome.",
    ]
    created: list[Hypothesis] = []
    for index, proposition in enumerate(seeds[:count]):
        hyp = Hypothesis(
            hypothesis_id=new_id("hyp"),
            legal_proposition=proposition,
            supporting_factual_conditions=list(job.assignment.factual_assumptions),
            required_authority=["official D.C. sources preferred"],
            possible_defenses=["waiver", "factual insufficiency", "contrary authority"],
            counterarguments=["adverse authority", "jurisdictional mismatch", "missing record support"],
            contrary_authority=[],
            procedural_implications=["attorney review required before reliance"],
            confidence=0.35 - (0.05 * index),
            status="open",
        )
        job.hypotheses[hyp.hypothesis_id] = hyp
        created.append(hyp)
    append_event(job, "hypotheses_seeded", {"count": len(created), "parent_node_id": parent.node_id})
    return created


def apply_prune(job: ResearchJob, node: TreeNode, reason: str) -> None:
    node.status = NodeStatus.PRUNED.value
    node.retention_decision = "pruned"
    node.decision_explanation = reason
    node.updated_at = utc_now().isoformat()
    if node.branch_id in job.active_branch_ids:
        job.active_branch_ids = [branch_id for branch_id in job.active_branch_ids if branch_id != node.branch_id]
    if node.branch_id not in job.pruned_branch_ids:
        job.pruned_branch_ids.append(node.branch_id)
    append_event(job, "branch_pruned", {"node_id": node.node_id, "branch_id": node.branch_id, "reason": reason})


def apply_merge(job: ResearchJob, node: TreeNode, reason: str) -> TreeNode:
    ranked = sorted(job.active_branch_ids, key=lambda branch_id: branch_rank(job, branch_id), reverse=True)
    left = ranked[0]
    right = ranked[1] if len(ranked) > 1 else ranked[0]
    merged = create_child_node(
        job,
        node,
        node_type=NodeType.SYNTHESIS.value,
        branch_id=new_id("branch"),
        research_question="Merged synthesis of retained legal branches",
        proposed_legal_theory=f"Merged analysis of branches {left} and {right}",
        status=NodeStatus.ACTIVE.value,
    )
    left_nodes = [item for item in job.nodes.values() if item.branch_id == left]
    right_nodes = [item for item in job.nodes.values() if item.branch_id == right]
    for source in left_nodes + right_nodes:
        merged.authorities_found.extend(source.authorities_found)
        merged.supporting_evidence.extend(source.supporting_evidence)
        merged.contrary_evidence.extend(source.contrary_evidence)
        merged.draft_conclusions.extend(source.draft_conclusions)
        if source.branch_id == right and source.branch_id in job.active_branch_ids:
            source.retention_decision = "merged"
            source.status = NodeStatus.MERGED.value
    job.active_branch_ids = [branch_id for branch_id in job.active_branch_ids if branch_id != right]
    if merged.branch_id not in job.retained_branch_ids:
        job.retained_branch_ids.append(merged.branch_id)
    merged.decision_explanation = reason
    merged.evaluation = evaluate_node(job, merged)
    append_event(job, "branches_merged", {"from": [left, right], "into": merged.branch_id, "reason": reason})
    return merged


def controller_snapshot(job: ResearchJob) -> dict[str, Any]:
    action, reason, node = choose_action(job)
    return {
        "alts_version": ALTS_VERSION,
        "recommended_action": action.value,
        "reason": reason,
        "focus_node_id": node.node_id if node else None,
        "active_branches": list(job.active_branch_ids),
        "retained_branches": list(job.retained_branch_ids),
        "pruned_branches": list(job.pruned_branch_ids),
        "budget": job.budgets.to_dict(),
        "pending_gates": [gate.to_dict() for gate in job.gates if gate.status == "pending"],
    }
