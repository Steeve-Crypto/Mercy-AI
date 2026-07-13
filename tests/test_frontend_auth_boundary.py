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
        self.assertIn('headers.set("X-Mercy-Firm-Id", auth.firmId)', source)
        self.assertIn("Mercy session is required.", source)

    def test_supabase_session_provider_does_not_persist_access_token_outside_local_dev(self) -> None:
        source = (ROOT / "mercy-legal-web" / "src" / "components" / "auth" / "session-provider.tsx").read_text(encoding="utf-8")

        self.assertIn("persistMercyContext(nextSession, false)", source)
        self.assertIn("persistMercyContext(LOCAL_DEV_SESSION, true)", source)

    def test_web_session_preserves_firm_and_tenant_context(self) -> None:
        source = (ROOT / "mercy-legal-web" / "src" / "lib" / "auth" / "session.ts").read_text(encoding="utf-8")

        self.assertIn("firmId: string | null", source)
        self.assertIn("trustedAccountClaims(user)", source)
        self.assertIn("firmId: claims.firmId", source)
        self.assertNotIn("user.user_metadata?.tenant_id", source)
        self.assertNotIn("user.user_metadata?.firm_id", source)

    def test_web_authorization_uses_one_server_owned_claim_parser(self) -> None:
        trusted_claims = (ROOT / "mercy-legal-web" / "src" / "lib" / "auth" / "trusted-claims.ts").read_text(encoding="utf-8")
        middleware = (ROOT / "mercy-legal-web" / "src" / "middleware.ts").read_text(encoding="utf-8")
        provider = (ROOT / "mercy-legal-web" / "src" / "components" / "auth" / "session-provider.tsx").read_text(encoding="utf-8")

        self.assertIn("authorization claims only from Supabase app_metadata", trusted_claims)
        self.assertNotIn("user_metadata", trusted_claims.split("export function trustedAccountClaims", 1)[1])
        self.assertIn("hasTrustedWorkspaceAccess(user)", middleware)
        self.assertIn("trustedAccountClaims(user)", provider)
        self.assertIn("supabase.auth.getUser", provider)
        self.assertNotIn("supabase.auth.getSession", provider)
        self.assertNotIn("user.user_metadata?.roles", provider)

    def test_billing_portal_uses_only_authenticated_server_owned_customer(self) -> None:
        route = (ROOT / "mercy-legal-web" / "src" / "app" / "api" / "billing" / "portal" / "route.ts").read_text(encoding="utf-8")

        self.assertIn("getServerMercySessionUser", route)
        self.assertIn("sessionUser.stripeCustomerId", route)
        self.assertNotIn("request.json", route)
        self.assertNotIn("customerId ||", route)

    def test_self_service_profile_cannot_submit_authorization_role(self) -> None:
        settings = (ROOT / "mercy-legal-web" / "src" / "components" / "app" / "pages" / "settings-account-page.tsx").read_text(encoding="utf-8")
        core_client = (ROOT / "mercy-legal-web" / "src" / "lib" / "core-client.ts").read_text(encoding="utf-8")

        self.assertNotIn("role: profile.role", settings)
        self.assertIn("Managed by Mercy workspace provisioning.", settings)
        self.assertIn('Omit<Partial<CoreUserProfile>, "user_id" | "tenant_id" | "role">', core_client)

    def test_paid_signup_activation_refreshes_session_after_verified_stripe_session(self) -> None:
        route = (ROOT / "mercy-legal-web" / "src" / "app" / "api" / "signup" / "activation" / "route.ts").read_text(encoding="utf-8")
        success_client = (ROOT / "mercy-legal-web" / "src" / "components" / "auth" / "signup-success-client.tsx").read_text(encoding="utf-8")
        provisioning = (ROOT / "mercy-legal-web" / "src" / "lib" / "signup" / "provisioning.ts").read_text(encoding="utf-8")
        webhook = (ROOT / "mercy-legal-web" / "src" / "app" / "api" / "stripe" / "webhook" / "route.ts").read_text(encoding="utf-8")

        self.assertIn('stripe.checkout.sessions.retrieve(checkoutSessionId!, { expand: ["subscription"] })', route)
        self.assertIn("stripeSessionUserId(session) !== user.id", route)
        self.assertIn("provisionPaidSignup(session)", route)
        self.assertIn("supabase?.auth.refreshSession()", success_client)
        self.assertIn("account_status: subscriptionStatus", provisioning)
        self.assertIn("workspace_active: workspaceActive", provisioning)
        self.assertIn('result.mode === "storage_error" || result.mode === "auth_error"', webhook)


if __name__ == "__main__":
    unittest.main()
