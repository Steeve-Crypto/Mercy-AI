"""Durable and in-memory store for Mercy LARS jobs."""

from __future__ import annotations

import json
import threading
from typing import Any

from lars.models import ResearchJob
from mercy_storage import local_memory_fallback_allowed, persistent_storage_configured, session_scope, storage_mode
from observability import trace_event


_LOCK = threading.RLock()
_MEMORY_JOBS: dict[str, dict[str, Any]] = {}


def lars_store_status() -> dict[str, Any]:
    return {
        "mode": "postgres" if persistent_storage_configured() else ("memory" if local_memory_fallback_allowed() else "unavailable"),
        "storage_mode": storage_mode(),
        "memory_jobs": len(_MEMORY_JOBS),
    }


def _ensure_table() -> None:
    if not persistent_storage_configured():
        return
    from sqlalchemy import text

    with session_scope() as session:
        bind = session.get_bind()
        if bind.dialect.name == "sqlite":
            session.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS mercy_lars_jobs (
                        job_id VARCHAR(128) PRIMARY KEY,
                        tenant_id VARCHAR(128) NOT NULL,
                        firm_id VARCHAR(128),
                        user_id VARCHAR(128) NOT NULL,
                        matter_id VARCHAR(128),
                        status VARCHAR(64) NOT NULL,
                        payload_json TEXT NOT NULL,
                        created_at VARCHAR(64) NOT NULL,
                        updated_at VARCHAR(64) NOT NULL
                    )
                    """
                )
            )
            session.execute(text("CREATE INDEX IF NOT EXISTS ix_mercy_lars_jobs_tenant ON mercy_lars_jobs (tenant_id)"))
            session.execute(text("CREATE INDEX IF NOT EXISTS ix_mercy_lars_jobs_status ON mercy_lars_jobs (status)"))
        else:
            session.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS mercy_lars_jobs (
                        job_id VARCHAR(128) PRIMARY KEY,
                        tenant_id VARCHAR(128) NOT NULL,
                        firm_id VARCHAR(128),
                        user_id VARCHAR(128) NOT NULL,
                        matter_id VARCHAR(128),
                        status VARCHAR(64) NOT NULL,
                        payload_json JSONB NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL,
                        updated_at TIMESTAMPTZ NOT NULL
                    )
                    """
                )
            )
            session.execute(text("CREATE INDEX IF NOT EXISTS ix_mercy_lars_jobs_tenant ON mercy_lars_jobs (tenant_id)"))
            session.execute(text("CREATE INDEX IF NOT EXISTS ix_mercy_lars_jobs_status ON mercy_lars_jobs (status)"))


def save_job(job: ResearchJob) -> ResearchJob:
    payload = job.to_dict()
    with _LOCK:
        if persistent_storage_configured():
            _ensure_table()
            from sqlalchemy import text

            with session_scope() as session:
                bind = session.get_bind()
                payload_value = json.dumps(payload, ensure_ascii=True, default=str)
                if bind.dialect.name == "sqlite":
                    session.execute(
                        text(
                            """
                            INSERT INTO mercy_lars_jobs (job_id, tenant_id, firm_id, user_id, matter_id, status, payload_json, created_at, updated_at)
                            VALUES (:job_id, :tenant_id, :firm_id, :user_id, :matter_id, :status, :payload_json, :created_at, :updated_at)
                            ON CONFLICT(job_id) DO UPDATE SET
                                firm_id=excluded.firm_id,
                                matter_id=excluded.matter_id,
                                status=excluded.status,
                                payload_json=excluded.payload_json,
                                updated_at=excluded.updated_at
                            """
                        ),
                        {
                            "job_id": job.job_id,
                            "tenant_id": job.tenant_id,
                            "firm_id": job.firm_id,
                            "user_id": job.user_id,
                            "matter_id": job.assignment.matter_id,
                            "status": job.status,
                            "payload_json": payload_value,
                            "created_at": job.created_at,
                            "updated_at": job.updated_at,
                        },
                    )
                else:
                    session.execute(
                        text(
                            """
                            INSERT INTO mercy_lars_jobs (job_id, tenant_id, firm_id, user_id, matter_id, status, payload_json, created_at, updated_at)
                            VALUES (:job_id, :tenant_id, :firm_id, :user_id, :matter_id, :status, CAST(:payload_json AS JSONB), CAST(:created_at AS TIMESTAMPTZ), CAST(:updated_at AS TIMESTAMPTZ))
                            ON CONFLICT (job_id) DO UPDATE SET
                                firm_id = EXCLUDED.firm_id,
                                matter_id = EXCLUDED.matter_id,
                                status = EXCLUDED.status,
                                payload_json = EXCLUDED.payload_json,
                                updated_at = EXCLUDED.updated_at
                            """
                        ),
                        {
                            "job_id": job.job_id,
                            "tenant_id": job.tenant_id,
                            "firm_id": job.firm_id,
                            "user_id": job.user_id,
                            "matter_id": job.assignment.matter_id,
                            "status": job.status,
                            "payload_json": payload_value,
                            "created_at": job.created_at,
                            "updated_at": job.updated_at,
                        },
                    )
        else:
            if not local_memory_fallback_allowed():
                raise RuntimeError("LARS durable store requires PostgreSQL outside local mode.")
            _MEMORY_JOBS[job.job_id] = payload
    trace_event(
        name="lars_job_saved",
        surface_context="lars",
        category="storage",
        metadata={"job_id": job.job_id, "tenant_id": job.tenant_id, "status": job.status},
    )
    return job


def get_job(job_id: str, *, tenant_id: str) -> ResearchJob | None:
    with _LOCK:
        if persistent_storage_configured():
            _ensure_table()
            from sqlalchemy import text

            with session_scope() as session:
                row = session.execute(
                    text("SELECT payload_json, tenant_id FROM mercy_lars_jobs WHERE job_id = :job_id"),
                    {"job_id": job_id},
                ).mappings().first()
                if not row:
                    return None
                if str(row["tenant_id"]) != tenant_id:
                    return None
                payload = row["payload_json"]
                if isinstance(payload, str):
                    payload = json.loads(payload)
                return ResearchJob.from_dict(payload)
        payload = _MEMORY_JOBS.get(job_id)
        if not payload:
            return None
        if str(payload.get("tenant_id")) != tenant_id:
            return None
        return ResearchJob.from_dict(payload)


def list_jobs(
    *,
    tenant_id: str,
    limit: int = 50,
    matter_id: str | None = None,
    status: str | None = None,
) -> list[ResearchJob]:
    with _LOCK:
        if persistent_storage_configured():
            _ensure_table()
            from sqlalchemy import text

            clauses = ["tenant_id = :tenant_id"]
            params: dict[str, Any] = {"tenant_id": tenant_id, "limit": limit}
            if matter_id:
                clauses.append("matter_id = :matter_id")
                params["matter_id"] = matter_id
            if status:
                clauses.append("status = :status")
                params["status"] = status
            where_sql = " AND ".join(clauses)
            with session_scope() as session:
                rows = session.execute(
                    text(
                        f"""
                        SELECT payload_json FROM mercy_lars_jobs
                        WHERE {where_sql}
                        ORDER BY updated_at DESC
                        LIMIT :limit
                        """
                    ),
                    params,
                ).mappings().all()
                jobs: list[ResearchJob] = []
                for row in rows:
                    payload = row["payload_json"]
                    if isinstance(payload, str):
                        payload = json.loads(payload)
                    jobs.append(ResearchJob.from_dict(payload))
                return jobs
        jobs = []
        for payload in _MEMORY_JOBS.values():
            if str(payload.get("tenant_id")) != tenant_id:
                continue
            if status and str(payload.get("status") or "") != status:
                continue
            assignment = payload.get("assignment") or {}
            job_matter = str(payload.get("matter_id") or assignment.get("matter_id") or "")
            if matter_id and job_matter != matter_id:
                continue
            jobs.append(ResearchJob.from_dict(payload))
        jobs.sort(key=lambda job: job.updated_at, reverse=True)
        return jobs[:limit]


def delete_tenant_jobs(tenant_id: str) -> int:
    with _LOCK:
        if persistent_storage_configured():
            _ensure_table()
            from sqlalchemy import text

            with session_scope() as session:
                result = session.execute(
                    text("DELETE FROM mercy_lars_jobs WHERE tenant_id = :tenant_id"),
                    {"tenant_id": tenant_id},
                )
                return int(result.rowcount or 0)
        victims = [job_id for job_id, payload in _MEMORY_JOBS.items() if payload.get("tenant_id") == tenant_id]
        for job_id in victims:
            _MEMORY_JOBS.pop(job_id, None)
        return len(victims)


def reset_memory_store_for_tests() -> None:
    with _LOCK:
        _MEMORY_JOBS.clear()
