"""Mercy LARS — Legal Autonomous Research System.

Mercy LARS manages durable long-running legal assignments.
Mercy ALTS (Adaptive Legal Tree Search) selects research trajectories.
Existing MoE routing selects experts, models, tools, and capabilities.
"""

from __future__ import annotations

from lars.assignment import compile_legal_assignment, depth_budget_profiles, validate_assignment
from lars.models import LARS_VERSION
from lars.runtime import (
    add_attorney_note,
    apply_node_action,
    approve_gate,
    cancel_job,
    create_and_start_job,
    get_events,
    get_job,
    get_node,
    get_office_insert,
    get_source_usage,
    list_jobs,
    pause_job,
    protect_artifact,
    recover_abandoned_jobs,
    resolve_contradiction,
    resume_job,
    run_job_steps,
    schedule_background_run,
    status_payload,
)

__all__ = [
    "LARS_VERSION",
    "add_attorney_note",
    "apply_node_action",
    "approve_gate",
    "cancel_job",
    "compile_legal_assignment",
    "create_and_start_job",
    "depth_budget_profiles",
    "get_events",
    "get_job",
    "get_node",
    "get_office_insert",
    "get_source_usage",
    "list_jobs",
    "pause_job",
    "protect_artifact",
    "recover_abandoned_jobs",
    "resolve_contradiction",
    "resume_job",
    "run_job_steps",
    "schedule_background_run",
    "status_payload",
    "validate_assignment",
]
