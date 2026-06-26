from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from mercy_config import get_config
from mercy_storage import reset_storage_for_tests
from scripts.microsoft_identity_db import MICROSOFT_IDENTITY_MIGRATION_SQL, REQUIRED_CONSTRAINTS, production_readiness_issues


ROOT = Path(__file__).resolve().parents[1]


class MicrosoftIdentityDbReadinessTests(unittest.TestCase):
    def tearDown(self) -> None:
        reset_storage_for_tests()

    def test_readiness_detects_missing_identity_mapping_table(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            db_url = f"sqlite+pysqlite:///{Path(temp_dir) / 'missing-table.db'}"
            env = {
                "MERCY_ENV": "production",
                "MERCY_AUTH_MODE": "supabase",
                "MERCY_REQUIRE_HTTPS": "true",
                "MERCY_BUSINESS_NAME": "Mercy",
                "MERCY_BUSINESS_EMAIL": "ops@example.test",
                "MERCY_DC_BAR_NUMBER": "123",
                "SUPABASE_URL": "https://mercy-test.supabase.co",
                "SUPABASE_ANON_KEY": "anon",
                "SUPABASE_JWT_SECRET": "secret",
                "POSTGRES_URL": db_url,
                "OPENAI_API_KEY": "sk-test",
                "MERCY_ENABLE_HERMES": "false",
                "MERCY_DAILY_TENANT_COST_CAP_USD": "1",
                "MERCY_OFFICE_NAA_ENABLED": "false",
                "MERCY_OFFICE_PKCE_FALLBACK_ENABLED": "false",
            }
            with patch.dict(os.environ, env, clear=True):
                get_config.cache_clear()
                reset_storage_for_tests()
                issues = production_readiness_issues()
                reset_storage_for_tests()

        self.assertIn("Required table microsoft_identity_mappings is missing.", issues)

    def test_production_readiness_rejects_json_dev_tools_and_unsafe_auth_modes(self) -> None:
        env = {
            "MERCY_ENV": "production",
            "MERCY_AUTH_MODE": "dev",
            "MERCY_DEV_TOOLS": "true",
            "MERCY_ALLOW_DEV_MICROSOFT_IDENTITY_MAP_JSON": "true",
            "MERCY_MICROSOFT_IDENTITY_MAP_JSON": '{"users":[]}',
        }
        with patch.dict(os.environ, env, clear=True):
            get_config.cache_clear()
            reset_storage_for_tests()
            issues = "\n".join(production_readiness_issues(check_database=False))

        self.assertIn("MERCY_AUTH_MODE", issues)
        self.assertIn("MERCY_DEV_TOOLS", issues)
        self.assertIn("MERCY_MICROSOFT_IDENTITY_MAP_JSON", issues)
        self.assertIn("MERCY_ALLOW_DEV_MICROSOFT_IDENTITY_MAP_JSON", issues)

    def test_migration_sql_declares_supabase_safe_rls_and_constraints(self) -> None:
        sql = MICROSOFT_IDENTITY_MIGRATION_SQL

        self.assertIn("ALTER TABLE microsoft_identity_mappings ENABLE ROW LEVEL SECURITY", sql)
        self.assertIn("REVOKE ALL ON TABLE microsoft_identity_mappings FROM anon", sql)
        self.assertIn("REVOKE ALL ON TABLE microsoft_identity_mappings FROM authenticated", sql)
        self.assertNotIn("DROP TABLE", sql.upper())
        self.assertNotIn("Base.metadata.create_all", sql)
        for constraint in REQUIRED_CONSTRAINTS:
            self.assertIn(constraint, sql)
        self.assertIn("tenant_id IS NOT NULL", sql)
        self.assertIn("account_type = 'firm' AND attorney_seat_limit >= 2", sql)
        self.assertIn("last_login_at timestamptz", sql)

    def test_production_storage_init_does_not_auto_create_postgres_schema(self) -> None:
        source = (ROOT / "mercy_storage.py").read_text(encoding="utf-8")

        self.assertIn("Persistent storage schema is not auto-created in production", source)
        self.assertIn("MERCY_AUTO_INIT_STORAGE_SCHEMA", (ROOT / ".env.example").read_text(encoding="utf-8"))
        self.assertIn("scripts\\\\microsoft_identity_db.py apply", source)

    def test_cli_fallback_create_list_suspend_still_works(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            db_url = f"sqlite+pysqlite:///{(Path(temp_dir) / 'cli-provisioning.db').as_posix()}"
            env = os.environ.copy()
            env.update({"POSTGRES_URL": db_url, "MERCY_ENV": "test", "MERCY_AUTH_MODE": "test"})
            commands = [
                [
                    sys.executable,
                    "scripts/provision_microsoft_identity.py",
                    "create",
                    "--microsoft-tenant-id",
                    "tenant-cli",
                    "--microsoft-object-id",
                    "oid-cli",
                    "--email",
                    "cli@example.test",
                    "--mercy-user-id",
                    "mercy-cli",
                    "--tenant-id",
                    "tenant-cli",
                    "--roles",
                    "attorney",
                    "--status",
                    "active",
                ],
                [sys.executable, "scripts/provision_microsoft_identity.py", "list", "--json"],
                [
                    sys.executable,
                    "scripts/provision_microsoft_identity.py",
                    "disable",
                    "--microsoft-tenant-id",
                    "tenant-cli",
                    "--microsoft-object-id",
                    "oid-cli",
                ],
            ]
            results = [subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True, timeout=60) for command in commands]

        for result in results:
            self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('"tenant_id": "tenant-cli"', results[0].stdout)
        self.assertIn('"status": "suspended"', results[2].stdout)

    def test_canonical_verify_serializes_conflicting_office_validation_steps(self) -> None:
        source = (ROOT / "scripts" / "verify.py").read_text(encoding="utf-8")
        build = source.find('"Office add-in build"')
        manifest = source.find('"Office manifest validation"')
        smoke = source.find('"Office static smoke"')

        self.assertGreaterEqual(build, 0)
        self.assertGreater(manifest, build)
        self.assertGreater(smoke, manifest)
        self.assertNotIn("ThreadPoolExecutor", source)
        self.assertIn('[npm_command, "run", "build"]', source)
        self.assertIn('[npm_command, "run", "smoke:office"]', source)

    def test_canonical_verify_forces_local_database_environment(self) -> None:
        source = (ROOT / "scripts" / "verify.py").read_text(encoding="utf-8")

        self.assertIn("def _local_verification_env", source)
        self.assertIn('"MERCY_ENV": "local"', source)
        self.assertIn('"MERCY_AUTH_MODE": "dev"', source)
        self.assertIn('"POSTGRES_URL": ""', source)
        self.assertIn('"SUPABASE_DB_URL": ""', source)
        self.assertIn("inherited Postgres/Supabase DB URLs are cleared", source)


if __name__ == "__main__":
    unittest.main()
