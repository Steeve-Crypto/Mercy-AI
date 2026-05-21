from __future__ import annotations

import os
import re
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "mercy-legal-web" / "src"
PLUGIN = ROOT / "mercy-legal-plugin"


@contextmanager
def _patched_env(env: dict[str, str]):
    from mercy_config import get_config

    with patch.dict(os.environ, env, clear=True):
        get_config.cache_clear()
        try:
            yield get_config()
        finally:
            get_config.cache_clear()


def _web_application_info(manifest: str) -> dict[str, object]:
    source = (PLUGIN / manifest).read_text(encoding="utf-8")
    block = re.search(r"<WebApplicationInfo>[\s\S]*?</WebApplicationInfo>", source)
    if not block:
        return {"id": "", "resource": "", "scopes": []}
    text = block.group(0)
    return {
        "id": re.search(r"<Id>([^<]+)</Id>", text).group(1),  # type: ignore[union-attr]
        "resource": re.search(r"<Resource>([^<]+)</Resource>", text).group(1),  # type: ignore[union-attr]
        "scopes": re.findall(r"<Scope>([^<]+)</Scope>", text),
    }


class OfficeAuthConfigurationTests(unittest.TestCase):
    def test_office_naa_config_is_independent_from_supabase_oauth_provider(self) -> None:
        source = (ROOT / "microsoft_auth.py").read_text(encoding="utf-8")

        self.assertIn("MICROSOFT_ENTRA", (ROOT / ".env.example").read_text(encoding="utf-8"))
        self.assertNotIn("MERCY_OFFICE_PKCE_PROVIDER", source)
        self.assertNotIn("MERCY_SUPABASE_AZURE_PROVIDER_ENABLED", source)

    def test_provider_azure_is_not_assumed_and_must_be_explicitly_confirmed(self) -> None:
        source = (WEB / "app" / "api" / "auth" / "office" / "start" / "route.ts").read_text(encoding="utf-8")
        env = (ROOT / ".env.example").read_text(encoding="utf-8")

        self.assertIn('|| ""', source)
        self.assertNotIn('|| "azure"', source)
        self.assertIn("Set MERCY_OFFICE_PKCE_PROVIDER", source)
        self.assertIn("MERCY_SUPABASE_AZURE_PROVIDER_ENABLED", source)
        self.assertIn("MERCY_OFFICE_PKCE_PROVIDER=", env)
        self.assertIn("NEXT_PUBLIC_MERCY_OFFICE_PKCE_PROVIDER=", env)
        self.assertIn("MERCY_SUPABASE_AZURE_PROVIDER_ENABLED=false", env)

    def test_config_readiness_flags_missing_pkce_provider_and_unconfirmed_azure(self) -> None:
        base = {
            "MERCY_ENV": "prod",
            "MERCY_AUTH_MODE": "supabase",
            "MERCY_REQUIRE_HTTPS": "true",
            "MERCY_BUSINESS_NAME": "Mercy",
            "MERCY_BUSINESS_EMAIL": "ops@example.test",
            "MERCY_DC_BAR_NUMBER": "123",
            "SUPABASE_URL": "https://mercy-test.supabase.co",
            "SUPABASE_ANON_KEY": "anon",
            "SUPABASE_JWT_SECRET": "secret",
            "SUPABASE_DB_URL": "postgresql://user:pass@example.test/db",
            "OPENAI_API_KEY": "sk-test",
            "MERCY_ENABLE_HERMES": "false",
            "MERCY_DAILY_TENANT_COST_CAP_USD": "1",
            "MERCY_OFFICE_NAA_ENABLED": "false",
            "MERCY_OFFICE_PKCE_FALLBACK_ENABLED": "true",
        }

        with _patched_env(base | {"MERCY_OFFICE_PKCE_PROVIDER": "azure"}) as config:
            self.assertIn("MERCY_SUPABASE_AZURE_PROVIDER_ENABLED=true", "\n".join(config.readiness_issues(strict=True)))
        with _patched_env(base | {"MERCY_OFFICE_PKCE_PROVIDER": "github"}) as config:
            self.assertNotIn("MERCY_OFFICE_PKCE_PROVIDER must name", "\n".join(config.readiness_issues(strict=True)))
            self.assertNotIn("MERCY_SUPABASE_AZURE_PROVIDER_ENABLED=true", "\n".join(config.readiness_issues(strict=True)))

    def test_word_and_outlook_manifest_web_application_info_match(self) -> None:
        word = _web_application_info("manifest.xml")
        outlook = _web_application_info("manifest.outlook.xml")

        self.assertEqual(word["id"], outlook["id"])
        self.assertEqual(word["resource"], outlook["resource"])
        self.assertIn("openid", word["scopes"])
        self.assertIn("profile", word["scopes"])
        self.assertIn("access_as_user", word["scopes"])
        self.assertIn("openid", outlook["scopes"])
        self.assertIn("profile", outlook["scopes"])
        self.assertIn("access_as_user", outlook["scopes"])

    def test_office_smoke_validates_manifest_against_live_entra_env_when_provided(self) -> None:
        source = (PLUGIN / "scripts" / "office-addin-smoke.mjs").read_text(encoding="utf-8")

        self.assertIn("MICROSOFT_ENTRA_CLIENT_ID", source)
        self.assertIn("MICROSOFT_ENTRA_APPLICATION_ID_URI", source)
        self.assertIn("does not match MICROSOFT_ENTRA_CLIENT_ID", source)
        self.assertIn("does not match MICROSOFT_ENTRA_APPLICATION_ID_URI", source)

    def test_supabase_postgres_and_auth_are_documented_without_azure_database_claims(self) -> None:
        env = (ROOT / ".env.example").read_text(encoding="utf-8")
        docs = (ROOT / "docs" / "product" / "office-auth-configuration.md").read_text(encoding="utf-8")

        self.assertIn("Supabase Auth / Supabase Postgres", env)
        self.assertIn("POSTGRES_URL", env)
        self.assertIn("SUPABASE_DB_URL", env)
        self.assertIn("PostgreSQL/Supabase Postgres remains the durable data source", docs)
        self.assertIn("Microsoft tenant ID", docs)
        self.assertNotIn("Azure database", docs)


if __name__ == "__main__":
    unittest.main()
