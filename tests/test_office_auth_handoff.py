from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "mercy-legal-web" / "src"
PLUGIN = ROOT / "mercy-legal-plugin" / "src"


class OfficeAuthHandoffTests(unittest.TestCase):
    def test_office_fallback_start_route_builds_supabase_pkce_redirect(self) -> None:
        source = (WEB / "app" / "api" / "auth" / "office" / "start" / "route.ts").read_text(encoding="utf-8")

        self.assertIn("/auth/v1/authorize", source)
        self.assertIn("code_challenge", source)
        self.assertIn("code_challenge_method", source)
        self.assertIn("S256", source)
        self.assertIn("mercy-office-pkce", source)
        self.assertIn("mercy-office-state", source)
        self.assertIn("MERCY_OFFICE_PKCE_PROVIDER", source)

    def test_office_fallback_callback_exchanges_code_and_messages_office_parent(self) -> None:
        source = (WEB / "app" / "api" / "auth" / "office" / "callback" / "route.ts").read_text(encoding="utf-8")

        self.assertIn("/auth/v1/token?grant_type=pkce", source)
        self.assertIn("auth_code", source)
        self.assertIn("code_verifier", source)
        self.assertIn("Office.context.ui.messageParent", source)
        self.assertIn("access_token", source)
        self.assertIn("Office sign-in could not be verified.", source)

    def test_word_and_outlook_addin_use_office_dialog_returned_token(self) -> None:
        app_source = (PLUGIN / "App.tsx").read_text(encoding="utf-8")
        api_source = (PLUGIN / "services" / "api.ts").read_text(encoding="utf-8")

        self.assertIn("api.beginOfficeHybridSignIn(surface)", app_source)
        self.assertIn('surface: "Word" | "Outlook" | "Office"', api_source)
        self.assertIn("Office.context.ui.displayDialogAsync", api_source)
        self.assertIn("persistOfficeSessionToken(message.access_token)", api_source)

    def test_office_tries_naa_first_and_falls_back_to_pkce(self) -> None:
        app_source = (PLUGIN / "App.tsx").read_text(encoding="utf-8")
        api_source = (PLUGIN / "services" / "api.ts").read_text(encoding="utf-8")

        self.assertIn("api.beginOfficeNaaSignIn(surface, { allowSignInPrompt: false })", app_source)
        self.assertIn("OfficeRuntime", api_source)
        self.assertIn("exchangeMicrosoftBootstrapToken", api_source)
        self.assertIn('persistOfficeSessionToken(mercyToken, "office-naa")', api_source)
        self.assertIn("return beginOfficePkceSignIn(surface)", api_source)
        self.assertIn("fallback-available", app_source)

    def test_office_production_client_does_not_spoof_tenant_user_headers_or_auth_context(self) -> None:
        source = (PLUGIN / "services" / "api.ts").read_text(encoding="utf-8")

        production_branch = source[source.find("function authHeaders"): source.find("function isOnline")]
        self.assertIn("if (!localDevAuthDefaultsEnabled())", production_branch)
        self.assertIn("Authorization", production_branch)
        self.assertLess(production_branch.find("if (!localDevAuthDefaultsEnabled())"), production_branch.find('"X-Mercy-Tenant-Id"'))
        self.assertNotIn("auth_context: authContext()", source)

    def test_missing_token_has_sign_in_required_state(self) -> None:
        app_source = (PLUGIN / "App.tsx").read_text(encoding="utf-8")
        api_source = (PLUGIN / "services" / "api.ts").read_text(encoding="utf-8")

        self.assertIn('"sign-in-required"', api_source)
        self.assertIn("Sign in required", app_source)
        self.assertIn("Tenant access is verified by the Mercy core.", app_source)


if __name__ == "__main__":
    unittest.main()
