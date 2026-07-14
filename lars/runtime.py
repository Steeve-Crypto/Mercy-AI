"""Mercy LARS runtime — durable job lifecycle and MoE-backed ALTS steps."""

from __future__ import annotations

import time
from typing import Any

from agent_network import execute_agent_task
from dc_knowledge_rag import retrieve_dc_knowledge
from lars.alts import (
    apply_merge,
    apply_prune,
    choose_action,
    controller_snapshot,
    create_child_node,
    ensure_hypotheses,
)
from lars.assignment import compile_legal_assignment, validate_assignment
from lars.evaluator import evaluate_node
from lars.models import (
    ALTS_MOE_VERSION,
    ALTS_VERSION,
    LARS_VERSION,
    AltsAction,
    ApprovalGate,
    AuthorityRecord,
    ContradictionRecord,
    ContradictionType,
    EvaluationScores,
    GateType,
    JobStatus,
    MatterEvidenceRecord,
    NodeStatus,
    NodeType,
    ResearchJob,
    TreeNode,
    append_event,
    new_id,
    utc_now,
)
from lars.store import get_job as store_get_job
from lars.store import list_jobs as store_list_jobs
from lars.store import lars_store_status
from lars.store import save_job
from legal_task_router import moe_route
from observability import trace_event, trace_span
from response_envelope import build_response_envelope


def _now() -> str:
    return utc_now().isoformat()


def _auth_context(tenant_id: str, user_id: str, firm_id: str | None, roles: list[str] | None = None) -> dict[str, Any]:
    context = {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "roles": roles or ["attorney"],
        "account_id": firm_id or tenant_id,
    }
    if firm_id:
        context["firm_id"] = firm_id
    return context


def _matter_context_for_job(job: ResearchJob) -> dict[str, Any]:
    return {
        "matter_id": job.assignment.matter_id,
        "jurisdiction": job.assignment.jurisdiction,
        "facts": {"summary": " ".join(job.assignment.factual_assumptions)},
        "key_facts": list(job.assignment.factual_assumptions),
        "disputed_facts": list(job.assignment.disputed_facts),
        "documents": [{"document_id": doc_id} for doc_id in job.assignment.selected_document_ids],
        "auth_context": _auth_context(job.tenant_id, job.user_id, job.firm_id),
        "surface_context": "lars",
        "source_policy": "official_dc_sources_first" if job.assignment.official_source_preference else "general",
        "lars_job_id": job.job_id,
    }


def _gate_prompt(gate_type: str, assignment_query: str) -> str:
    prompts = {
        GateType.ASSIGNMENT.value: f"Approve LARS assignment scope for: {assignment_query}",
        GateType.RESEARCH_PLAN.value: "Approve the initial ALTS research plan and hypothesis set.",
        GateType.FACTUAL_ASSUMPTION.value: "Approve constrained factual assumptions before further research.",
        GateType.HIGH_RISK_THEORY.value: "Approve pursuit of a high-risk legal theory branch.",
        GateType.CONTRADICTION.value: "Resolve or accept handling of a critical contradiction.",
        GateType.DRAFT.value: "Approve draft legal analysis before final packaging.",
        GateType.FINAL.value: "Approve final LARS deliverable for attorney use.",
    }
    return prompts.get(gate_type, f"Attorney approval required: {gate_type}")


def _build_gates(assignment_checkpoints: list[str], query: str) -> list[ApprovalGate]:
    gates: list[ApprovalGate] = []
    for gate_type in assignment_checkpoints:
        gates.append(
            ApprovalGate(
                gate_id=new_id("gate"),
                gate_type=gate_type,
                status="pending",
                required=True,
                prompt=_gate_prompt(gate_type, query),
            )
        )
    return gates


def create_and_start_job(
    payload: dict[str, Any],
    *,
    tenant_id: str,
    user_id: str,
    firm_id: str | None = None,
    roles: list[str] | None = None,
    auto_approve_assignment: bool = False,
) -> dict[str, Any]:
    assignment = compile_legal_assignment(payload, tenant_id=tenant_id, user_id=user_id, firm_id=firm_id)
    validation = validate_assignment(assignment)
    if not validation["valid"] and assignment.clarification_required:
        return {
            "mode": "clarification_required",
            "validation": validation,
            "assignment": assignment.to_dict(),
            "lars_version": LARS_VERSION,
        }

    job_id = new_id("lars")
    root_branch = new_id("branch")
    root = TreeNode(
        node_id=new_id("node"),
        job_id=job_id,
        branch_id=root_branch,
        parent_ids=[],
        child_ids=[],
        node_type=NodeType.ROOT.value,
        hypothesis=None,
        research_question=assignment.query,
        proposed_legal_theory=None,
        factual_dependencies=list(assignment.factual_assumptions),
        jurisdiction=assignment.jurisdiction,
        relevant_date=assignment.relevant_date,
        assigned_agents=[],
        assigned_models=[],
        tools_used=[],
        search_queries=[],
        matter_documents_used=list(assignment.selected_document_ids),
        authorities_found=[],
        supporting_evidence=[],
        contrary_evidence=[],
        missing_evidence=list(assignment.missing_critical_inputs),
        contradictions=[],
        draft_conclusions=[],
        confidence=0.0,
        evaluation=EvaluationScores(),
        cost_consumed=0.0,
        time_consumed_ms=0,
        token_usage={},
        status=NodeStatus.ACTIVE.value,
        retention_decision="retained",
        decision_explanation="Root assignment node",
        metadata={"roles": roles or ["attorney"]},
    )
    budgets = assignment.budgets
    budgets.started_at = _now()
    gates = _build_gates(assignment.approval_checkpoints, assignment.query)
    if auto_approve_assignment:
        for gate in gates:
            if gate.gate_type == GateType.ASSIGNMENT.value:
                gate.status = "approved"
                gate.decision = "approved"
                gate.decided_by = user_id
                gate.decided_at = _now()
                gate.notes = "Auto-approved for local/dev or explicit request"

    job = ResearchJob(
        job_id=job_id,
        tenant_id=tenant_id,
        user_id=user_id,
        firm_id=firm_id,
        assignment=assignment,
        status=JobStatus.WAITING_ATTORNEY.value
        if any(gate.gate_type == GateType.ASSIGNMENT.value and gate.status == "pending" for gate in gates)
        else JobStatus.QUEUED.value,
        root_node_id=root.node_id,
        active_branch_ids=[root_branch],
        retained_branch_ids=[root_branch],
        pruned_branch_ids=[],
        nodes={root.node_id: root},
        hypotheses={},
        authorities={},
        evidence={},
        contradictions={},
        gates=gates,
        events=[],
        artifacts=[],
        budgets=budgets,
        metadata={
            "lars_version": LARS_VERSION,
            "alts_version": ALTS_VERSION,
            "alts_moe_version": ALTS_MOE_VERSION,
            "store": lars_store_status(),
        },
    )
    root.evaluation = evaluate_node(job, root)
    append_event(job, "job_created", {"assignment_id": assignment.assignment_id, "status": job.status})
    save_job(job)

    if job.status == JobStatus.QUEUED.value:
        job.status = JobStatus.RUNNING.value
        append_event(job, "job_started", {})
        save_job(job)
        run_job_steps(job.job_id, tenant_id=tenant_id, max_steps=job.budgets.max_steps_per_tick)
        job = store_get_job(job.job_id, tenant_id=tenant_id) or job

    return status_payload(job)


def get_job(job_id: str, *, tenant_id: str) -> ResearchJob | None:
    return store_get_job(job_id, tenant_id=tenant_id)


def list_jobs(*, tenant_id: str, limit: int = 50) -> list[ResearchJob]:
    return store_list_jobs(tenant_id=tenant_id, limit=limit)


def status_payload(job: ResearchJob) -> dict[str, Any]:
    snapshot = controller_snapshot(job)
    pending_gates = [gate.to_dict() for gate in job.gates if gate.status == "pending"]
    unresolved = [
        item.to_dict()
        for item in job.contradictions.values()
        if item.resolution_status != "resolved"
    ]
    return {
        "mode": "lars_job",
        "lars_version": LARS_VERSION,
        "alts_version": ALTS_VERSION,
        "alts_moe_version": ALTS_MOE_VERSION,
        "job": job.to_dict(),
        "controller": snapshot,
        "pending_gates": pending_gates,
        "unresolved_contradictions": unresolved,
        "attorney_review_required": True,
        "human_review_required": True,
        "store": lars_store_status(),
    }


def pause_job(job_id: str, *, tenant_id: str, reason: str = "attorney_pause") -> dict[str, Any]:
    job = store_get_job(job_id, tenant_id=tenant_id)
    if not job:
        raise KeyError("job_not_found")
    if job.status in {JobStatus.COMPLETED.value, JobStatus.CANCELED.value}:
        raise RuntimeError("terminal_job")
    job.status = JobStatus.PAUSED.value
    append_event(job, "job_paused", {"reason": reason})
    save_job(job)
    return status_payload(job)


def resume_job(job_id: str, *, tenant_id: str, steps: int | None = None) -> dict[str, Any]:
    job = store_get_job(job_id, tenant_id=tenant_id)
    if not job:
        raise KeyError("job_not_found")
    if job.status == JobStatus.CANCELED.value:
        raise RuntimeError("canceled_job")
    if any(gate.required and gate.status == "pending" for gate in job.gates):
        job.status = JobStatus.WAITING_ATTORNEY.value
        append_event(job, "resume_blocked_pending_gate", {})
        save_job(job)
        return status_payload(job)
    job.status = JobStatus.RUNNING.value
    append_event(job, "job_resumed", {})
    save_job(job)
    return run_job_steps(job_id, tenant_id=tenant_id, max_steps=steps or job.budgets.max_steps_per_tick)


def cancel_job(job_id: str, *, tenant_id: str, reason: str = "attorney_cancel") -> dict[str, Any]:
    job = store_get_job(job_id, tenant_id=tenant_id)
    if not job:
        raise KeyError("job_not_found")
    job.status = JobStatus.CANCELED.value
    job.completed_at = _now()
    append_event(job, "job_canceled", {"reason": reason})
    save_job(job)
    return status_payload(job)


def approve_gate(
    job_id: str,
    *,
    tenant_id: str,
    gate_id: str,
    decision: str,
    user_id: str,
    notes: str | None = None,
    continue_steps: int | None = None,
) -> dict[str, Any]:
    job = store_get_job(job_id, tenant_id=tenant_id)
    if not job:
        raise KeyError("job_not_found")
    gate = next((item for item in job.gates if item.gate_id == gate_id), None)
    if not gate:
        raise KeyError("gate_not_found")
    normalized = decision.strip().lower()
    if normalized not in {"approved", "rejected"}:
        raise ValueError("decision must be approved or rejected")
    gate.status = normalized
    gate.decision = normalized
    gate.decided_by = user_id
    gate.decided_at = _now()
    gate.notes = notes
    append_event(job, "gate_decision", {"gate_id": gate_id, "decision": normalized})
    if normalized == "rejected":
        job.status = JobStatus.BLOCKED.value
        job.last_error = f"Gate rejected: {gate.gate_type}"
        save_job(job)
        return status_payload(job)
    if not any(item.required and item.status == "pending" for item in job.gates):
        job.status = JobStatus.RUNNING.value
    else:
        job.status = JobStatus.WAITING_ATTORNEY.value
    save_job(job)
    if job.status == JobStatus.RUNNING.value:
        return run_job_steps(job_id, tenant_id=tenant_id, max_steps=continue_steps or job.budgets.max_steps_per_tick)
    return status_payload(job)


def _invoke_moe(job: ResearchJob, task: str, preferred_expert: str | None = None) -> dict[str, Any]:
    context = _matter_context_for_job(job)
    user_type = "firm" if job.firm_id else "solo"
    decision = moe_route(task, context, user_type=user_type)
    route = decision.to_dict()
    expert = preferred_expert or str(route.get("expert") or "research")
    if preferred_expert:
        route = {**route, "expert": preferred_expert}
    agent_name = {
        "research": "ResearchAgent",
        "drafting": "DraftingAgent",
        "compliance_guardrails": "ComplianceAgent",
        "intake": "IntakeAgent",
        "citation_verifier": "CitationVerifierAgent",
    }.get(expert, "ResearchAgent")
    result = execute_agent_task(
        task=task,
        params={
            "auth_context": context["auth_context"],
            "mode": route.get("route_mode") or "dc_research",
            "surface_context": "lars",
            "matter_id": job.assignment.matter_id,
        },
        matter_context=context,
        route=route,
        user_type=user_type,
    )
    job.budgets.model_calls_used += 1
    job.budgets.tool_calls_used += 1
    llm_meta = result.get("llm") if isinstance(result.get("llm"), dict) else {}
    job.budgets.cost_usd_used += float(llm_meta.get("estimated_cost_usd") or 0.02)
    return {
        "route": route,
        "agent": result,
        "expert": expert,
        "agent_name": str(result.get("selected_agent") or agent_name),
    }


def _agent_text(agent_payload: dict[str, Any]) -> str:
    nested = agent_payload.get("agent_result") if isinstance(agent_payload.get("agent_result"), dict) else {}
    for key in ("content", "summary", "draft", "analysis", "output"):
        value = nested.get(key) or agent_payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _authorities_from_retrieval(job: ResearchJob, node: TreeNode, retrieval: dict[str, Any]) -> list[AuthorityRecord]:
    records: list[AuthorityRecord] = []
    raw_items = list(retrieval.get("citations") or [])
    for result in retrieval.get("results") or []:
        if isinstance(result, dict):
            citation = result.get("citation") if isinstance(result.get("citation"), dict) else {}
            raw_items.append(
                {
                    **result,
                    "label": citation.get("label") or result.get("label"),
                    "title": result.get("title") or citation.get("label"),
                    "snippet": result.get("summary") or result.get("snippet") or result.get("text"),
                    "verification_status": citation.get("verification_status") or result.get("verification_status"),
                    "authority_type": result.get("authority_type") or citation.get("source_type"),
                    "jurisdiction": result.get("jurisdiction") or citation.get("jurisdiction"),
                    "url": result.get("url") or citation.get("url"),
                }
            )
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or item.get("citation") or item.get("title") or "Authority")
        if isinstance(item.get("citation"), dict):
            label = str(item["citation"].get("label") or label)
        authority = AuthorityRecord(
            authority_id=new_id("auth"),
            citation=label,
            title=str(item.get("title") or label),
            court_or_body=str(item.get("court") or item.get("authority_type") or "D.C. source"),
            jurisdiction=str(item.get("jurisdiction") or job.assignment.jurisdiction),
            date=str(item.get("date") or item.get("last_checked") or "") or None,
            authority_type=str(item.get("authority_type") or item.get("source_type") or "statute"),
            precedential_weight=str(item.get("precedential_weight") or "persuasive"),
            classification=str(item.get("classification") or "candidate"),
            official_source_url=str(item.get("url") or item.get("official_locator") or "") or None,
            retrieved_text=str(item.get("snippet") or item.get("text") or item.get("summary") or "")[:2000],
            relevant_passages=[str(item.get("snippet") or item.get("text") or item.get("summary") or "")[:500]],
            proposition_supported=node.hypothesis or node.research_question,
            proposition_contradicted=None,
            treatment_status=str(item.get("treatment_status") or "unchecked"),
            validation_status=str(item.get("verification_status") or item.get("validation_status") or "candidate"),
            retrieval_timestamp=_now(),
            source_authenticity_result=str(item.get("source_authenticity") or "candidate_official"),
            node_id=node.node_id,
            branch_id=node.branch_id,
        )
        job.authorities[authority.authority_id] = authority
        records.append(authority)
        node.authorities_found.append(authority.to_dict())
    return records


def _record_missing_and_contradictions(job: ResearchJob, node: TreeNode) -> None:
    if not node.authorities_found:
        node.missing_evidence.append("No retrieved legal authorities for this node")
    if job.assignment.require_adverse_authority_review and not node.contrary_evidence:
        node.missing_evidence.append("Adverse/contrary authority not yet developed")
    if node.authorities_found and node.draft_conclusions and node.evaluation.unsupported_claim_risk > 0.7:
        contradiction = ContradictionRecord(
            contradiction_id=new_id("ctr"),
            contradiction_type=ContradictionType.AUTHORITY_VS_DRAFT.value,
            conflicting_items=[
                {"type": "draft", "text": node.draft_conclusions[0]},
                {"type": "authority_gap", "text": "Draft confidence exceeds citation support"},
            ],
            severity="high",
            impacted_branch_ids=[node.branch_id],
            proposed_resolution="Revise draft to only state supported propositions or label uncertainty",
            resolution_evidence=[],
            resolution_status="open",
            responsible_node_id=node.node_id,
        )
        job.contradictions[contradiction.contradiction_id] = contradiction
        node.contradictions.append(contradiction.contradiction_id)


def _execute_research_node(job: ResearchJob, node: TreeNode) -> None:
    started = time.perf_counter()
    task = node.research_question or node.hypothesis or job.assignment.query
    moe = _invoke_moe(job, task, preferred_expert="research")
    node.moe_route = moe["route"]
    node.agent_result = moe["agent"]
    node.assigned_agents = [moe["agent_name"]]
    node.assigned_models = [str((moe["route"].get("llm_router") or {}).get("model") or "router_default")]
    node.tools_used = list({*node.tools_used, "moe_route", "agent_execute", "dc_rag_retrieve"})
    node.search_queries.append(task)

    context = _matter_context_for_job(job)
    retrieval = retrieve_dc_knowledge(task, matter_context=context, top_k=5)
    _authorities_from_retrieval(job, node, retrieval if isinstance(retrieval, dict) else {})

    content = _agent_text(moe["agent"])
    if content:
        node.draft_conclusions.append(content[:4000])
    for assumption in job.assignment.factual_assumptions:
        evidence = MatterEvidenceRecord(
            evidence_id=new_id("evd"),
            document_id=None,
            page_or_paragraph=None,
            text_span=assumption,
            metadata={"source": "attorney_assumption"},
            relevant_fact=assumption,
            fact_status="assumed",
            disputed=assumption in job.assignment.disputed_facts,
            hypothesis_id=None,
            confidence=0.4,
            attorney_validation_status="pending",
            node_id=node.node_id,
        )
        job.evidence[evidence.evidence_id] = evidence
        node.supporting_evidence.append(evidence.to_dict())

    # Challenge path seeds contrary evidence from low-support citations
    if node.node_type in {NodeType.CRITIQUE.value, NodeType.CONTRARY_AUTHORITY.value} or "counter" in (node.hypothesis or "").lower():
        for auth in node.authorities_found[:2]:
            node.contrary_evidence.append(auth)

    node.confidence = float(moe["route"].get("confidence") or 0.0)
    node.evaluation = evaluate_node(job, node)
    _record_missing_and_contradictions(job, node)
    node.time_consumed_ms += int((time.perf_counter() - started) * 1000)
    node.status = NodeStatus.RETAINED.value if node.evaluation.overall >= 0.45 else NodeStatus.ACTIVE.value
    node.retention_decision = "retained" if node.evaluation.overall >= 0.45 else "pending"
    node.decision_explanation = node.evaluation.explanation
    node.updated_at = _now()


def _execute_draft_or_synthesis(job: ResearchJob, node: TreeNode) -> None:
    started = time.perf_counter()
    retained = [
        item
        for item in job.nodes.values()
        if item.branch_id in job.retained_branch_ids or item.retention_decision == "retained"
    ]
    corpus = []
    for item in retained:
        corpus.extend(item.draft_conclusions)
        corpus.extend(auth.get("citation", "") for auth in item.authorities_found)
    task = (
        f"Synthesize attorney-review legal analysis for deliverable={job.assignment.deliverable_type}. "
        f"Questions: {'; '.join(job.assignment.legal_questions)}. "
        f"Use only supported authorities and label missing evidence. Notes: {' | '.join(corpus)[:3000]}"
    )
    moe = _invoke_moe(job, task, preferred_expert="drafting")
    node.moe_route = moe["route"]
    node.agent_result = moe["agent"]
    node.assigned_agents = [moe["agent_name"]]
    content = _agent_text(moe["agent"])
    if content:
        node.draft_conclusions.append(content[:6000])
    # carry authorities forward
    for item in retained:
        node.authorities_found.extend(item.authorities_found[:3])
        node.supporting_evidence.extend(item.supporting_evidence[:3])
        node.contrary_evidence.extend(item.contrary_evidence[:2])
        node.missing_evidence.extend(item.missing_evidence[:3])
    node.evaluation = evaluate_node(job, node)
    node.confidence = node.evaluation.overall
    node.time_consumed_ms += int((time.perf_counter() - started) * 1000)
    node.status = NodeStatus.RETAINED.value
    node.retention_decision = "retained"
    node.decision_explanation = node.evaluation.explanation
    node.updated_at = _now()


def _execute_verification(job: ResearchJob, node: TreeNode) -> None:
    started = time.perf_counter()
    task = f"Verify citations, adverse authority, and unsupported claims for: {job.assignment.query}"
    moe = _invoke_moe(job, task, preferred_expert="citation_verifier")
    node.moe_route = moe["route"]
    node.agent_result = moe["agent"]
    node.assigned_agents = [moe["agent_name"], "ComplianceAgent"]
    compliance = execute_agent_task(
        task=task,
        params={"auth_context": _matter_context_for_job(job)["auth_context"], "surface_context": "lars"},
        matter_context=_matter_context_for_job(job),
        route={**(moe["route"] or {}), "expert": "compliance_guardrails"},
        user_type="firm" if job.firm_id else "solo",
    )
    job.budgets.model_calls_used += 1
    node.tools_used = ["citation_verifier", "compliance_check"]
    parents = [job.nodes[pid] for pid in node.parent_ids if pid in job.nodes]
    for parent in parents:
        node.authorities_found.extend(parent.authorities_found)
        node.draft_conclusions.extend(parent.draft_conclusions)
        node.missing_evidence.extend(parent.missing_evidence)
        node.contrary_evidence.extend(parent.contrary_evidence)
    node.evaluation = evaluate_node(job, node)
    node.confidence = node.evaluation.overall
    node.time_consumed_ms += int((time.perf_counter() - started) * 1000)
    node.metadata["compliance"] = {
        "guardrail_status": compliance.get("guardrail_status") or (compliance.get("result") or {}).get("guardrail_status"),
        "human_review_required": True,
    }
    critical_open = [
        item
        for item in job.contradictions.values()
        if item.resolution_status != "resolved" and item.severity == "critical"
    ]
    if node.evaluation.unsupported_claim_risk > 0.55 or not node.authorities_found or critical_open:
        node.status = NodeStatus.BLOCKED.value
        node.retention_decision = "blocked"
        node.decision_explanation = "Verification blocked: unsupported claims, missing authorities, or critical contradictions"
        # require contradiction or draft gate
        if not any(gate.gate_type == GateType.CONTRADICTION.value for gate in job.gates):
            job.gates.append(
                ApprovalGate(
                    gate_id=new_id("gate"),
                    gate_type=GateType.CONTRADICTION.value,
                    status="pending",
                    required=True,
                    prompt=_gate_prompt(GateType.CONTRADICTION.value, job.assignment.query),
                )
            )
        job.status = JobStatus.WAITING_ATTORNEY.value
    else:
        node.status = NodeStatus.VERIFIED.value
        node.retention_decision = "verified"
        node.decision_explanation = node.evaluation.explanation
    node.updated_at = _now()


def _build_final_artifact(job: ResearchJob, node: TreeNode) -> None:
    synthesis = next((item for item in job.nodes.values() if item.node_type == NodeType.SYNTHESIS.value), None)
    verification = next((item for item in job.nodes.values() if item.node_type == NodeType.VERIFICATION.value), None)
    content_parts = []
    if synthesis and synthesis.draft_conclusions:
        content_parts.append(synthesis.draft_conclusions[-1])
    if verification and verification.draft_conclusions:
        content_parts.append(verification.draft_conclusions[-1])
    if not content_parts:
        content_parts.append(
            "No fully verified legal deliverable is available. Attorney review of open issues is required."
        )
    authorities = []
    for item in job.nodes.values():
        authorities.extend(item.authorities_found)
    artifact = {
        "artifact_id": new_id("art"),
        "deliverable_type": job.assignment.deliverable_type,
        "title": f"LARS {job.assignment.deliverable_type.replace('_', ' ').title()}",
        "content_markdown": "\n\n".join(content_parts)[:12000],
        "authorities": authorities[:20],
        "missing_evidence": sorted({item for node_item in job.nodes.values() for item in node_item.missing_evidence})[:20],
        "unresolved_contradictions": [
            item.to_dict() for item in job.contradictions.values() if item.resolution_status != "resolved"
        ],
        "attorney_review_required": True,
        "citation_policy": job.assignment.citation_requirements,
        "jurisdiction": job.assignment.jurisdiction,
        "created_at": _now(),
    }
    # envelope-style reliability metadata
    route = (verification.moe_route if verification else {}) or (synthesis.moe_route if synthesis else {})
    envelope = build_response_envelope(
        route or {"expert": "research", "confidence": node.confidence, "guardrails": {"status": "warn"}},
        _matter_context_for_job(job),
        source="lars",
    )
    artifact["response_envelope"] = envelope
    job.artifacts.append(artifact)
    node.draft_conclusions.append(artifact["content_markdown"][:4000])
    node.status = NodeStatus.COMPLETE.value
    node.retention_decision = "final"
    node.decision_explanation = "Final artifact packaged for attorney review"
    node.evaluation = evaluate_node(job, node)
    node.updated_at = _now()


def _step_once(job: ResearchJob) -> None:
    action, reason, focus = choose_action(job)
    job.last_action = action.value
    append_event(job, "alts_action_selected", {"action": action.value, "reason": reason, "focus_node_id": focus.node_id if focus else None})

    if action == AltsAction.PAUSE_FOR_ATTORNEY:
        job.status = JobStatus.WAITING_ATTORNEY.value
        return

    if action == AltsAction.COMPLETE:
        parent = focus or job.nodes[job.root_node_id]
        # final gate
        final_gate = next((gate for gate in job.gates if gate.gate_type == GateType.FINAL.value), None)
        if final_gate and final_gate.status == "pending":
            final_node = create_child_node(
                job,
                parent,
                node_type=NodeType.FINAL_ARTIFACT.value,
                research_question="Final deliverable pending attorney approval",
                status=NodeStatus.ACTIVE.value,
            )
            _build_final_artifact(job, final_node)
            job.status = JobStatus.WAITING_ATTORNEY.value
            return
        final_node = create_child_node(
            job,
            parent,
            node_type=NodeType.FINAL_ARTIFACT.value,
            research_question="Final deliverable",
            status=NodeStatus.COMPLETE.value,
        )
        _build_final_artifact(job, final_node)
        job.status = JobStatus.COMPLETED.value
        job.completed_at = _now()
        append_event(job, "job_completed", {"artifact_count": len(job.artifacts)})
        return

    parent = focus or job.nodes[job.root_node_id]

    if action == AltsAction.EXPAND_WIDER:
        hyps = ensure_hypotheses(job, parent)
        for hyp in hyps:
            if len(job.active_branch_ids) >= job.budgets.max_active_branches:
                break
            child = create_child_node(
                job,
                parent,
                node_type=NodeType.HYPOTHESIS.value,
                branch_id=new_id("branch"),
                hypothesis=hyp.legal_proposition,
                research_question=hyp.legal_proposition,
                proposed_legal_theory=hyp.legal_proposition,
                status=NodeStatus.ACTIVE.value,
            )
            research = create_child_node(
                job,
                child,
                node_type=NodeType.RESEARCH.value,
                hypothesis=hyp.legal_proposition,
                research_question=hyp.legal_proposition,
                proposed_legal_theory=hyp.legal_proposition,
                status=NodeStatus.ACTIVE.value,
            )
            _execute_research_node(job, research)
        return

    if action == AltsAction.DEEPEN:
        child = create_child_node(
            job,
            parent,
            node_type=NodeType.RESEARCH.value,
            hypothesis=parent.hypothesis,
            research_question=f"Deepen: {parent.research_question or parent.hypothesis or job.assignment.query}",
            proposed_legal_theory=parent.proposed_legal_theory,
            status=NodeStatus.ACTIVE.value,
        )
        _execute_research_node(job, child)
        return

    if action == AltsAction.CHALLENGE:
        child = create_child_node(
            job,
            parent,
            node_type=NodeType.CRITIQUE.value,
            hypothesis=f"Challenge: {parent.hypothesis or parent.research_question or job.assignment.query}",
            research_question=f"Identify contrary authority and weaknesses for: {parent.research_question or job.assignment.query}",
            status=NodeStatus.ACTIVE.value,
        )
        _execute_research_node(job, child)
        if child.evaluation.overall < 0.4 and parent.evaluation.overall < 0.45:
            apply_prune(job, parent, "Failed challenge and weak support")
        return

    if action == AltsAction.REVISE:
        child = create_child_node(
            job,
            parent,
            node_type=NodeType.REVISION.value,
            hypothesis=parent.hypothesis,
            research_question=f"Revise with missing evidence addressed: {parent.research_question or job.assignment.query}",
            status=NodeStatus.ACTIVE.value,
        )
        child.metadata["revision_count"] = int(parent.metadata.get("revision_count") or 0) + 1
        parent.metadata["revision_count"] = child.metadata["revision_count"]
        _execute_research_node(job, child)
        return

    if action == AltsAction.MERGE:
        apply_merge(job, parent, reason)
        return

    if action == AltsAction.PRUNE:
        apply_prune(job, parent, reason)
        return

    if action == AltsAction.SYNTHESIZE:
        child = create_child_node(
            job,
            parent,
            node_type=NodeType.SYNTHESIS.value,
            research_question="Synthesize retained branches into attorney-review draft",
            status=NodeStatus.ACTIVE.value,
        )
        _execute_draft_or_synthesis(job, child)
        # draft gate pending if configured
        draft_gate = next((gate for gate in job.gates if gate.gate_type == GateType.DRAFT.value), None)
        if draft_gate and draft_gate.status == "pending":
            job.status = JobStatus.WAITING_ATTORNEY.value
        return

    if action == AltsAction.VERIFY:
        child = create_child_node(
            job,
            parent,
            node_type=NodeType.VERIFICATION.value,
            research_question="Verify authorities, contradictions, and unsupported claims",
            status=NodeStatus.ACTIVE.value,
        )
        job.status = JobStatus.VERIFYING.value
        _execute_verification(job, child)
        return


def run_job_steps(job_id: str, *, tenant_id: str, max_steps: int = 4) -> dict[str, Any]:
    job = store_get_job(job_id, tenant_id=tenant_id)
    if not job:
        raise KeyError("job_not_found")
    if job.status in {JobStatus.COMPLETED.value, JobStatus.CANCELED.value, JobStatus.BLOCKED.value}:
        return status_payload(job)
    if job.status == JobStatus.PAUSED.value:
        return status_payload(job)
    if any(gate.required and gate.status == "pending" for gate in job.gates) and job.status == JobStatus.WAITING_ATTORNEY.value:
        return status_payload(job)

    with trace_span("lars_run_steps", "lars", "runtime", matter_reference=job.assignment.matter_id, metadata={"job_id": job.job_id}) as span:
        job.status = JobStatus.RUNNING.value
        steps = max(1, min(int(max_steps), job.budgets.max_steps_per_tick))
        for index in range(steps):
            if job.status in {
                JobStatus.WAITING_ATTORNEY.value,
                JobStatus.COMPLETED.value,
                JobStatus.CANCELED.value,
                JobStatus.BLOCKED.value,
                JobStatus.PAUSED.value,
            }:
                break
            try:
                _step_once(job)
            except Exception as exc:  # noqa: BLE001 - durable job failure path
                job.retry_count += 1
                job.last_error = str(exc)
                append_event(job, "step_failed", {"error": str(exc), "retry_count": job.retry_count})
                if job.retry_count >= job.budgets.max_retry_count:
                    job.status = JobStatus.FAILED.value
                    break
            save_job(job)
            span["metadata"] = {"steps_completed": index + 1, "status": job.status, "last_action": job.last_action}
        save_job(job)
        trace_event(
            name="lars_steps_completed",
            surface_context="lars",
            category="workflow",
            metadata={"job_id": job.job_id, "status": job.status, "last_action": job.last_action},
        )
    return status_payload(job)
