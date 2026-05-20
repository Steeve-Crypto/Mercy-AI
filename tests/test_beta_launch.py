from __future__ import annotations

import os
import unittest
from unittest.mock import patch

os.environ.setdefault("MERCY_ENV", "local")

from beta_launch import (
    ACTIVE_USERS,
    FEEDBACK,
    INVITES,
    WAITLIST,
    accept_invite,
    beta_analytics,
    beta_status,
    check_quota,
    create_invite,
    join_waitlist,
    legal_document,
    record_feedback,
    record_usage,
)

try:
    from fastapi.testclient import TestClient

    from main import app

    FASTAPI_AVAILABLE = True
except ModuleNotFoundError:
    TestClient = None
    app = None
    FASTAPI_AVAILABLE = False


def _headers(tenant_id: str = "tenant-beta", user_id: str = "user-beta") -> dict[str, str]:
    return {
        "Authorization": "Bearer test-token",
        "X-Mercy-Tenant-Id": tenant_id,
        "X-Mercy-User-Id": user_id,
    }


class BetaLaunchTests(unittest.TestCase):
    def setUp(self) -> None:
        ACTIVE_USERS.clear()
        WAITLIST.clear()
        INVITES.clear()
        FEEDBACK.clear()

    def test_beta_status_reports_quota_and_docs(self) -> None:
        status = beta_status({"tenant_id": "tenant-a", "user_id": "user-a"})

        self.assertTrue(status["beta_mode"])
        self.assertEqual(status["quota"]["strong_model_monthly_limit"], 300)
        self.assertEqual(status["quota"]["fast_model_limit"], "unlimited")
        self.assertIn("/v1/beta/legal/dpa", status["legal_docs"]["dpa"])
        self.assertGreaterEqual(len(status["welcome_sequence"]), 3)

    def test_waitlist_invite_and_accept_flow(self) -> None:
        tenant = {"tenant_id": "tenant-a", "user_id": "user-a"}
        waitlist = join_waitlist(tenant, "lawyer@example.com", "family")
        invite = create_invite("lawyer@example.com", tenant)
        accepted = accept_invite(tenant, invite["invite_code"], "lawyer@example.com")

        self.assertEqual(waitlist["status"], "waitlisted")
        self.assertEqual(invite["status"], "created")
        self.assertEqual(accepted["status"], "active")
        self.assertEqual(beta_status(tenant)["access"], "active")

    def test_quota_blocks_after_strong_limit(self) -> None:
        tenant = {"tenant_id": "tenant-a", "user_id": "user-a"}
        with patch.dict(os.environ, {"MERCY_BETA_STRONG_MONTHLY_QUOTA": "1"}):
            check_quota(tenant, "strong")
            record_usage(tenant, model_tier="strong", estimated_cost_usd=0.02)
            with self.assertRaises(RuntimeError):
                check_quota(tenant, "strong")
            check_quota(tenant, "fast")

    def test_feedback_and_analytics(self) -> None:
        tenant = {"tenant_id": "tenant-a", "user_id": "user-a"}
        record_usage(tenant, model_tier="strong", estimated_cost_usd=0.03, template_id="dc-motion-compel", guardrail_status="warn")
        feedback = record_feedback(
            tenant,
            {
                "rating": "up",
                "comment": "Useful, citation needed.",
                "action": "template_generation",
                "template_id": "dc-motion-compel",
                "guardrail_status": "warn",
            },
        )
        analytics = beta_analytics()

        self.assertEqual(feedback["status"], "received")
        self.assertEqual(analytics["feedback"]["thumbs_up"], 1)
        self.assertGreaterEqual(analytics["estimated_cost_usd"], 0.03)
        self.assertIn("warn", analytics["guardrail_triggers"])

    def test_legal_documents_include_dc_responsibility_language(self) -> None:
        dpa = legal_document("dpa")
        terms = legal_document("terms")

        self.assertIn("Data Processing Addendum", dpa)
        self.assertIn("D.C. Rules of Professional Conduct", terms)
        self.assertIn("attorney", terms.lower())
        self.assertIn("not used for model training", dpa)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_beta_endpoints(self) -> None:
        with patch.dict(os.environ, {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "token", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            status = client.get("/v1/beta/status", headers=_headers())
            waitlist = client.post("/v1/beta/waitlist", headers=_headers(), json={"email": "beta@example.com"})
            feedback = client.post("/v1/beta/feedback", headers=_headers(), json={"rating": "down", "action": "test"})
            doc = client.get("/v1/beta/legal/terms", headers=_headers())
            analytics = client.get("/v1/beta/analytics", headers=_headers())

        self.assertEqual(status.status_code, 200)
        self.assertEqual(waitlist.status_code, 200)
        self.assertEqual(feedback.status_code, 200)
        self.assertEqual(doc.status_code, 200)
        self.assertEqual(analytics.status_code, 200)


if __name__ == "__main__":
    unittest.main()
