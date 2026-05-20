from __future__ import annotations

import os
import unittest
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


def _matter_id(label: str) -> str:
    return f"{label}-{uuid4().hex}"


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
        with _patched_env(os.environ, {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "token", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            response = client.get("/v1/matters")

        self.assertEqual(response.status_code, 401)

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
                            "documents": [{"document_id": "matter-a-secret-doc", "filename": "matter-a-secret.pdf"}],
                            "attached_documents": [{"document_id": "matter-a-secret-doc"}],
                        },
                    },
                )
                context = execute_agent_task.call_args.kwargs["matter_context"]

        self.assertEqual(response.status_code, 200)
        document_ids = {document.get("document_id") for document in context.get("documents", [])}
        self.assertEqual(document_ids, {"matter-b-doc"})
        self.assertNotIn("matter-a-secret-doc", str(context))


if __name__ == "__main__":
    unittest.main()
