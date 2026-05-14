from __future__ import annotations

import os
import unittest
from unittest.mock import patch

os.environ.setdefault("MERCY_ENV", "local")
os.environ.setdefault("MERCY_AUTH_MODE", "dev")

from beta_launch import ACTIVE_USERS, current_beta_user, record_usage
from legal_task_router import moe_route
from monitoring import COST_EVENTS, cost_breakdown, monitoring_dashboard, record_cost_event

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
        "Authorization": "Bearer test-token",
        "X-Mercy-Tenant-Id": "monitoring-tenant",
        "X-Mercy-User-Id": "monitoring-user",
        "X-Mercy-Roles": roles,
    }


class MonitoringTests(unittest.TestCase):
    def setUp(self) -> None:
        COST_EVENTS.clear()
        ACTIVE_USERS.clear()

    def test_cost_event_and_breakdown_are_pii_minimized(self) -> None:
        record_cost_event(
            tenant_context={"tenant_id": "tenant-a", "user_id": "user-secret@example.com"},
            provider="openai",
            model="openai/gpt-4o-mini",
            task_type="moe_router",
            estimated_cost_usd=0.0123,
            prompt_tokens=100,
            completion_tokens=20,
        )
        breakdown = cost_breakdown(days=7)

        self.assertEqual(breakdown["total_estimated_cost_usd"], 0.0123)
        self.assertEqual(breakdown["by_tenant"][0]["key"], "tenant-a")
        self.assertNotIn("user-secret@example.com", str(breakdown))

    def test_dashboard_reports_usage_quota_and_alerts(self) -> None:
        context = {"tenant_id": "tenant-a", "user_id": "user-a"}
        current_beta_user(context)
        record_usage(context, model_tier="strong", estimated_cost_usd=0.25, guardrail_status="warn")
        record_cost_event(
            tenant_context=context,
            provider="anthropic",
            model="anthropic/claude-3-5-sonnet-20241022",
            task_type="legal_drafting",
            estimated_cost_usd=0.25,
            prompt_tokens=500,
            completion_tokens=200,
        )

        dashboard = monitoring_dashboard(days=7)

        self.assertEqual(dashboard["metrics"]["active_beta_users"], 1)
        self.assertGreaterEqual(dashboard["metrics"]["usage"]["prompt_tokens"], 500)
        self.assertGreaterEqual(dashboard["cost_breakdown"]["total_estimated_cost_usd"], 0.25)
        self.assertIn("data_minimization", dashboard)

    def test_moe_router_caps_expensive_calls_when_tenant_cost_exceeds_cap(self) -> None:
        context = {"tenant_id": "tenant-cap", "user_id": "user-cap", "auth_context": {"tenant_id": "tenant-cap", "user_id": "user-cap"}}
        record_cost_event(
            tenant_context=context["auth_context"],
            provider="openai",
            model="openai/gpt-4o",
            task_type="legal_drafting",
            estimated_cost_usd=1.25,
        )

        with patch.dict(os.environ, {"MERCY_DAILY_TENANT_COST_CAP_USD": "1.00"}):
            route = moe_route("Draft a D.C. Superior Court motion to compel.", context)

        self.assertEqual(route.cost_control["action"], "cap_to_fast_or_template")
        self.assertEqual(route.expert, "intake")

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_monitoring_endpoints_require_admin_outside_local_dev(self) -> None:
        with patch.dict(os.environ, {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            forbidden = client.get("/v1/monitoring/metrics", headers=_headers(roles="user"))
            allowed = client.get("/v1/monitoring/metrics", headers=_headers(roles="admin"))

        self.assertEqual(forbidden.status_code, 403)
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.json()["version"], "mercy-monitoring-ops-1.0")


if __name__ == "__main__":
    unittest.main()
