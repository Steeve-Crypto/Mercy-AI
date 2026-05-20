from __future__ import annotations

import json
import os
import re
import unittest
from unittest.mock import patch

os.environ.setdefault("MERCY_ENV", "local")
os.environ.setdefault("MERCY_AUTH_MODE", "dev")

try:
    from fastapi.testclient import TestClient

    from main import app

    FASTAPI_AVAILABLE = True
except ModuleNotFoundError:
    TestClient = None
    app = None
    FASTAPI_AVAILABLE = False


SECRET_LIKE_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"sk-[a-z0-9_-]{12,}",
        r"api[_-]?key",
        r"access[_-]?token",
        r"refresh[_-]?token",
        r"client[_-]?secret",
        r"password",
        r"bearer\s+[a-z0-9._-]{12,}",
        r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    )
]


@unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
class DevOpsXrayConsoleTests(unittest.TestCase):
    def _client(self) -> TestClient:
        return TestClient(app, base_url="http://127.0.0.1:8000")  # type: ignore[arg-type]

    def assert_no_known_secret_like_values(self, payload: str) -> None:
        matches = [pattern.pattern for pattern in SECRET_LIKE_PATTERNS if pattern.search(payload)]
        self.assertEqual(matches, [], f"Found known sensitive-looking values: {matches}")

    def test_console_loads_when_dev_tools_enabled(self) -> None:
        with patch.dict(os.environ, {"MERCY_DEV_TOOLS": "true", "MERCY_OTEL_ENABLED": "false"}):
            response = self._client().get("/")

        self.assertEqual(response.status_code, 200)
        html = response.text
        self.assertIn("'unsafe-inline'", response.headers["content-security-policy"])
        self.assertIn('id="devops-xray-root"', html)
        self.assertIn('id="devops-graph"', html)
        self.assertIn('class="node healthy"', html)
        self.assertIn('id="devops-node-inspector"', html)
        self.assertIn('data-testid="devops-layer-toggle"', html)
        self.assertIn('id="devops-health-summary"', html)
        self.assertIn("validateMap", html)
        self.assertIn("showMapError", html)
        self.assertIn("Mercy DevOps map request failed", html)
        self.assertIn("/devops/system-map-merged.json", html)
        self.assertIn("/devops/mercy-system-map.json", html)
        self.assertIn("renderGraph();", html)
        self.assertIn("X-Ray View", html)
        self.assertIn("Lane View", html)
        self.assertIn("Reload map", html)
        self.assertIn("Live off", html)
        self.assertIn("Last 5m", html)
        self.assertIn("tracer-particle", html)
        self.assertIn("animateMotion", html)
        self.assertIn("prefers-reduced-motion", html)
        self.assertIn("edge-wrap", html)
        self.assertIn("metric-badge", html)
        self.assertIn("selectedNeighborhood", html)
        self.assertNotIn("Trace Replay", html)
        self.assert_no_known_secret_like_values(html)

    def test_console_routes_load_when_dev_tools_enabled(self) -> None:
        with patch.dict(os.environ, {"MERCY_DEV_TOOLS": "true"}):
            client = self._client()
            root = client.get("/")
            devops = client.get("/devops")
            admin_devops = client.get("/admin/devops")

        self.assertEqual(root.status_code, 200)
        self.assertEqual(devops.status_code, 200)
        self.assertEqual(admin_devops.status_code, 200)
        self.assertIn("Mercy Backend X-Ray System Map", root.text)
        self.assertIn("Mercy Backend X-Ray System Map", devops.text)
        self.assertIn("Mercy Backend X-Ray System Map", admin_devops.text)

    def test_health_route_is_always_simple_json(self) -> None:
        with patch.dict(os.environ, {"MERCY_DEV_TOOLS": "false"}):
            response = self._client().get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")
        self.assertEqual(response.json()["service"], "mercy-backend")
        self.assertEqual(response.json()["port"], 8000)

    def test_console_is_unavailable_when_dev_tools_disabled(self) -> None:
        with patch.dict(os.environ, {"MERCY_DEV_TOOLS": "false"}):
            client = self._client()
            root = client.get("/")
            devops = client.get("/devops")
            json_response = client.get("/devops/mercy-map.json")
            direct_html = client.get("/static/dashboard/index.html")

        self.assertEqual(root.status_code, 404)
        self.assertEqual(devops.status_code, 404)
        self.assertEqual(json_response.status_code, 404)
        self.assertEqual(direct_html.status_code, 404)

    def test_declared_system_map_returns_valid_json_with_graph_data(self) -> None:
        with patch.dict(os.environ, {"MERCY_DEV_TOOLS": "true"}):
            response = self._client().get("/devops/mercy-system-map.json")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIsInstance(payload["nodes"], list)
        self.assertIsInstance(payload["edges"], list)
        self.assertIsInstance(payload["groups"], list)
        self.assertIsInstance(payload["layers"], list)
        self.assertIsInstance(payload["recentTraces"], list)
        self.assertIsInstance(payload["reliabilitySignals"], list)
        self.assertGreaterEqual(len(payload["nodes"]), 20)
        self.assertGreaterEqual(len(payload["edges"]), 20)
        self.assertGreater(len(payload["groups"]), 0)
        self.assertGreater(len(payload["layers"]), 0)
        self.assertIsInstance(payload["recentTraces"], list)
        self.assertIsInstance(payload["reliabilitySignals"], list)
        self.assertGreater(len(payload["nodes"]), 0)
        self.assertGreater(len(payload["edges"]), 0)
        node = payload["nodes"][0]
        for key in ("id", "label", "type", "group", "lane", "status", "description", "declared", "observed", "safeMetadata", "riskNotes"):
            self.assertIn(key, node)
        edge = payload["edges"][0]
        for key in ("id", "from", "to", "label", "dataClass", "allowsRawLegalText", "declared", "observed", "callCount", "avgLatencyMs", "errorRate", "lastSeen", "notes"):
            self.assertIn(key, edge)
        self.assert_no_known_secret_like_values(json.dumps(payload))

    def test_compatibility_and_merged_maps_return_valid_json(self) -> None:
        with patch.dict(os.environ, {"MERCY_DEV_TOOLS": "true"}):
            client = self._client()
            compatibility = client.get("/devops/mercy-map.json")
            merged = client.get("/devops/system-map-merged.json")
            observed = client.get("/devops/observed-system-map.json")

        self.assertEqual(compatibility.status_code, 200)
        self.assertEqual(merged.status_code, 200)
        self.assertEqual(observed.status_code, 200)
        self.assertGreater(len(merged.json()["nodes"]), 0)
        self.assertGreater(len(merged.json()["edges"]), 0)
        self.assertEqual(observed.json()["metadata"]["storage"], "not-configured")
        self.assert_no_known_secret_like_values(json.dumps(merged.json()))

    def test_devops_map_contains_required_lanes(self) -> None:
        with patch.dict(os.environ, {"MERCY_DEV_TOOLS": "true"}):
            payload = self._client().get("/devops/mercy-system-map.json").json()

        group_names = {group["label"] for group in payload["groups"]}
        expected = {
            "Product Surfaces",
            "Backend/API",
            "Auth/Security",
            "Data Layer",
            "Knowledge/RAG Infrastructure",
            "External/Runtime Services",
            "QA/CI Infrastructure",
        }
        self.assertTrue(expected.issubset(group_names))

        node_names = {node["label"] for node in payload["nodes"]}
        for required_name in (
            "Mercy Web Dashboard",
            "Word Add-in",
            "Outlook Add-in",
            "FastAPI Core on port 8000",
            "Tenant Auth Context",
            "Vector Index",
            "Full Smoke Script",
        ):
            self.assertIn(required_name, node_names)

    def test_otel_disabled_does_not_break_app(self) -> None:
        with patch.dict(os.environ, {"MERCY_DEV_TOOLS": "true", "MERCY_OTEL_ENABLED": "false"}):
            client = self._client()
            health = client.get("/health")
            merged = client.get("/devops/system-map-merged.json")

        self.assertEqual(health.status_code, 200)
        self.assertEqual(merged.status_code, 200)
        self.assertFalse(merged.json()["metadata"]["otelEnabled"])


if __name__ == "__main__":
    unittest.main()
