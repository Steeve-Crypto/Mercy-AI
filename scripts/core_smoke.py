from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


JWT_SECRET = "verify-supabase-jwt-secret"


def _b64url(payload: dict[str, object]) -> str:
    return base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")).rstrip(b"=").decode("ascii")


def _jwt(tenant_id: str = "verify-tenant-a", user_id: str = "verify-user-a", roles: list[str] | None = None) -> str:
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "aud": "authenticated",
        "sub": user_id,
        "iat": now,
        "exp": now + 3600,
        "app_metadata": {"tenant_id": tenant_id, "roles": roles or ["attorney"]},
    }
    signing_input = f"{_b64url(header)}.{_b64url(payload)}"
    signature = hmac.new(JWT_SECRET.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode('ascii')}"


def _headers(tenant_id: str = "verify-tenant-a", user_id: str = "verify-user-a", roles: list[str] | None = None) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_jwt(tenant_id, user_id, roles)}",
    }


def _assert_status(response: Any, expected: int, label: str) -> dict[str, Any]:
    if response.status_code != expected:
        raise AssertionError(f"{label}: expected {expected}, got {response.status_code}: {response.text[:500]}")
    try:
        return response.json()
    except Exception:
        return {}


def main() -> int:
    os.environ["MERCY_ENV"] = "verify"
    os.environ["MERCY_AUTH_MODE"] = "supabase"
    os.environ["SUPABASE_URL"] = ""
    os.environ["SUPABASE_JWKS_URL"] = ""
    os.environ["MERCY_SUPABASE_JWKS_URL"] = ""
    os.environ["SUPABASE_JWT_ISSUER"] = ""
    os.environ["MERCY_SUPABASE_JWT_ISSUER"] = ""
    os.environ["SUPABASE_JWT_SECRET"] = JWT_SECRET
    temp_dir = tempfile.TemporaryDirectory()
    os.environ["POSTGRES_URL"] = f"sqlite+pysqlite:///{Path(temp_dir.name) / 'mercy-core-smoke.db'}"

    from main import app
    from mercy_storage import reset_storage_for_tests

    try:
        client = TestClient(app)

        _assert_status(client.get("/health"), 200, "health")
        _assert_status(client.get("/v1/rag/status"), 401, "protected rag status without auth")

        rag_status = _assert_status(client.get("/v1/rag/status", headers=_headers()), 200, "authenticated rag status")
        if not rag_status.get("tenant_isolated"):
            raise AssertionError("rag status did not report tenant isolation")

        skills = _assert_status(client.get("/v1/agent/skills", headers=_headers()), 200, "agent skills")
        if not skills.get("skills"):
            raise AssertionError("agent skills response did not include discoverable MCP skills")

        invite = _assert_status(
            client.post("/v1/beta/invites", json={"email": "verify@example.com"}, headers=_headers(roles=["ops"])),
            200,
            "create beta invite for smoke tenant",
        )
        _assert_status(
            client.post(
                "/v1/beta/invites/accept",
                json={"email": "verify@example.com", "invite_code": invite.get("invite_code")},
                headers=_headers(),
            ),
            200,
            "accept beta invite for smoke tenant",
        )

        agent_payload = {
            "task": "Check D.C. ethics and citation reliability for an AI-assisted draft.",
            "params": {
                "query": "Check D.C. ethics and citation reliability.",
                "draft": "Attorney must verify citations and confidential matter facts before use.",
            },
            "matter_context": {
                "jurisdiction": "District of Columbia",
                "matter_type": "verification smoke test",
            },
            "surface_context": "verify_core_smoke",
        }
        agent = _assert_status(client.post("/v1/agent/execute", json=agent_payload, headers=_headers()), 200, "agent execute")
        envelope = agent.get("response_envelope") if isinstance(agent.get("response_envelope"), dict) else {}
        if not envelope.get("route") or not envelope.get("guardrail_status"):
            raise AssertionError("agent execute response did not include response envelope route and guardrail metadata")

        matter = _assert_status(
            client.post(
                "/v1/matters",
                json={"name": "Verify Tenant Matter", "client_name": "Verification Client", "matter_type": "smoke"},
                headers=_headers("verify-tenant-a", "verify-user-a"),
            ),
            200,
            "create matter tenant A",
        )
        matter_id = matter.get("matter_id")
        if not matter_id:
            raise AssertionError("matter creation did not return matter_id")

        _assert_status(
            client.get(f"/v1/matters/{matter_id}", headers=_headers("verify-tenant-b", "verify-user-b")),
            404,
            "cross-tenant matter read blocked",
        )

        _assert_status(
            client.post("/v1/rag/evaluate", json={"limit": 5, "top_k": 5, "pass_threshold": 0.72}, headers=_headers()),
            200,
            "rag evaluate endpoint",
        )

        print("Core smoke passed: health, auth guard, tenant isolation, RAG status, agent skills, agent execute, RAGAS endpoint")
        return 0
    finally:
        reset_storage_for_tests()
        temp_dir.cleanup()


if __name__ == "__main__":
    raise SystemExit(main())
