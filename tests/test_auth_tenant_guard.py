from __future__ import annotations

import os
import unittest
import base64
import hashlib
import hmac
import json
import time
from contextlib import contextmanager
from unittest.mock import patch
from uuid import uuid4

os.environ.setdefault("MERCY_ENV", "local")

try:
    from fastapi.testclient import TestClient

    from main import app

    FASTAPI_AVAILABLE = True
except ModuleNotFoundError:
    TestClient = None
    app = None
    FASTAPI_AVAILABLE = False


def _headers(tenant_id: str, user_id: str = "user-1") -> dict[str, str]:
    return {
        "Authorization": "Bearer test-token",
        "X-Mercy-Tenant-Id": tenant_id,
        "X-Mercy-User-Id": user_id,
    }


def _jwt_headers(token: str, tenant_id: str = "client-supplied-tenant") -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "X-Mercy-Tenant-Id": tenant_id,
        "X-Mercy-Firm-Id": "client-supplied-firm",
        "X-Mercy-User-Id": "client-supplied-user",
        "X-Mercy-Roles": "client_supplied_role",
    }


def _matter_id(label: str) -> str:
    return f"{label}-{uuid4().hex}"


def _b64url(payload: dict[str, object]) -> str:
    return base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")).rstrip(b"=").decode("ascii")


def _supabase_jwt(
    *,
    secret: str = "unit-supabase-secret",
    user_id: str = "jwt-user-a",
    tenant_id: str = "jwt-tenant-a",
    firm_id: str | None = None,
    expires_in: int = 3600,
    roles: list[str] | None = None,
    issuer: str | None = None,
) -> str:
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload: dict[str, object] = {
        "aud": "authenticated",
        "sub": user_id,
        "iat": now,
        "exp": now + expires_in,
        "app_metadata": {"tenant_id": tenant_id, "roles": roles or ["attorney"]},
        "user_metadata": {"name": "JWT User"},
    }
    if firm_id:
        app_metadata = payload["app_metadata"]
        assert isinstance(app_metadata, dict)
        app_metadata["firm_id"] = firm_id
    if issuer:
        payload["iss"] = issuer
    signing_input = f"{_b64url(header)}.{_b64url(payload)}"
    signature = hmac.new(secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode('ascii')}"


@contextmanager
def _patched_env(*args, **kwargs):
    from mercy_config import get_config

    with patch.dict(*args, **kwargs):
        get_config.cache_clear()
        try:
            yield
        finally:
            get_config.cache_clear()


class AuthTenantGuardTests(unittest.TestCase):
    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_legal_endpoint_rejects_unauthenticated_non_local_request(self) -> None:
        with _patched_env(os.environ, {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": "unit-supabase-secret"}):
            client = TestClient(app)  # type: ignore[arg-type]
            response = client.get("/v1/matters")

        self.assertEqual(response.status_code, 401)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_valid_supabase_jwt_is_accepted_and_derives_identity(self) -> None:
        token = _supabase_jwt(user_id="jwt-user-a", tenant_id="jwt-tenant-a", roles=["attorney", "firm_admin"])
        with _patched_env(
            os.environ,
            {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": "unit-supabase-secret"},
        ):
            client = TestClient(app)  # type: ignore[arg-type]
            created = client.post("/v1/matters", headers=_jwt_headers(token, tenant_id="spoofed-tenant"), json={"name": "JWT matter"})

        self.assertEqual(created.status_code, 200)
        payload = created.json()
        self.assertEqual(payload["tenant_id"], "jwt-tenant-a")
        self.assertEqual(payload["created_by_user_id"], "jwt-user-a")

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_firm_id_takes_precedence_and_tenant_id_supports_solo_accounts(self) -> None:
        firm_token = _supabase_jwt(user_id="firm-user", tenant_id="solo-tenant-shadow", firm_id="firm-tenant-a")
        solo_token = _supabase_jwt(user_id="solo-user", tenant_id="solo-tenant-a")
        with _patched_env(
            os.environ,
            {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": "unit-supabase-secret"},
        ):
            client = TestClient(app)  # type: ignore[arg-type]
            firm_created = client.post("/v1/matters", headers=_jwt_headers(firm_token), json={"name": "Firm matter"})
            solo_created = client.post("/v1/matters", headers=_jwt_headers(solo_token), json={"name": "Solo matter"})

        self.assertEqual(firm_created.status_code, 200)
        self.assertEqual(solo_created.status_code, 200)
        self.assertEqual(firm_created.json()["tenant_id"], "firm-tenant-a")
        self.assertEqual(solo_created.json()["tenant_id"], "solo-tenant-a")

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_missing_invalid_and_expired_supabase_jwt_are_rejected(self) -> None:
        expired = _supabase_jwt(expires_in=-60)
        valid = _supabase_jwt()
        invalid = f"{valid.rsplit('.', 1)[0]}.invalid-signature"
        with _patched_env(
            os.environ,
            {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": "unit-supabase-secret"},
        ):
            client = TestClient(app)  # type: ignore[arg-type]
            missing = client.get("/v1/matters")
            bad_signature = client.get("/v1/matters", headers={"Authorization": f"Bearer {invalid}"})
            expired_response = client.get("/v1/matters", headers={"Authorization": f"Bearer {expired}"})

        self.assertEqual(missing.status_code, 401)
        self.assertEqual(bad_signature.status_code, 401)
        self.assertEqual(expired_response.status_code, 401)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_supabase_jwt_misconfiguration_fails_closed(self) -> None:
        token = _supabase_jwt()
        with _patched_env(os.environ, {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": ""}):
            client = TestClient(app)  # type: ignore[arg-type]
            response = client.get("/v1/matters", headers={"Authorization": f"Bearer {token}"})

        self.assertEqual(response.status_code, 500)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_test_auth_only_works_in_explicit_test_environments(self) -> None:
        test_headers = _headers("ci-tenant", user_id="ci-user")
        with _patched_env(os.environ, {"MERCY_ENV": "test", "MERCY_AUTH_MODE": "test", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            accepted = client.get("/v1/matters", headers=test_headers)
        with _patched_env(os.environ, {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "test", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            rejected = client.get("/v1/matters", headers=test_headers)

        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(rejected.status_code, 500)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_legacy_token_auth_is_not_a_production_mode(self) -> None:
        with _patched_env(os.environ, {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "token", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            response = client.get("/v1/matters", headers=_headers("tenant-token"))

        self.assertEqual(response.status_code, 500)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_supabase_jwt_issuer_must_match_configured_project(self) -> None:
        valid = _supabase_jwt(issuer="https://mercy-test.supabase.co/auth/v1")
        wrong_issuer = _supabase_jwt(issuer="https://other-project.supabase.co/auth/v1")
        with _patched_env(
            os.environ,
            {
                "MERCY_ENV": "prod",
                "MERCY_AUTH_MODE": "supabase",
                "SUPABASE_URL": "https://mercy-test.supabase.co",
                "SUPABASE_JWT_SECRET": "unit-supabase-secret",
            },
        ):
            client = TestClient(app)  # type: ignore[arg-type]
            accepted = client.get("/v1/matters", headers={"Authorization": f"Bearer {valid}"})
            rejected = client.get("/v1/matters", headers={"Authorization": f"Bearer {wrong_issuer}"})

        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(rejected.status_code, 401)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_client_supplied_tenant_cannot_override_verified_jwt_tenant(self) -> None:
        tenant_a = _supabase_jwt(user_id="jwt-user-a", tenant_id="jwt-tenant-a")
        tenant_b = _supabase_jwt(user_id="jwt-user-b", tenant_id="jwt-tenant-b")
        with _patched_env(
            os.environ,
            {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": "unit-supabase-secret"},
        ):
            client = TestClient(app)  # type: ignore[arg-type]
            created = client.post(
                "/v1/matters",
                headers=_jwt_headers(tenant_a, tenant_id="jwt-tenant-b"),
                json={"name": "Tenant A JWT matter"},
            )
            matter_id = created.json()["matter_id"]
            same_tenant = client.get(f"/v1/matters/{matter_id}", headers=_jwt_headers(tenant_a, tenant_id="jwt-tenant-b"))
            other_tenant = client.get(f"/v1/matters/{matter_id}", headers=_jwt_headers(tenant_b, tenant_id="jwt-tenant-a"))

        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.json()["tenant_id"], "jwt-tenant-a")
        self.assertEqual(same_tenant.status_code, 200)
        self.assertEqual(other_tenant.status_code, 404)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_local_dev_bypass_requires_explicit_env_pair(self) -> None:
        with _patched_env(os.environ, {"MERCY_ENV": "local", "MERCY_AUTH_MODE": "dev"}):
            client = TestClient(app)  # type: ignore[arg-type]
            response = client.get("/v1/matters")

        self.assertEqual(response.status_code, 200)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_cross_tenant_matter_access_is_forbidden(self) -> None:
        matter_id = _matter_id("auth-tenant-guard-matter")
        with _patched_env(os.environ, {"MERCY_ENV": "local", "MERCY_AUTH_MODE": "dev", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            create_response = client.post(
                "/v1/matter/intake",
                headers=_headers("tenant-a"),
                json={
                    "matter_id": matter_id,
                    "client_id": "client-a",
                    "matter_name": "Tenant A Matter",
                    "jurisdiction": "District of Columbia",
                    "surface_context": "unit_test_auth",
                },
            )
            same_tenant_response = client.get(
                f"/v1/matters/{matter_id}",
                headers=_headers("tenant-a"),
            )
            cross_tenant_response = client.get(
                f"/v1/matters/{matter_id}",
                headers=_headers("tenant-b"),
            )

        self.assertEqual(create_response.status_code, 200)
        self.assertEqual(same_tenant_response.status_code, 200)
        self.assertEqual(cross_tenant_response.status_code, 404)
        self.assertEqual(cross_tenant_response.json()["detail"], "Matter not found.")

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_cross_tenant_document_access_returns_safe_not_found(self) -> None:
        matter_id = _matter_id("auth-doc-tenant-matter")
        document_id = "tenant-a-only-document"
        with _patched_env(os.environ, {"MERCY_ENV": "local", "MERCY_AUTH_MODE": "dev", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            create_response = client.post(
                "/v1/matter/intake",
                headers=_headers("tenant-a"),
                json={
                    "matter_id": matter_id,
                    "client_id": "client-a",
                    "matter_name": "Tenant A Document Matter",
                    "documents": [{"document_id": document_id, "filename": "tenant-a.pdf", "status": "Ready"}],
                    "surface_context": "unit_test_auth",
                },
            )
            same_tenant_response = client.get(f"/v1/matters/{matter_id}/documents", headers=_headers("tenant-a"))
            cross_tenant_response = client.get(f"/v1/matters/{matter_id}/documents/{document_id}/preview", headers=_headers("tenant-b"))

        self.assertEqual(create_response.status_code, 200)
        self.assertEqual(same_tenant_response.status_code, 200)
        self.assertEqual(same_tenant_response.json()["documents"][0]["document_id"], document_id)
        self.assertEqual(cross_tenant_response.status_code, 404)
        self.assertIn(cross_tenant_response.json()["detail"], {"Matter not found.", "Document not found."})

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_matter_a_document_does_not_enter_matter_b_agent_context(self) -> None:
        matter_a = _matter_id("matter-a")
        matter_b = _matter_id("matter-b")
        with _patched_env(os.environ, {"MERCY_ENV": "local", "MERCY_AUTH_MODE": "dev", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            client.post(
                "/v1/matter/intake",
                headers=_headers("tenant-a"),
                json={
                    "matter_id": matter_a,
                    "matter_name": "Matter A",
                    "documents": [{"document_id": "matter-a-secret-doc", "filename": "matter-a-secret.pdf"}],
                    "surface_context": "unit_test_auth",
                },
            )
            client.post(
                "/v1/matter/intake",
                headers=_headers("tenant-a"),
                json={
                    "matter_id": matter_b,
                    "matter_name": "Matter B",
                    "documents": [{"document_id": "matter-b-doc", "filename": "matter-b.pdf"}],
                    "surface_context": "unit_test_auth",
                },
            )
            with (
                patch("main.check_quota"),
                patch("main.record_usage", return_value={"strong_model_remaining": 49}),
                patch("main.execute_agent_task") as execute_agent_task,
            ):
                execute_agent_task.return_value = {
                    "agent_network_version": "unit",
                    "selected_agent": "research",
                    "selected_expert": "research",
                    "agent_result": {"answer": "ok"},
                    "mcp_skills_used": [],
                    "citations": [],
                }
                response = client.post(
                    "/v1/agent/execute",
                    headers=_headers("tenant-a"),
                    json={
                        "task": "Use the selected matter only.",
                        "matter_id": matter_b,
                        "matter_context": {
                            "auth_context": {"tenant_id": "tenant-b", "user_id": "attacker"},
                            "documents": [{"document_id": "matter-a-secret-doc", "filename": "matter-a-secret.pdf"}],
                            "attached_documents": [{"document_id": "matter-a-secret-doc"}],
                        },
                    },
                )
                context = execute_agent_task.call_args.kwargs["matter_context"]

        self.assertEqual(response.status_code, 200)
        self.assertEqual(context["auth_context"]["tenant_id"], "tenant-a")
        document_ids = {document.get("document_id") for document in context.get("documents", [])}
        self.assertEqual(document_ids, {"matter-b-doc"})
        self.assertNotIn("matter-a-secret-doc", str(context))


if __name__ == "__main__":
    unittest.main()
