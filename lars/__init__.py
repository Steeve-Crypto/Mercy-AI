"""Mercy LARS — Legal Autonomous Research System.

Mercy LARS manages durable long-running legal assignments.
Mercy ALTS (Adaptive Legal Tree Search) selects research trajectories.
Existing MoE routing selects experts, models, tools, and capabilities.
"""

from __future__ import annotations

from lars.assignment import compile_legal_assignment, validate_assignment
from lars.models import LARS_VERSION
from lars.runtime import (
    approve_gate,
    cancel_job,
    create_and_start_job,
    get_job,
    list_jobs,
    pause_job,
    resume_job,
    run_job_steps,
    status_payload,
)

__all__ = [
    "LARS_VERSION",
    "approve_gate",
    "cancel_job",
    "compile_legal_assignment",
    "create_and_start_job",
    "get_job",
    "list_jobs",
    "pause_job",
    "resume_job",
    "run_job_steps",
    "status_payload",
    "validate_assignment",
]
