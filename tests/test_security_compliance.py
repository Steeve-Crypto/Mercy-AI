from __future__ import annotations

import os
import unittest
from unittest.mock import patch

os.environ.setdefault("MERCY_ENV", "local")
os.environ.setdefault("MERCY_AUTH_MODE", "dev")

from scripts.check_security_compliance import build_report
from security_controls import sanitize_payload, sanitize_text, security_headers

try:
    from fastapi.testclient import TestClient

    from main import app

    FASTAPI_AVAILABLE = True
except ModuleNotFoundError:
    TestClient = None
    app = None
    FASTAPI_AVAILABLE = False


def _headers(tenant_id: str = "security-tenant", user_id: str = "security-user") -> dict[str, str]:
    return {
        "Authorization": "Bearer test-token",
        "X-Mercy-Tenant-Id": tenant_id,
        "X-Mercy-User-Id": user_id,
    }


class SecurityComplianceTests(unittest.TestCase):
    def test_sanitize_text_redacts_common_pii(self) -> None:
        sanitized = sanitize_text("Call Jane at jane@example.com or 202-555-0199. SSN 123-45-6789.")

        self.assertIn("[REDACTED_EMAIL]", sanitized)
        self.assertIn("[REDACTED_PHONE]", sanitized)
        self.assertIn("[REDACTED_SSN]", sanitized)
        self.assertNotIn("jane@example.com", sanitized)

    def test_sanitize_payload_redacts_secrets(self) -> None:
        payload = sanitize_payload({"token": "abc", "client": {"email": "client@example.com"}})

        self.assertEqual(payload["token"], "[REDACTED_SECRET]")
        self.assertEqual(payload["client"]["email"], "[REDACTED_EMAIL]")

    def test_security_headers_include_csp_and_hsts(self) -> None:
        headers = security_headers()

        self.assertIn("Content-Security-Policy", headers)
        self.assertIn("Strict-Transport-Security", headers)

    def test_compliance_cli_report_passes_required_docs(self) -> None:
        report = build_report()

        self.assertEqual(report["status"], "pass")
        self.assertTrue(all(item["exists"] for item in report["required_docs"]))

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_security_compliance_endpoint_and_headers(self) -> None:
        with patch.dict(os.environ, {"MERCY_ENV": "local", "MERCY_AUTH_MODE": "dev"}):
            client = TestClient(app)  # type: ignore[arg-type]
            response = client.get("/v1/security/compliance", headers=_headers())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["tenant_isolation"]["status"], "active")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_delete_all_my_data_soft_deletes_matters(self) -> None:
        with patch.dict(os.environ, {"MERCY_ENV": "local", "MERCY_AUTH_MODE": "dev"}):
            client = TestClient(app)  # type: ignore[arg-type]
            created = client.post("/v1/matters", headers=_headers("delete-tenant"), json={"name": "Delete Me"})
            deleted = client.delete("/v1/account/data", headers=_headers("delete-tenant"))
            listed = client.get("/v1/matters", headers=_headers("delete-tenant"))

        self.assertEqual(created.status_code, 200)
        self.assertEqual(deleted.status_code, 200)
        self.assertTrue(deleted.json()["deleted"])
        self.assertEqual(listed.status_code, 200)
        self.assertFalse(any(item["matter_id"] == created.json()["matter_id"] for item in listed.json()))


if __name__ == "__main__":
    unittest.main()
