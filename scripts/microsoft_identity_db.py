from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from mercy_config import get_config  # noqa: E402
from mercy_storage import SQLALCHEMY_AVAILABLE, configured_database_url, get_engine  # noqa: E402


MICROSOFT_IDENTITY_MIGRATION_SQL = """
CREATE TABLE IF NOT EXISTS microsoft_identity_mappings (
    id text PRIMARY KEY,
    microsoft_tenant_id text NOT NULL,
    microsoft_object_id text NOT NULL,
    email text,
    email_domain text,
    mercy_user_id text NOT NULL,
    firm_id text,
    tenant_id text NOT NULL,
    account_type text NOT NULL DEFAULT 'solo',
    attorney_seat_limit integer NOT NULL DEFAULT 1,
    effective_scope_type text NOT NULL,
    effective_scope_id text NOT NULL,
    roles jsonb NOT NULL DEFAULT '[]'::jsonb,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    last_login_at timestamptz
);

ALTER TABLE microsoft_identity_mappings ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE microsoft_identity_mappings ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'solo';
ALTER TABLE microsoft_identity_mappings ADD COLUMN IF NOT EXISTS attorney_seat_limit integer NOT NULL DEFAULT 1;
ALTER TABLE microsoft_identity_mappings ADD COLUMN IF NOT EXISTS email_domain text;
ALTER TABLE microsoft_identity_mappings ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS ux_microsoft_identity_mappings_tid_oid
    ON microsoft_identity_mappings (microsoft_tenant_id, microsoft_object_id);
CREATE INDEX IF NOT EXISTS ix_microsoft_identity_mappings_mercy_user_id
    ON microsoft_identity_mappings (mercy_user_id);
CREATE INDEX IF NOT EXISTS ix_microsoft_identity_mappings_tenant_id
    ON microsoft_identity_mappings (tenant_id);
CREATE INDEX IF NOT EXISTS ix_microsoft_identity_mappings_firm_id
    ON microsoft_identity_mappings (firm_id);
CREATE INDEX IF NOT EXISTS ix_microsoft_identity_mappings_status
    ON microsoft_identity_mappings (status);

ALTER TABLE microsoft_identity_mappings ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE microsoft_identity_mappings IS
    'Backend-only Mercy Microsoft identity provisioning map. Supabase browser roles must not read or write this table.';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE microsoft_identity_mappings FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE microsoft_identity_mappings FROM authenticated;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_microsoft_identity_status'
    ) THEN
        ALTER TABLE microsoft_identity_mappings
        ADD CONSTRAINT ck_microsoft_identity_status CHECK (status IN ('active', 'disabled', 'pending'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_microsoft_identity_account_type'
    ) THEN
        ALTER TABLE microsoft_identity_mappings
        ADD CONSTRAINT ck_microsoft_identity_account_type CHECK (account_type IN ('firm', 'solo'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_microsoft_identity_tenant_required'
    ) THEN
        ALTER TABLE microsoft_identity_mappings
        ADD CONSTRAINT ck_microsoft_identity_tenant_required CHECK (tenant_id IS NOT NULL AND length(tenant_id) > 0);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_microsoft_identity_firm_scope'
    ) THEN
        ALTER TABLE microsoft_identity_mappings
        ADD CONSTRAINT ck_microsoft_identity_firm_scope CHECK (
            (account_type = 'solo' AND firm_id IS NULL)
            OR (account_type = 'firm' AND firm_id IS NOT NULL AND length(firm_id) > 0)
        );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_microsoft_identity_seat_limit'
    ) THEN
        ALTER TABLE microsoft_identity_mappings
        ADD CONSTRAINT ck_microsoft_identity_seat_limit CHECK (
            (account_type = 'solo' AND attorney_seat_limit >= 1)
            OR (account_type = 'firm' AND attorney_seat_limit >= 2)
        );
    END IF;
END $$;
"""


REQUIRED_COLUMNS = {
    "id",
    "microsoft_tenant_id",
    "microsoft_object_id",
    "email",
    "email_domain",
    "mercy_user_id",
    "firm_id",
    "tenant_id",
    "account_type",
    "attorney_seat_limit",
    "effective_scope_type",
    "effective_scope_id",
    "roles",
    "status",
    "created_at",
    "updated_at",
    "last_login_at",
}

REQUIRED_CONSTRAINTS = {
    "ck_microsoft_identity_status",
    "ck_microsoft_identity_account_type",
    "ck_microsoft_identity_tenant_required",
    "ck_microsoft_identity_firm_scope",
    "ck_microsoft_identity_seat_limit",
}


def production_readiness_issues(*, check_database: bool = True) -> list[str]:
    config = get_config()
    issues = config.readiness_issues(strict=True)
    production_like = not config.is_local

    if production_like and config.mercy_auth_mode in {"dev", "test", "token"}:
        issues.append("Production readiness rejects MERCY_AUTH_MODE dev/test/token.")
    if production_like and config.mercy_dev_tools:
        issues.append("Production readiness rejects MERCY_DEV_TOOLS=true.")
    if production_like and config.microsoft_identity_map_json:
        issues.append("Production readiness rejects MERCY_MICROSOFT_IDENTITY_MAP_JSON.")
    if production_like and config.allow_dev_microsoft_identity_map_json:
        issues.append("Production readiness rejects MERCY_ALLOW_DEV_MICROSOFT_IDENTITY_MAP_JSON=true.")
    if production_like and not configured_database_url():
        issues.append("Production readiness requires POSTGRES_URL or SUPABASE_DB_URL.")

    if check_database and configured_database_url():
        if not SQLALCHEMY_AVAILABLE:
            issues.append("SQLAlchemy is required to inspect production database readiness.")
        else:
            try:
                from sqlalchemy import inspect

                engine = get_engine()
                inspector = inspect(engine)
                if not inspector.has_table("microsoft_identity_mappings"):
                    issues.append("Required table microsoft_identity_mappings is missing.")
                else:
                    columns = {column["name"] for column in inspector.get_columns("microsoft_identity_mappings")}
                    missing = sorted(REQUIRED_COLUMNS - columns)
                    if missing:
                        issues.append(f"microsoft_identity_mappings is missing columns: {', '.join(missing)}.")
                    indexes = inspector.get_indexes("microsoft_identity_mappings")
                    unique_tid_oid = any(
                        index.get("unique")
                        and set(index.get("column_names") or []) == {"microsoft_tenant_id", "microsoft_object_id"}
                        for index in indexes
                    )
                    if not unique_tid_oid:
                        issues.append("microsoft_identity_mappings is missing unique index on microsoft_tenant_id + microsoft_object_id.")
                    if engine.dialect.name == "postgresql":
                        with engine.connect() as connection:
                            constraint_rows = connection.exec_driver_sql(
                                """
                                SELECT conname
                                FROM pg_constraint
                                WHERE conrelid = 'public.microsoft_identity_mappings'::regclass
                                """
                            ).fetchall()
                            constraints = {row[0] for row in constraint_rows}
                            missing_constraints = sorted(REQUIRED_CONSTRAINTS - constraints)
                            if missing_constraints:
                                issues.append(
                                    "microsoft_identity_mappings is missing constraints: "
                                    + ", ".join(missing_constraints)
                                    + "."
                                )
                            rls_row = connection.exec_driver_sql(
                                """
                                SELECT relrowsecurity
                                FROM pg_class
                                WHERE oid = 'public.microsoft_identity_mappings'::regclass
                                """
                            ).fetchone()
                            if not rls_row or not bool(rls_row[0]):
                                issues.append("microsoft_identity_mappings must have row level security enabled in Supabase/PostgreSQL.")
                            unsafe_grants = connection.exec_driver_sql(
                                """
                                SELECT grantee, privilege_type
                                FROM information_schema.role_table_grants
                                WHERE table_schema = 'public'
                                  AND table_name = 'microsoft_identity_mappings'
                                  AND grantee IN ('anon', 'authenticated')
                                  AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
                                """
                            ).fetchall()
                            if unsafe_grants:
                                issues.append("microsoft_identity_mappings grants direct browser-role access to anon/authenticated.")
            except Exception as exc:
                issues.append(f"Database readiness inspection failed: {exc}")
    return list(dict.fromkeys(issues))


def apply_migration() -> None:
    if not configured_database_url():
        raise RuntimeError("POSTGRES_URL or SUPABASE_DB_URL is required.")
    engine = get_engine()
    if engine.dialect.name != "postgresql":
        raise RuntimeError("The production migration command is intended for PostgreSQL/Supabase Postgres.")
    with engine.begin() as connection:
        connection.exec_driver_sql(MICROSOFT_IDENTITY_MIGRATION_SQL)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Microsoft identity provisioning DB migration and readiness checks.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("sql", help="Print the PostgreSQL migration SQL.")
    subparsers.add_parser("apply", help="Apply the Microsoft identity mapping migration to PostgreSQL/Supabase Postgres.")
    check = subparsers.add_parser("check", help="Check production readiness and required identity mapping schema.")
    check.add_argument("--skip-db", action="store_true", help="Only validate environment/configuration, not live DB schema.")
    check.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    args = parser.parse_args(argv)

    if args.command == "sql":
        print(MICROSOFT_IDENTITY_MIGRATION_SQL.strip())
        return 0
    if args.command == "apply":
        apply_migration()
        print("Applied microsoft_identity_mappings migration.")
        return 0
    if args.command == "check":
        issues = production_readiness_issues(check_database=not args.skip_db)
        payload: dict[str, Any] = {
            "ok": not issues,
            "issues": issues,
            "database_configured": bool(configured_database_url()),
            "table": "microsoft_identity_mappings",
        }
        if args.json:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print("PASS production DB readiness" if payload["ok"] else "FAIL production DB readiness")
            for issue in issues:
                print(f"- {issue}")
        return 0 if payload["ok"] else 1
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
