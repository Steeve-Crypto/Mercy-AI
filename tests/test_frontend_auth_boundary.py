from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FrontendAuthBoundaryTests(unittest.TestCase):
    def test_browser_core_client_uses_proxy_without_production_localstorage_bearer(self) -> None:
        source = (ROOT / "mercy-legal-web" / "src" / "lib" / "core-client.ts").read_text(encoding="utf-8")

        self.assertIn("return `/api/core${path}`;", source)
        self.assertIn("if (!localDevDefaults) {\n    return {};\n  }", source)
        unsafe_order = source.find('window.localStorage.getItem("mercy.auth.token")')
        guard_order = source.find("if (!localDevDefaults)")
        self.assertGreater(unsafe_order, guard_order)

    def test_next_core_proxy_uses_server_session_token(self) -> None:
        source = (ROOT / "mercy-legal-web" / "src" / "app" / "api" / "core" / "[...path]" / "route.ts").read_text(encoding="utf-8")

        self.assertIn("getServerMercyAuthContext", source)
        self.assertIn('headers.set("Authorization", `Bearer ${auth.token}`)', source)
        self.assertIn("Mercy session is required.", source)

    def test_supabase_session_provider_does_not_persist_access_token_outside_local_dev(self) -> None:
        source = (ROOT / "mercy-legal-web" / "src" / "components" / "auth" / "session-provider.tsx").read_text(encoding="utf-8")

        self.assertIn("persistMercyContext(nextSession, false)", source)
        self.assertIn("persistMercyContext(LOCAL_DEV_SESSION, true)", source)


if __name__ == "__main__":
    unittest.main()
