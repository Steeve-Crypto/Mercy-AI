"""Attorney-facing workspace projections for Mercy LARS.

Transforms durable job state into editorial UI payloads without replacing
MoE routing, ALTS control, or response envelopes.
"""

from __future__ import annotations

from typing import Any

from lars.models import JobStatus, NodeStatus, NodeType, ResearchJob, contradiction_is_open


PHASES = (
    "assignment",
    "plan",
    "research",
    "synthesis",
    "verification",
    "attorney_review",
    "complete",
)


def derive_phase(job: ResearchJob) -> str:
    if job.status == JobStatus.COMPLETED.value:
        return "complete"
    if job.status in {JobStatus.CANCELED.value, JobStatus.FAILED.value, JobStatus.BLOCKED.value}:
        pending = [g for g in job.gates if g.status == "pending" and g.required]
        if pending:
            return "attorney_review"
        if any(n.node_type == NodeType.FINAL_ARTIFACT.value for n in job.nodes.values()):
            return "complete"
        return "attorney_review"
    if job.status == JobStatus.WAITING_ATTORNEY.value:
        assignment_pending = any(
            g.gate_type == "assignment_approval" and g.status == "pending" for g in job.gates
        )
        if assignment_pending and len(job.nodes) <= 1:
            return "assignment"
        return "attorney_review"
    if job.status == JobStatus.VERIFYING.value or any(
        n.node_type == NodeType.VERIFICATION.value and n.status not in {NodeStatus.PRUNED.value}
        for n in job.nodes.values()
    ):
        return "verification"
    if any(n.node_type in {NodeType.SYNTHESIS.value, NodeType.DRAFT.value, NodeType.FINAL_ARTIFACT.value} for n in job.nodes.values()):
        if job.status == JobStatus.RUNNING.value and any(
            n.node_type in {NodeType.RESEARCH.value, NodeType.HYPOTHESIS.value}
            and n.status in {NodeStatus.OPEN.value, NodeStatus.ACTIVE.value}
            for n in job.nodes.values()
        ):
            return "research"
        return "synthesis"
    if any(n.node_type == NodeType.HYPOTHESIS.value for n in job.nodes.values()) or job.hypotheses:
        if any(n.node_type == NodeType.RESEARCH.value for n in job.nodes.values()):
            return "research"
        return "plan"
    if len(job.nodes) <= 1:
        return "assignment"
    return "research"


def tree_snapshot(job: ResearchJob) -> dict[str, Any]:
    nodes = []
    for node in job.nodes.values():
        nodes.append(
            {
                "node_id": node.node_id,
                "branch_id": node.branch_id,
                "parent_ids": list(node.parent_ids),
                "child_ids": list(node.child_ids),
                "node_type": node.node_type,
                "status": node.status,
                "label": _node_label(node),
                "purpose": node.research_question or node.hypothesis or node.proposed_legal_theory,
                "hypothesis": node.hypothesis,
                "confidence": node.confidence,
                "overall_score": node.evaluation.overall if node.evaluation else 0.0,
                "has_contradictions": bool(node.contradictions),
                "authority_count": len(node.authorities_found),
                "retention_decision": node.retention_decision,
                "assigned_agents": list(node.assigned_agents),
            }
        )
    return {
        "root_node_id": job.root_node_id,
        "node_count": len(nodes),
        "nodes": nodes,
        "active_branch_ids": list(job.active_branch_ids),
        "retained_branch_ids": list(job.retained_branch_ids),
        "pruned_branch_ids": list(job.pruned_branch_ids),
    }


def _node_label(node: Any) -> str:
    text = node.research_question or node.hypothesis or node.proposed_legal_theory or node.node_type
    text = str(text or "Node").strip()
    return text if len(text) <= 96 else text[:93] + "…"


def permitted_node_actions(job: ResearchJob, node_id: str) -> list[dict[str, str]]:
    node = job.nodes.get(node_id)
    if not node:
        return []
    terminal = job.status in {
        JobStatus.COMPLETED.value,
        JobStatus.CANCELED.value,
        JobStatus.FAILED.value,
    }
    if terminal:
        return []
    actions: list[dict[str, str]] = []
    if job.status != JobStatus.PAUSED.value:
        actions.append({"action": "PAUSE_FOR_ATTORNEY", "label": "Pause for attorney"})
    if node.status not in {NodeStatus.PRUNED.value, NodeStatus.MERGED.value}:
        actions.extend(
            [
                {"action": "EXPAND_WIDER", "label": "Expand wider"},
                {"action": "DEEPEN", "label": "Deepen"},
                {"action": "CHALLENGE", "label": "Challenge"},
                {"action": "REVISE", "label": "Revise"},
                {"action": "VERIFY", "label": "Verify"},
                {"action": "SYNTHESIZE", "label": "Synthesize"},
            ]
        )
    if node.branch_id in job.active_branch_ids and len(job.active_branch_ids) >= 2:
        actions.append({"action": "MERGE", "label": "Merge branches"})
    if node.status not in {NodeStatus.PRUNED.value, NodeStatus.COMPLETE.value}:
        actions.append({"action": "PRUNE", "label": "Prune"})
    # Complete is always attorney-triggerable while the job is non-terminal so the workspace
    # can finish a path after synthesis/verification without waiting for the controller alone.
    if job.status not in {
        JobStatus.COMPLETED.value,
        JobStatus.CANCELED.value,
        JobStatus.FAILED.value,
        JobStatus.BLOCKED.value,
    }:
        actions.append({"action": "COMPLETE", "label": "Complete"})
    return actions


def node_detail(job: ResearchJob, node_id: str) -> dict[str, Any] | None:
    node = job.nodes.get(node_id)
    if not node:
        return None
    related_auth = [
        auth.to_dict()
        for auth in job.authorities.values()
        if auth.node_id == node_id or auth.branch_id == node.branch_id
    ]
    related_ctr = [
        job.contradictions[cid].to_dict()
        for cid in node.contradictions
        if cid in job.contradictions
    ]
    notes = [
        note
        for note in (job.metadata.get("attorney_notes") or [])
        if isinstance(note, dict) and note.get("node_id") == node_id
    ]
    history = [
        event
        for event in job.events
        if isinstance(event, dict)
        and (
            (event.get("detail") or {}).get("focus_node_id") == node_id
            or (event.get("detail") or {}).get("node_id") == node_id
        )
    ]
    return {
        "node": node.to_dict(),
        "label": _node_label(node),
        "purpose": node.research_question or node.hypothesis or node.proposed_legal_theory,
        "findings": list(node.draft_conclusions),
        "parents": [job.nodes[pid].to_dict() for pid in node.parent_ids if pid in job.nodes],
        "children": [job.nodes[cid].to_dict() for cid in node.child_ids if cid in job.nodes],
        "supporting_authorities": related_auth or list(node.authorities_found),
        "contradictions": related_ctr,
        "evaluation": node.evaluation.to_dict() if node.evaluation else {},
        "moe_route": node.moe_route,
        "tools_used": list(node.tools_used),
        "models": list(node.assigned_models),
        "agents": list(node.assigned_agents),
        "artifacts": [
            art
            for art in job.artifacts
            if isinstance(art, dict)
            and (art.get("node_id") == node_id or node.node_type in {NodeType.FINAL_ARTIFACT.value, NodeType.SYNTHESIS.value})
        ],
        "attorney_notes": notes,
        "available_actions": permitted_node_actions(job, node_id),
        "event_history": history[-50:],
    }


def artifact_catalog(job: ResearchJob) -> list[dict[str, Any]]:
    catalog: list[dict[str, Any]] = []
    # Derived working artifacts from job state
    plan_parts = [
        f"- {hyp.legal_proposition}"
        for hyp in job.hypotheses.values()
    ]
    if plan_parts or job.assignment.legal_questions:
        catalog.append(
            {
                "artifact_id": f"{job.job_id}:research_plan",
                "kind": "research_plan",
                "title": "Research plan",
                "version": 1,
                "review_status": "working",
                "content_markdown": _research_plan_markdown(job),
                "created_at": job.created_at,
                "derived": True,
            }
        )
    catalog.append(
        {
            "artifact_id": f"{job.job_id}:issue_outline",
            "kind": "issue_outline",
            "title": "Issue outline",
            "version": 1,
            "review_status": "working",
            "content_markdown": _issue_outline_markdown(job),
            "created_at": job.created_at,
            "derived": True,
        }
    )
    if any(n.draft_conclusions for n in job.nodes.values()):
        catalog.append(
            {
                "artifact_id": f"{job.job_id}:research_memorandum",
                "kind": "research_memorandum",
                "title": "Research memorandum",
                "version": 1,
                "review_status": "draft",
                "content_markdown": _memo_markdown(job),
                "created_at": job.updated_at,
                "derived": True,
            }
        )
    catalog.append(
        {
            "artifact_id": f"{job.job_id}:citation_matrix",
            "kind": "citation_matrix",
            "title": "Citation matrix",
            "version": 1,
            "review_status": "working",
            "content_markdown": _citation_matrix_markdown(job),
            "created_at": job.updated_at,
            "derived": True,
        }
    )
    if job.contradictions:
        catalog.append(
            {
                "artifact_id": f"{job.job_id}:contradiction_report",
                "kind": "contradiction_report",
                "title": "Contradiction report",
                "version": 1,
                "review_status": "working",
                "content_markdown": _contradiction_report_markdown(job),
                "created_at": job.updated_at,
                "derived": True,
            }
        )
    catalog.append(
        {
            "artifact_id": f"{job.job_id}:executive_summary",
            "kind": "executive_summary",
            "title": "Executive summary",
            "version": 1,
            "review_status": "working",
            "content_markdown": _executive_summary_markdown(job),
            "created_at": job.updated_at,
            "derived": True,
        }
    )
    catalog.append(
        {
            "artifact_id": f"{job.job_id}:open_questions",
            "kind": "open_questions",
            "title": "Open questions",
            "version": 1,
            "review_status": "working",
            "content_markdown": _open_questions_markdown(job),
            "created_at": job.updated_at,
            "derived": True,
        }
    )
    catalog.append(
        {
            "artifact_id": f"{job.job_id}:attorney_review_record",
            "kind": "attorney_review_record",
            "title": "Attorney review record",
            "version": 1,
            "review_status": "record",
            "content_markdown": _attorney_review_record_markdown(job),
            "created_at": job.updated_at,
            "derived": True,
        }
    )
    for index, artifact in enumerate(job.artifacts):
        if not isinstance(artifact, dict):
            continue
        versions = list(artifact.get("versions") or [])
        version_no = len(versions) + 1
        catalog.append(
            {
                "artifact_id": artifact.get("artifact_id") or f"{job.job_id}:final:{index}",
                "kind": artifact.get("deliverable_type") or "final_deliverable",
                "title": artifact.get("title") or "Final deliverable",
                "version": artifact.get("version") or version_no,
                "versions": versions,
                "review_status": artifact.get("review_status") or ("final" if job.status == JobStatus.COMPLETED.value else "pending_review"),
                "content_markdown": artifact.get("content_markdown") or "",
                "protection": dict(artifact.get("protection") or {}),
                "authorities": artifact.get("authorities") or [],
                "created_at": artifact.get("created_at") or job.updated_at,
                "attorney_review_required": True,
                "response_envelope": artifact.get("response_envelope"),
                "derived": False,
                "raw": artifact,
            }
        )
    return catalog


def budget_snapshot(job: ResearchJob) -> dict[str, Any]:
    b = job.budgets
    depth = 0
    for node in job.nodes.values():
        d = 0
        current = node
        seen: set[str] = set()
        while current.parent_ids:
            pid = current.parent_ids[0]
            if pid in seen or pid not in job.nodes:
                break
            seen.add(pid)
            current = job.nodes[pid]
            d += 1
        depth = max(depth, d)
    duration_ms = sum(n.time_consumed_ms for n in job.nodes.values())
    unresolved = sum(1 for c in job.contradictions.values() if contradiction_is_open(c.resolution_status))
    return {
        **b.to_dict(),
        "tree_depth": depth,
        "active_branches": len(job.active_branch_ids),
        "contradictions_open": unresolved,
        "duration_ms": duration_ms,
        "model_calls_remaining": max(0, b.max_model_calls - b.model_calls_used),
        "tool_calls_remaining": max(0, b.max_tool_calls - b.tool_calls_used),
        "cost_remaining_usd": max(0.0, float(b.max_cost_usd) - float(b.cost_usd_used)),
    }


def timeline(job: ResearchJob, *, limit: int = 100) -> list[dict[str, Any]]:
    events = list(job.events[-limit:])
    readable = []
    for event in events:
        if not isinstance(event, dict):
            continue
        et = str(event.get("event_type") or "event")
        detail = event.get("detail") if isinstance(event.get("detail"), dict) else {}
        readable.append(
            {
                "event_id": event.get("event_id"),
                "event_type": et,
                "timestamp": event.get("timestamp"),
                "summary": _event_summary(et, detail),
                "detail": detail,
            }
        )
    return readable


def office_insert_payload(job: ResearchJob, kind: str = "executive_summary") -> dict[str, Any]:
    catalog = {item["kind"]: item for item in artifact_catalog(job)}
    item = catalog.get(kind) or catalog.get("executive_summary") or {
        "title": "LARS summary",
        "content_markdown": _executive_summary_markdown(job),
    }
    content = str(item.get("content_markdown") or "")
    # Plain text suitable for Word insertion (no HTML).
    return {
        "kind": kind,
        "title": item.get("title") or kind,
        "text": content,
        "markdown": content,
        "job_id": job.job_id,
        "matter_id": job.assignment.matter_id,
        "attorney_review_required": True,
        "disclaimer": "Attorney review required before client or court use.",
    }


def _research_plan_markdown(job: ResearchJob) -> str:
    lines = [
        f"# Research plan — {job.assignment.query}",
        "",
        f"**Jurisdiction:** {job.assignment.jurisdiction}",
        f"**Deliverable:** {job.assignment.deliverable_type.replace('_', ' ')}",
        "",
        "## Legal questions",
    ]
    for q in job.assignment.legal_questions:
        lines.append(f"- {q}")
    lines.append("")
    lines.append("## Hypotheses")
    if job.hypotheses:
        for hyp in job.hypotheses.values():
            lines.append(f"- **{hyp.legal_proposition}** (confidence {hyp.confidence:.2f})")
    else:
        lines.append("- Hypotheses will be seeded when ALTS expands the assignment tree.")
    lines.append("")
    lines.append("## Factual assumptions")
    for fact in job.assignment.factual_assumptions or ["None recorded."]:
        lines.append(f"- {fact}")
    return "\n".join(lines)


def _issue_outline_markdown(job: ResearchJob) -> str:
    lines = ["# Issue outline", ""]
    for idx, q in enumerate(job.assignment.legal_questions, 1):
        lines.append(f"## Issue {idx}")
        lines.append(q)
        related = [n for n in job.nodes.values() if n.research_question and q[:40].lower() in (n.research_question or "").lower()]
        if related:
            lines.append("")
            lines.append("Related branches:")
            for n in related[:5]:
                lines.append(f"- {n.node_type}: {n.research_question or n.hypothesis}")
        lines.append("")
    return "\n".join(lines)


def _memo_markdown(job: ResearchJob) -> str:
    lines = [
        f"# Research memorandum",
        "",
        f"**Matter:** {job.assignment.matter_id or 'Unassigned'}",
        f"**Jurisdiction:** {job.assignment.jurisdiction}",
        f"**Question:** {job.assignment.query}",
        "",
        "## Analysis",
        "",
    ]
    for node in job.nodes.values():
        if not node.draft_conclusions:
            continue
        lines.append(f"### {_node_label(node)}")
        lines.append(node.draft_conclusions[-1][:3000])
        lines.append("")
    lines.append("## Authorities")
    for auth in list(job.authorities.values())[:25]:
        lines.append(f"- {auth.citation} — {auth.validation_status} ({auth.jurisdiction})")
    lines.append("")
    lines.append("_Attorney review required. Do not file or send without review._")
    return "\n".join(lines)


def _citation_matrix_markdown(job: ResearchJob) -> str:
    lines = [
        "# Citation matrix",
        "",
        "| Citation | Jurisdiction | Type | Validation | Proposition |",
        "| --- | --- | --- | --- | --- |",
    ]
    for auth in job.authorities.values():
        prop = (auth.proposition_supported or "").replace("|", "/")[:80]
        lines.append(
            f"| {auth.citation} | {auth.jurisdiction} | {auth.authority_type} | {auth.validation_status} | {prop} |"
        )
    if len(lines) == 4:
        lines.append("| — | — | — | — | No authorities recorded yet |")
    return "\n".join(lines)


def _contradiction_report_markdown(job: ResearchJob) -> str:
    lines = ["# Contradiction report", ""]
    if not job.contradictions:
        lines.append("No contradictions recorded.")
        return "\n".join(lines)
    for ctr in job.contradictions.values():
        lines.append(f"## {ctr.contradiction_id} — {ctr.severity} / {ctr.resolution_status}")
        lines.append(f"**Type:** {ctr.contradiction_type}")
        lines.append(f"**Proposed resolution:** {ctr.proposed_resolution}")
        for item in ctr.conflicting_items:
            lines.append(f"- {item}")
        lines.append("")
    return "\n".join(lines)


def _executive_summary_markdown(job: ResearchJob) -> str:
    phase = derive_phase(job)
    lines = [
        "# Executive summary",
        "",
        f"**Assignment:** {job.assignment.query}",
        f"**Status:** {job.status} · **Phase:** {phase.replace('_', ' ')}",
        f"**Jurisdiction:** {job.assignment.jurisdiction}",
        "",
        "## Bottom line",
    ]
    finals = [a for a in job.artifacts if isinstance(a, dict) and a.get("content_markdown")]
    if finals:
        lines.append(str(finals[-1]["content_markdown"])[:2500])
    else:
        synthesis = next((n for n in job.nodes.values() if n.node_type == NodeType.SYNTHESIS.value and n.draft_conclusions), None)
        if synthesis:
            lines.append(synthesis.draft_conclusions[-1][:2500])
        else:
            lines.append("Research is in progress. No final synthesis is ready for attorney reliance.")
    lines.append("")
    lines.append("## Open risks")
    missing = sorted({m for n in job.nodes.values() for m in n.missing_evidence})[:10]
    if missing:
        for item in missing:
            lines.append(f"- {item}")
    else:
        lines.append("- No missing-evidence flags currently recorded.")
    lines.append("")
    lines.append("_Attorney review required before client or court use._")
    return "\n".join(lines)


def _open_questions_markdown(job: ResearchJob) -> str:
    lines = ["# Open questions", ""]
    for item in job.assignment.missing_critical_inputs:
        lines.append(f"- Critical input missing: {item}")
    for node in job.nodes.values():
        for missing in node.missing_evidence:
            lines.append(f"- [{node.node_id[:12]}] {missing}")
    for ctr in job.contradictions.values():
        if contradiction_is_open(ctr.resolution_status):
            lines.append(f"- Unresolved contradiction ({ctr.severity}): {ctr.proposed_resolution}")
    if len(lines) == 2:
        lines.append("- No open questions currently flagged.")
    return "\n".join(lines)


def _attorney_review_record_markdown(job: ResearchJob) -> str:
    lines = ["# Attorney review record", ""]
    for gate in job.gates:
        lines.append(
            f"- **{gate.gate_type}** — {gate.status}"
            + (f" by {gate.decided_by} at {gate.decided_at}" if gate.decided_at else "")
            + (f" — {gate.notes}" if gate.notes else "")
        )
    notes = job.metadata.get("attorney_notes") or []
    if notes:
        lines.append("")
        lines.append("## Notes")
        for note in notes:
            if isinstance(note, dict):
                lines.append(f"- {note.get('created_at')}: {note.get('text')}")
    return "\n".join(lines)


def source_usage_trace(job: ResearchJob) -> dict[str, Any]:
    """Trace where each source appears across ALTS paths, claims, citations, and work products."""
    sources: dict[str, dict[str, Any]] = {}

    def ensure(source_key: str, **fields: Any) -> dict[str, Any]:
        item = sources.setdefault(
            source_key,
            {
                "source_key": source_key,
                "label": fields.get("label") or source_key,
                "source_class": fields.get("source_class") or "unverified_source",
                "document_id": fields.get("document_id"),
                "authority_id": fields.get("authority_id"),
                "alts_paths": [],
                "findings": [],
                "claims": [],
                "citations": [],
                "contradictions": [],
                "work_product_sections": [],
            },
        )
        for key, value in fields.items():
            if value is not None and key in {"label", "source_class", "document_id", "authority_id"}:
                item[key] = value
        return item

    for auth in job.authorities.values():
        key = auth.authority_id or auth.citation
        class_name = "primary_authority"
        if "secondary" in (auth.classification or "").lower() or auth.authority_type in {"treatise", "secondary"}:
            class_name = "secondary_authority"
        if "district of columbia" in (auth.jurisdiction or "").lower() or "d.c." in (auth.jurisdiction or "").lower():
            if class_name == "primary_authority":
                class_name = "dc_official_source"
        if auth.validation_status in {"unverified", "candidate"}:
            class_name = "unverified_source"
        item = ensure(
            key,
            label=auth.citation or auth.title,
            source_class=class_name,
            authority_id=auth.authority_id,
        )
        if auth.node_id:
            item["alts_paths"].append(auth.node_id)
        if auth.proposition_supported:
            item["claims"].append(auth.proposition_supported)
            item["findings"].append(auth.proposition_supported)
        item["citations"].append(
            {
                "citation": auth.citation,
                "pinpoint": (auth.relevant_passages or [None])[0],
                "excerpt": (auth.relevant_passages or [None])[0],
                "verification_state": auth.validation_status,
            }
        )

    for evidence in job.evidence.values():
        key = evidence.document_id or evidence.evidence_id
        item = ensure(
            key,
            label=evidence.relevant_fact or evidence.document_id or evidence.evidence_id,
            source_class="matter_document" if evidence.document_id else "attorney_provided_source",
            document_id=evidence.document_id,
        )
        if evidence.node_id:
            item["alts_paths"].append(evidence.node_id)
        item["findings"].append(evidence.relevant_fact)
        item["claims"].append(evidence.relevant_fact)

    for ctr in job.contradictions.values():
        for conflict in ctr.conflicting_items:
            if not isinstance(conflict, dict):
                continue
            key = str(conflict.get("authority_id") or conflict.get("citation") or conflict.get("label") or ctr.contradiction_id)
            item = ensure(key, label=str(conflict.get("citation") or conflict.get("label") or key))
            item["contradictions"].append(ctr.contradiction_id)
            item["alts_paths"].extend(ctr.impacted_branch_ids)

    for artifact in job.artifacts:
        if not isinstance(artifact, dict):
            continue
        artifact_id = str(artifact.get("artifact_id") or artifact.get("title") or "artifact")
        for auth_id in artifact.get("authority_ids") or []:
            item = ensure(str(auth_id))
            item["work_product_sections"].append(artifact_id)
        for doc_id in artifact.get("document_ids") or []:
            item = ensure(str(doc_id), source_class="matter_document", document_id=str(doc_id))
            item["work_product_sections"].append(artifact_id)

    # De-duplicate list fields.
    for item in sources.values():
        for field in ("alts_paths", "findings", "claims", "contradictions", "work_product_sections"):
            item[field] = list(dict.fromkeys(item[field]))

    selected_docs = list(job.assignment.selected_document_ids or [])
    excluded = list(job.assignment.excluded_sources or [])
    return {
        "job_id": job.job_id,
        "matter_id": job.assignment.matter_id,
        "source_scope": {
            "selected_document_ids": selected_docs,
            "excluded_sources": excluded,
            "official_source_preference": job.assignment.official_source_preference,
            "source_restrictions": list(job.assignment.source_restrictions or []),
        },
        "sources": list(sources.values()),
        "source_count": len(sources),
    }


def _event_summary(event_type: str, detail: dict[str, Any]) -> str:
    mapping = {
        "job_created": "Assignment created",
        "job_started": "Execution started",
        "job_paused": "Paused by attorney",
        "job_resumed": "Resumed",
        "job_canceled": "Canceled",
        "job_completed": "Completed",
        "gate_decision": f"Gate decision: {detail.get('decision')}",
        "alts_action_selected": f"ALTS selected {detail.get('action')}",
        "branch_pruned": "Branch pruned",
        "branches_merged": "Branches merged",
        "hypotheses_seeded": f"Seeded {detail.get('count')} hypotheses",
        "step_failed": f"Step failed: {detail.get('error')}",
        "attorney_action": f"Attorney directed {detail.get('action')}",
        "contradiction_resolved": "Contradiction resolved",
        "attorney_note_added": "Attorney note added",
        "background_run_started": "Background run started",
        "background_run_finished": "Background run finished",
        "worker_lease_recovered": "Worker lease recovered",
        "background_run_skipped": "Background run skipped",
        "background_run_preempted": "Background run preempted",
    }
    return mapping.get(event_type, event_type.replace("_", " ").title())
