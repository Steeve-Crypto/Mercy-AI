from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from mercy_storage import reset_storage_for_tests

try:
    from fastapi.testclient import TestClient

    from main import app

    FASTAPI_AVAILABLE = True
except ModuleNotFoundError:
    TestClient = None
    app = None
    FASTAPI_AVAILABLE = False


def _headers(roles: str = "admin") -> dict[str, str]:
    return {
        "Authorization": "Bearer admin-test-token",
        "X-Mercy-Tenant-Id": "ops-tenant",
        "X-Mercy-User-Id": "ops-user",
        "X-Mercy-Roles": roles,
    }


class AdminProvisioningTests(unittest.TestCase):
    def tearDown(self) -> None:
        reset_storage_for_tests()

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed")
    def test_admin_can_create_list_and_disable_mappings(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            db_url = f"sqlite+pysqlite:///{Path(temp_dir) / 'admin-provisioning.db'}"
            with patch.dict(
                os.environ,
                {"POSTGRES_URL": db_url, "MERCY_ENV": "test", "MERCY_AUTH_MODE": "test", "MERCY_API_TOKEN": "admin-test-token"},
                clear=False,
            ):
                reset_storage_for_tests()
                client = TestClient(app)  # type: ignore[arg-type]
                create = client.post(
                    "/v1/admin/microsoft-identity-mappings",
                    headers=_headers("admin"),
                    json={
                        "microsoft_tenant_id": "entra-tenant",
                        "microsoft_object_id": "user-oid",
                        "email": "admin@example.test",
                        "mercy_user_id": "mercy-user-admin",
                        "tenant_id": "tenant-admin",
                        "firm_id": "firm-admin",
                        "roles": ["attorney", "firm_admin"],
                        "status": "active",
                        "attorney_seat_limit": 2,
                    },
                )
                listed = client.get("/v1/admin/microsoft-identity-mappings", headers=_headers("superadmin"))
                disabled = client.patch(
                    "/v1/admin/microsoft-identity-mappings/entra-tenant/user-oid/status",
                    headers=_headers("admin"),
                    json={"status": "disabled"},
                )
                reset_storage_for_tests()

        self.assertEqual(create.status_code, 200, create.text)
        self.assertEqual(create.json()["mapping"]["tenant_id"], "tenant-admin")
        self.assertEqual(create.json()["mapping"]["firm_id"], "firm-admin")
        self.assertEqual(create.json()["mapping"]["attorney_seat_limit"], 2)
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(len(listed.json()["mappings"]), 1)
        self.assertEqual(disabled.status_code, 200, disabled.text)
        self.assertEqual(disabled.json()["mapping"]["status"], "disabled")
        self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY", str(create.json()))

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed")
    def test_non_admin_cannot_provision_mappings(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            db_url = f"sqlite+pysqlite:///{Path(temp_dir) / 'admin-provisioning.db'}"
            with patch.dict(
                os.environ,
                {"POSTGRES_URL": db_url, "MERCY_ENV": "test", "MERCY_AUTH_MODE": "test", "MERCY_API_TOKEN": "admin-test-token"},
                clear=False,
            ):
                reset_storage_for_tests()
                client = TestClient(app)  # type: ignore[arg-type]
                response = client.get("/v1/admin/microsoft-identity-mappings", headers=_headers("attorney"))
                reset_storage_for_tests()

        self.assertEqual(response.status_code, 403)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed")
    def test_unauthenticated_user_cannot_provision_mappings(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            db_url = f"sqlite+pysqlite:///{Path(temp_dir) / 'admin-provisioning.db'}"
            with patch.dict(
                os.environ,
                {"POSTGRES_URL": db_url, "MERCY_ENV": "test", "MERCY_AUTH_MODE": "test", "MERCY_API_TOKEN": "admin-test-token"},
                clear=False,
            ):
                reset_storage_for_tests()
                client = TestClient(app)  # type: ignore[arg-type]
                response = client.get("/v1/admin/microsoft-identity-mappings")
                reset_storage_for_tests()

        self.assertEqual(response.status_code, 401)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed")
    def test_admin_provisioning_rejects_invalid_firm_seat_limit(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            db_url = f"sqlite+pysqlite:///{Path(temp_dir) / 'admin-provisioning.db'}"
            with patch.dict(
                os.environ,
                {"POSTGRES_URL": db_url, "MERCY_ENV": "test", "MERCY_AUTH_MODE": "test", "MERCY_API_TOKEN": "admin-test-token"},
                clear=False,
            ):
                reset_storage_for_tests()
                client = TestClient(app)  # type: ignore[arg-type]
                response = client.post(
                    "/v1/admin/microsoft-identity-mappings",
                    headers=_headers("admin"),
                    json={
                        "microsoft_tenant_id": "entra-tenant",
                        "microsoft_object_id": "user-oid",
                        "mercy_user_id": "mercy-user-admin",
                        "tenant_id": "tenant-admin",
                        "firm_id": "firm-admin",
                        "roles": ["attorney"],
                        "status": "active",
                        "attorney_seat_limit": 1,
                    },
                )
                reset_storage_for_tests()

        self.assertEqual(response.status_code, 400)
        self.assertIn("at least 2", response.json()["detail"])

    def test_admin_provisioning_page_is_wired_to_backend_client(self) -> None:
        root = Path(__file__).resolve().parents[1]
        page = root / "mercy-legal-web" / "src" / "app" / "(admin)" / "admin" / "provisioning" / "page.tsx"
        admin_pages = root / "mercy-legal-web" / "src" / "components" / "app" / "pages" / "admin-pages.tsx"
        client = root / "mercy-legal-web" / "src" / "lib" / "core-client.ts"

        self.assertTrue(page.exists())
        self.assertIn("ProvisioningAdminPage", page.read_text(encoding="utf-8"))
        admin_source = admin_pages.read_text(encoding="utf-8")
        self.assertIn("listMicrosoftIdentityMappings", admin_source)
        self.assertIn("upsertMicrosoftIdentityMapping", admin_source)
        self.assertIn("updateMicrosoftIdentityMappingStatus", admin_source)
        client_source = client.read_text(encoding="utf-8")
        self.assertIn("/v1/admin/microsoft-identity-mappings", client_source)


if __name__ == "__main__":
    unittest.main()
