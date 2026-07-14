"""Out-of-process LARS worker — PostgreSQL-backed lease claim loop.

Run as a separate process so multi-hour assignments do not depend on a browser
tab, a single HTTP request, or the API process thread pool:

    python -m scripts.lars_worker --tenant-id TENANT --once
    python -m scripts.lars_worker --tenant-id TENANT --poll-seconds 5

The worker claims expired or unleased runnable jobs, heartbeats the lease while
stepping ALTS, and releases the lease on terminal/pause/gate states.
"""

from __future__ import annotations

import os
import time
import uuid
from typing import Any

from lars.models import JobStatus, append_event, utc_now
from lars.runtime import (
    _acquire_or_refresh_lease,
    _lease_expired,
    _lease_payload,
    _release_lease,
    run_job_steps,
)
from lars.store import get_job as store_get_job
from lars.store import list_jobs as store_list_jobs
from lars.store import save_job
from observability import trace_event


RUNNABLE = {
    JobStatus.QUEUED.value,
    JobStatus.RUNNING.value,
    JobStatus.VERIFYING.value,
}


def _now() -> str:
    return utc_now().isoformat()


def worker_id() -> str:
    return os.environ.get("MERCY_LARS_WORKER_ID") or f"lars-worker-{uuid.uuid4().hex[:12]}"


def list_claimable_jobs(*, tenant_id: str, limit: int = 20) -> list[str]:
    """Return job ids that are runnable and unleased or lease-expired."""
    jobs = store_list_jobs(tenant_id=tenant_id, limit=max(limit, 50))
    claimable: list[str] = []
    for job in jobs:
        if job.status not in RUNNABLE:
            continue
        lease = dict(job.metadata.get("worker_lease") or {})
        owner = str(lease.get("owner_id") or "")
        if owner and not _lease_expired(lease):
            continue
        claimable.append(job.job_id)
        if len(claimable) >= limit:
            break
    return claimable


def claim_job(job_id: str, *, tenant_id: str, owner_id: str | None = None) -> dict[str, Any]:
    """Atomically claim a durable job lease for out-of-process execution."""
    owner = owner_id or worker_id()
    job = store_get_job(job_id, tenant_id=tenant_id)
    if not job:
        return {"claimed": False, "reason": "not_found", "job_id": job_id}
    if job.status not in RUNNABLE:
        return {"claimed": False, "reason": f"status_{job.status}", "job_id": job_id}
    if not _acquire_or_refresh_lease(job, owner_id=owner, force=False):
        return {
            "claimed": False,
            "reason": "lease_held",
            "job_id": job_id,
            "lease": job.metadata.get("worker_lease"),
        }
    if job.status == JobStatus.QUEUED.value:
        job.status = JobStatus.RUNNING.value
    append_event(job, "worker_claimed", {"owner_id": owner, "mode": "out_of_process"})
    save_job(job)
    return {"claimed": True, "job_id": job_id, "owner_id": owner, "status": job.status}


def process_claimed_job(
    job_id: str,
    *,
    tenant_id: str,
    owner_id: str,
    max_ticks: int = 10,
    steps_per_tick: int | None = None,
) -> dict[str, Any]:
    """Run ALTS steps under a held lease with heartbeats."""
    ticks_done = 0
    for tick in range(max_ticks):
        job = store_get_job(job_id, tenant_id=tenant_id)
        if not job:
            return {"job_id": job_id, "status": "missing", "ticks": ticks_done}
        lease = dict(job.metadata.get("worker_lease") or {})
        if str(lease.get("owner_id") or "") != owner_id:
            return {
                "job_id": job_id,
                "status": "preempted",
                "ticks": ticks_done,
                "lease": lease,
            }
        if job.status not in RUNNABLE:
            _release_lease(job, owner_id=owner_id)
            append_event(job, "worker_finished", {"status": job.status, "ticks": ticks_done})
            save_job(job)
            return {"job_id": job_id, "status": job.status, "ticks": ticks_done}
        # Heartbeat lease before each tick.
        job.metadata["worker_lease"] = _lease_payload(owner_id=owner_id)
        save_job(job)
        step_n = steps_per_tick or max(1, int(job.budgets.max_steps_per_tick or 2))
        run_job_steps(job_id, tenant_id=tenant_id, max_steps=step_n)
        ticks_done += 1
        job = store_get_job(job_id, tenant_id=tenant_id)
        if not job or job.status not in RUNNABLE:
            break
    job = store_get_job(job_id, tenant_id=tenant_id)
    if job:
        _release_lease(job, owner_id=owner_id)
        append_event(job, "worker_tick_batch_done", {"ticks": ticks_done, "status": job.status})
        save_job(job)
        return {"job_id": job_id, "status": job.status, "ticks": ticks_done}
    return {"job_id": job_id, "status": "missing", "ticks": ticks_done}


def run_once(*, tenant_id: str, limit: int = 5, max_ticks: int = 8) -> dict[str, Any]:
    """Claim and process up to `limit` jobs once (for cron or tests)."""
    owner = worker_id()
    results: list[dict[str, Any]] = []
    for job_id in list_claimable_jobs(tenant_id=tenant_id, limit=limit):
        claim = claim_job(job_id, tenant_id=tenant_id, owner_id=owner)
        if not claim.get("claimed"):
            results.append(claim)
            continue
        outcome = process_claimed_job(
            job_id,
            tenant_id=tenant_id,
            owner_id=owner,
            max_ticks=max_ticks,
        )
        results.append({"claim": claim, "outcome": outcome})
        trace_event(
            name="lars_worker_once",
            surface_context="lars_worker",
            category="workflow",
            metadata={"job_id": job_id, "status": outcome.get("status"), "ticks": outcome.get("ticks")},
        )
    return {
        "worker_id": owner,
        "tenant_id": tenant_id,
        "processed": len(results),
        "results": results,
        "finished_at": _now(),
    }


def run_worker_loop(
    *,
    tenant_id: str,
    poll_seconds: float = 5.0,
    limit: int = 5,
    max_ticks: int = 8,
    max_iterations: int | None = None,
) -> dict[str, Any]:
    """Long-running claim loop. max_iterations is for tests."""
    owner = worker_id()
    iterations = 0
    batches: list[dict[str, Any]] = []
    while max_iterations is None or iterations < max_iterations:
        batch = run_once(tenant_id=tenant_id, limit=limit, max_ticks=max_ticks)
        batches.append(batch)
        iterations += 1
        if max_iterations is not None and iterations >= max_iterations:
            break
        time.sleep(max(0.1, float(poll_seconds)))
    return {
        "worker_id": owner,
        "tenant_id": tenant_id,
        "iterations": iterations,
        "batches": batches,
        "finished_at": _now(),
    }
