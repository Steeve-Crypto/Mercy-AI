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
    from otel_observability import classify_request_source, record_dependency_observation

    FASTAPI_AVAILABLE = True
except ModuleNotFoundError:
    TestClient = None
    app = None
    classify_request_source = None
    record_dependency_observation = None
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
        self.assertIn(">Mercy System Map<", html)
        self.assertIn(">Map</button>", html)
        self.assertIn(">Lanes</button>", html)
        self.assertIn('viewMode: "map"', html)
        self.assertIn("setViewMode", html)
        self.assertIn('data-lane-group="${esc(group.id)}"', html)
        self.assertIn('state.viewMode === "lanes"', html)
        self.assertIn('state.viewMode === "map"', html)
        self.assertNotIn("X-Ray View", html)
        self.assertNotIn("Lane View", html)
        self.assertNotIn("Live off", html)
        self.assertNotIn("Live on", html)
        self.assertNotIn(">Reload map<", html)
        self.assertIn('class="control-button reload-button"', html)
        self.assertIn("Last 5m", html)
        self.assertIn("tracer-particle", html)
        self.assertIn("animateMotion", html)
        self.assertIn("prefers-reduced-motion", html)
        self.assertIn("edge-wrap", html)
        self.assertIn("metric-badge", html)
        self.assertIn("selectedNeighborhood", html)
        self.assertNotIn("Trace Replay", html)
        self.assertNotIn("radar", html.lower())
        self.assertNotIn("Backend X-Ray", html)
        self.assertNotIn("X-Ray Console", html)
        self.assertIn('const showTracer = edge.observed && edge.status === "observed";', html)
        self.assertIn("--bg: #000000", html)
        self.assertIn("--green: #00ff66", html)
        self.assertIn("--amber: #ffbf00", html)
        self.assertIn("--red: #ff2a1f", html)
        self.assertIn(".edge.observed", html)
        self.assertIn("stroke: var(--green)", html)
        self.assertIn(".edge.missing_observation", html)
        self.assertIn("stroke: var(--amber)", html)
        self.assertIn(".edge.unknown_observed_dependency", html)
        self.assertIn("stroke: var(--red)", html)
        self.assertIn(".edge.active", html)
        self.assertIn("rgba(190, 198, 192, 0.78)", html)
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
        self.assertIn("Mercy System Map", root.text)
        self.assertIn("Mercy System Map", devops.text)
        self.assertIn("Mercy System Map", admin_devops.text)
        self.assertIn(">Map</button>", root.text)
        self.assertIn(">Lanes</button>", root.text)
        self.assertNotIn("X-Ray View", root.text)
        self.assertNotIn("Lane View", root.text)

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
        self.assertIn("nodes", observed.json())
        self.assertIn("edges", observed.json())
        self.assertIn("statusSummary", observed.json())
        self.assertIn(observed.json()["metadata"]["storage"], {"disabled", "in-process-otel-buffer"})
        for edge in merged.json()["edges"]:
            self.assertIn("declared", edge)
            self.assertIn("observed", edge)
            self.assertIn("status", edge)
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

    def test_observed_map_uses_safe_otel_dependency_capture(self) -> None:
        with patch.dict(os.environ, {"MERCY_DEV_TOOLS": "true", "MERCY_OTEL_ENABLED": "true"}):
            record_dependency_observation(  # type: ignore[misc]
                path="/v1/matters",
                method="POST",
                status_code=200,
                latency_ms=12.5,
                source_node="web_dashboard",
                route_family="/v1/matters/*",
                trace_id="0123456789abcdef0123456789abcdef",
            )
            observed = self._client().get("/devops/observed-system-map.json").json()
            merged = self._client().get("/devops/system-map-merged.json").json()

        observed_edges = {edge["id"]: edge for edge in observed["edges"]}
        self.assertIn("edge_web_core", observed_edges)
        self.assertIn("edge_matters_store", observed_edges)
        self.assertTrue(observed_edges["edge_matters_store"]["observed"])
        self.assertGreaterEqual(observed_edges["edge_matters_store"]["callCount"], 1)
        self.assertFalse(observed_edges["edge_matters_store"]["allowsRawLegalText"])
        merged_edges = {edge["id"]: edge for edge in merged["edges"]}
        self.assertTrue(merged_edges["edge_matters_store"]["observed"])
        self.assertEqual(merged_edges["edge_matters_store"]["status"], "observed")
        self.assert_no_known_secret_like_values(json.dumps(observed))

    def test_route_traffic_populates_observed_system_map(self) -> None:
        with patch.dict(os.environ, {"MERCY_DEV_TOOLS": "true", "MERCY_OTEL_ENABLED": "true"}):
            client = self._client()
            health = client.get("/health")
            observed = client.get("/devops/observed-system-map.json").json()
            merged = client.get("/devops/system-map-merged.json").json()

        self.assertEqual(health.status_code, 200)
        observed_node_ids = {node["id"] for node in observed["nodes"]}
        observed_edges = {edge["id"]: edge for edge in observed["edges"]}
        self.assertIn("fastapi_core", observed_node_ids)
        self.assertIn("health_route", observed_node_ids)
        self.assertIn("edge_core_health", observed_edges)
        self.assertTrue(observed_edges["edge_core_health"]["observed"])
        self.assertGreaterEqual(observed_edges["edge_core_health"]["callCount"], 1)
        self.assertIsNotNone(observed_edges["edge_core_health"]["avgLatencyMs"])
        self.assertIsNotNone(observed_edges["edge_core_health"]["lastSeen"])
        self.assertGreaterEqual(len(observed["recentSpans"]), 1)

        merged_nodes = {node["id"]: node for node in merged["nodes"]}
        merged_edges = {edge["id"]: edge for edge in merged["edges"]}
        self.assertTrue(merged_nodes["fastapi_core"]["observed"])
        self.assertTrue(merged_nodes["health_route"]["observed"])
        self.assertTrue(merged_edges["edge_core_health"]["observed"])
        self.assertEqual(merged_edges["edge_core_health"]["status"], "observed")
        self.assert_no_known_secret_like_values(json.dumps(observed))

    def test_observed_source_classification_is_truthful(self) -> None:
        self.assertEqual(classify_request_source("/devops/system-map-merged.json", {"user-agent": "Mozilla/5.0"}), "devops_console")  # type: ignore[misc]
        self.assertEqual(classify_request_source("/health", {"user-agent": "PowerShell/7.4"}), "manual_client")  # type: ignore[misc]
        self.assertEqual(classify_request_source("/health", {"user-agent": "curl/8.0"}), "manual_client")  # type: ignore[misc]
        self.assertEqual(classify_request_source("/health", {"user-agent": "Mozilla/5.0"}), "external_client")  # type: ignore[misc]
        self.assertEqual(classify_request_source("/v1/matters", {"origin": "http://127.0.0.1:3100", "user-agent": "Mozilla/5.0"}), "web_dashboard")  # type: ignore[misc]
        self.assertEqual(classify_request_source("/v1/agent", {"x-mercy-surface": "word-addin", "user-agent": "Office Word"}), "word_addin")  # type: ignore[misc]
        self.assertEqual(classify_request_source("/v1/agent", {"x-mercy-surface": "outlook-addin", "user-agent": "Office Outlook"}), "outlook_addin")  # type: ignore[misc]

    def test_manual_and_devops_observed_edges_are_not_fake_web_traffic(self) -> None:
        with patch.dict(os.environ, {"MERCY_DEV_TOOLS": "true", "MERCY_OTEL_ENABLED": "true"}):
            record_dependency_observation(  # type: ignore[misc]
                path="/health",
                method="GET",
                status_code=200,
                latency_ms=8.0,
                source_node="manual_client",
                route_family="/health",
                trace_id="abcdef0123456789abcdef0123456789",
            )
            record_dependency_observation(  # type: ignore[misc]
                path="/devops/system-map-merged.json",
                method="GET",
                status_code=200,
                latency_ms=6.0,
                source_node="devops_console",
                route_family="/devops/*",
                trace_id="fedcba9876543210fedcba9876543210",
            )
            observed = self._client().get("/devops/observed-system-map.json").json()

        edges = {edge["id"]: edge for edge in observed["edges"]}
        self.assertIn("edge_manual_core", edges)
        self.assertIn("edge_console_map", edges)
        self.assertNotEqual(edges["edge_manual_core"]["from"], "web_dashboard")
        for key in ("callCount", "avgLatencyMs", "errorRate", "lastSeen"):
            self.assertIn(key, edges["edge_manual_core"])
            self.assertIsNotNone(edges["edge_manual_core"][key])
        self.assertEqual(edges["edge_manual_core"]["status"], "unknown_observed_dependency")
        self.assert_no_known_secret_like_values(json.dumps(observed))


if __name__ == "__main__":
    unittest.main()
