from __future__ import annotations

import os
import unittest
from unittest.mock import patch

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


class AuthTenantGuardTests(unittest.TestCase):
    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_legal_endpoint_rejects_unauthenticated_non_local_request(self) -> None:
        with patch.dict(os.environ, {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            response = client.get("/v1/matters")

        self.assertEqual(response.status_code, 401)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_local_dev_bypass_requires_explicit_env_pair(self) -> None:
        with patch.dict(os.environ, {"MERCY_ENV": "local", "MERCY_AUTH_MODE": "dev"}):
            client = TestClient(app)  # type: ignore[arg-type]
            response = client.get("/v1/matters")

        self.assertEqual(response.status_code, 200)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_cross_tenant_matter_access_is_forbidden(self) -> None:
        with patch.dict(os.environ, {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            create_response = client.post(
                "/v1/matter/intake",
                headers=_headers("tenant-a"),
                json={
                    "matter_id": "auth-tenant-guard-matter",
                    "client_id": "client-a",
                    "matter_name": "Tenant A Matter",
                    "jurisdiction": "District of Columbia",
                    "surface_context": "unit_test_auth",
                },
            )
            same_tenant_response = client.get(
                "/v1/matters/auth-tenant-guard-matter",
                headers=_headers("tenant-a"),
            )
            cross_tenant_response = client.get(
                "/v1/matters/auth-tenant-guard-matter",
                headers=_headers("tenant-b"),
            )

        self.assertEqual(create_response.status_code, 200)
        self.assertEqual(same_tenant_response.status_code, 200)
        self.assertEqual(cross_tenant_response.status_code, 403)
        self.assertEqual(cross_tenant_response.json()["detail"], "Matter belongs to a different tenant.")


if __name__ == "__main__":
    unittest.main()
