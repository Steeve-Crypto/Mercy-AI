from __future__ import annotations

import json
import os
import tempfile
import time
import unittest
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

from fastapi import HTTPException

from auth_context import _tenant_user_from_supabase_jwt
from microsoft_auth import MercyIdentityMapping, MicrosoftIdentity, exchange_microsoft_token_for_mercy_session, issue_mercy_session_token
from mercy_storage import (
    get_microsoft_identity_mapping,
    reset_storage_for_tests,
    upsert_microsoft_identity_mapping,
)


PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PUBLIC_KEY = PRIVATE_KEY.public_key()
TENANT_ID = "entra-tenant"
CLIENT_ID = "office-client-id"
ISSUER = f"https://login.microsoftonline.com/{TENANT_ID}/v2.0"
SUPABASE_SECRET = "microsoft-exchange-supabase-secret"
SUPABASE_URL = "https://mercy-test.supabase.co"


def _mapping(*, firm: bool = True) -> str:
    scope = {"tenant_id": "tenant-alpha", "firm_id": "firm-alpha"} if firm else {"tenant_id": "solo-alpha"}
    return json.dumps(
        {
            "users": [
                {
                    "tid": TENANT_ID,
                    "oid": "user-oid",
                    "email": "attorney@example.test",
                    "user_id": "mercy-user-a",
                    "roles": ["attorney", "firm_admin"],
                    **scope,
                }
            ]
        }
    )


def _token(**overrides: object) -> str:
    now = int(time.time())
    payload: dict[str, object] = {
        "iss": ISSUER,
        "aud": CLIENT_ID,
        "tid": TENANT_ID,
        "oid": "user-oid",
        "sub": "subject-a",
        "preferred_username": "attorney@example.test",
        "iat": now,
        "exp": now + 600,
    }
    payload.update(overrides)
    return jwt.encode(payload, PRIVATE_KEY, algorithm="RS256", headers={"kid": "unit-key"})


@contextmanager
def _patched_env(extra: dict[str, str], *, clear: bool = True):
    from mercy_config import get_config

    env = {
        "MERCY_ENV": "prod",
        "MERCY_AUTH_MODE": "supabase",
        "SUPABASE_URL": SUPABASE_URL,
        "SUPABASE_DB_URL": "",
        "SUPABASE_JWT_SECRET": SUPABASE_SECRET,
        "SUPABASE_JWKS_URL": "",
        "MERCY_SUPABASE_JWKS_URL": "",
        "SUPABASE_JWT_ISSUER": "",
        "MERCY_SUPABASE_JWT_ISSUER": "",
        "POSTGRES_URL": "",
        "MERCY_DATABASE_URL": "",
        "MERCY_PGVECTOR_DSN": "",
        "MERCY_OFFICE_NAA_ENABLED": "true",
        "MICROSOFT_ENTRA_TENANT_ID": TENANT_ID,
        "MICROSOFT_ENTRA_CLIENT_ID": CLIENT_ID,
        "MICROSOFT_ENTRA_ISSUER": ISSUER,
        "MICROSOFT_ENTRA_JWKS_URL": "https://login.microsoftonline.com/unit/discovery/v2.0/keys",
        **extra,
    }
    with patch.dict(os.environ, env, clear=clear):
        get_config.cache_clear()
        reset_storage_for_tests()
        try:
            yield
        finally:
            reset_storage_for_tests()
            get_config.cache_clear()


@contextmanager
def _patched_jwks():
    with patch("microsoft_auth.jwt.PyJWKClient") as jwks:
        jwks.return_value.get_signing_key_from_jwt.return_value = SimpleNamespace(key=PUBLIC_KEY)
        yield


class MicrosoftAuthExchangeTests(unittest.TestCase):
    def _db_env(self, temp_dir: str) -> dict[str, str]:
        return {"POSTGRES_URL": f"sqlite+pysqlite:///{Path(temp_dir) / 'microsoft-auth.db'}"}

    def _provision(
        self,
        *,
        firm_id: str | None = "firm-alpha",
        tenant_id: str | None = "tenant-alpha",
        status: str = "active",
        roles: str | list[str] = "attorney,firm_admin",
        attorney_seat_limit: int | None = None,
    ) -> None:
        upsert_microsoft_identity_mapping(
            microsoft_tenant_id=TENANT_ID,
            microsoft_object_id="user-oid",
            email="attorney@example.test",
            mercy_user_id="mercy-user-a",
            firm_id=firm_id,
            tenant_id=tenant_id,
            roles=roles,
            status=status,
            attorney_seat_limit=attorney_seat_limit,
        )

    def test_exchange_accepts_valid_mocked_microsoft_token_and_returns_backend_token(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with _patched_env(self._db_env(temp_dir)), _patched_jwks():
                self._provision()
                exchange = exchange_microsoft_token_for_mercy_session(_token())
                access_token = exchange["access_token"]
                tenant_user = _tenant_user_from_supabase_jwt(f"Bearer {access_token}")
                stored = get_microsoft_identity_mapping(TENANT_ID, "user-oid")

        self.assertEqual(exchange["token_type"], "bearer")
        self.assertEqual(exchange["auth_mode"], "microsoft_naa")
        self.assertEqual(tenant_user.tenant_id, "tenant-alpha")
        self.assertEqual(tenant_user.firm_id, "firm-alpha")
        self.assertEqual(tenant_user.user_id, "mercy-user-a")
        self.assertIn("firm_admin", tenant_user.roles)
        self.assertIsNotNone(stored)
        self.assertIsNotNone(stored["last_login_at"])

    def test_exchange_rejects_missing_invalid_expired_wrong_issuer_and_wrong_audience(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with _patched_env(self._db_env(temp_dir)), _patched_jwks():
                self._provision()
                failures = [
                    ("", {401}),
                    ("not-a-jwt", {401}),
                    (_token(exp=int(time.time()) - 10), {401}),
                    (_token(iss="https://wrong.example"), {401}),
                    (_token(aud="wrong-client"), {401}),
                ]

                for token, expected_statuses in failures:
                    with self.subTest(token=token[:12]):
                        with self.assertRaises(HTTPException) as raised:
                            exchange_microsoft_token_for_mercy_session(token)
                        self.assertIn(raised.exception.status_code, expected_statuses)

    def test_exchange_rejects_unmapped_identity_safely(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with _patched_env(self._db_env(temp_dir)), _patched_jwks():
                with self.assertRaises(HTTPException) as raised:
                    exchange_microsoft_token_for_mercy_session(_token())

        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(raised.exception.detail, "Microsoft identity is not mapped to a Mercy tenant.")

    def test_exchange_maps_solo_tenant_scope(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with _patched_env(self._db_env(temp_dir)), _patched_jwks():
                self._provision(firm_id=None, tenant_id="solo-alpha", roles=["attorney"])
                exchange = exchange_microsoft_token_for_mercy_session(_token())
                tenant_user = _tenant_user_from_supabase_jwt(f"Bearer {exchange['access_token']}")

        self.assertEqual(tenant_user.tenant_id, "solo-alpha")
        self.assertEqual(tenant_user.user_id, "mercy-user-a")

    def test_exchange_preserves_firm_account_and_child_tenant_scope(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with _patched_env(self._db_env(temp_dir)), _patched_jwks():
                self._provision(firm_id="firm-alpha", tenant_id="tenant-alpha")
                exchange = exchange_microsoft_token_for_mercy_session(_token())
                tenant_user = _tenant_user_from_supabase_jwt(f"Bearer {exchange['access_token']}")
                stored = get_microsoft_identity_mapping(TENANT_ID, "user-oid")

        self.assertEqual(tenant_user.tenant_id, "tenant-alpha")
        self.assertEqual(tenant_user.firm_id, "firm-alpha")
        self.assertEqual(stored["effective_scope_type"], "firm")
        self.assertEqual(stored["effective_scope_id"], "firm-alpha")

    def test_microsoft_firm_account_token_without_tenant_scope_remains_valid(self) -> None:
        identity = MicrosoftIdentity(tid=TENANT_ID, oid="user-oid", subject="subject", email="attorney@example.test")
        mapping = MercyIdentityMapping(
            user_id="mercy-user-a",
            tenant_id=None,
            firm_id="firm-alpha",
            roles=("ops",),
        )
        with _patched_env({"SUPABASE_JWT_SECRET": SUPABASE_SECRET, "SUPABASE_URL": ""}):
            access_token = issue_mercy_session_token(identity, mapping)
            tenant_user = _tenant_user_from_supabase_jwt(f"Bearer {access_token}")

        self.assertEqual(tenant_user.firm_id, "firm-alpha")
        self.assertEqual(tenant_user.tenant_id, "firm-alpha")
        self.assertTrue(tenant_user.tenant_id_is_firm_fallback)

    def test_inactive_mappings_fail_closed_and_trialing_is_active(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with _patched_env(self._db_env(temp_dir)), _patched_jwks():
                self._provision(status="trialing")
                exchange = exchange_microsoft_token_for_mercy_session(_token())
                tenant_user = _tenant_user_from_supabase_jwt(f"Bearer {exchange['access_token']}")
        self.assertEqual(tenant_user.account_status, "trialing")

        for status in ("pending", "suspended", "canceled"):
            with self.subTest(status=status):
                with tempfile.TemporaryDirectory() as temp_dir:
                    with _patched_env(self._db_env(temp_dir)), _patched_jwks():
                        self._provision(status=status)
                        with self.assertRaises(HTTPException) as raised:
                            exchange_microsoft_token_for_mercy_session(_token())
                self.assertEqual(raised.exception.status_code, 403)
                self.assertEqual(raised.exception.detail, "Microsoft identity mapping is not active.")

    def test_missing_tenant_fails_closed_at_provisioning(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with _patched_env(self._db_env(temp_dir)), _patched_jwks():
                with self.assertRaises(ValueError):
                    self._provision(firm_id=None, tenant_id=None)

    def test_firm_mapping_requires_tenant_firm_and_two_attorney_seats(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with _patched_env(self._db_env(temp_dir)), _patched_jwks():
                with self.assertRaises(ValueError):
                    self._provision(firm_id="firm-alpha", tenant_id=None, attorney_seat_limit=2)
                with self.assertRaises(ValueError):
                    self._provision(firm_id="firm-alpha", tenant_id="tenant-alpha", attorney_seat_limit=1)
                self._provision(firm_id="firm-alpha", tenant_id="tenant-alpha", attorney_seat_limit=2)
                stored = get_microsoft_identity_mapping(TENANT_ID, "user-oid")

        self.assertEqual(stored["tenant_id"], "tenant-alpha")
        self.assertEqual(stored["firm_id"], "firm-alpha")
        self.assertEqual(stored["attorney_seat_limit"], 2)
        self.assertEqual(stored["effective_scope_id"], "firm-alpha")

    def test_exchange_fails_closed_when_naa_disabled_or_misconfigured(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with _patched_env(self._db_env(temp_dir) | {"MERCY_OFFICE_NAA_ENABLED": "false"}), _patched_jwks():
                with self.assertRaises(HTTPException) as disabled:
                    exchange_microsoft_token_for_mercy_session(_token())
            with _patched_env(self._db_env(temp_dir) | {"MICROSOFT_ENTRA_CLIENT_ID": ""}), _patched_jwks():
                with self.assertRaises(HTTPException) as misconfigured:
                    exchange_microsoft_token_for_mercy_session(_token())

        self.assertEqual(disabled.exception.status_code, 503)
        self.assertEqual(misconfigured.exception.status_code, 500)

    def test_production_does_not_use_json_mapping(self) -> None:
        with _patched_env({"MERCY_MICROSOFT_IDENTITY_MAP_JSON": _mapping(), "POSTGRES_URL": ""}), _patched_jwks():
            with self.assertRaises(HTTPException) as raised:
                exchange_microsoft_token_for_mercy_session(_token())

        self.assertEqual(raised.exception.status_code, 500)
        self.assertEqual(raised.exception.detail, "Microsoft identity provisioning storage is not configured.")

    def test_json_mapping_only_works_in_explicit_local_dev_test_mode(self) -> None:
        env = {
            "MERCY_ENV": "test",
            "MERCY_AUTH_MODE": "supabase",
            "SUPABASE_URL": SUPABASE_URL,
            "SUPABASE_JWT_SECRET": SUPABASE_SECRET,
            "MERCY_OFFICE_NAA_ENABLED": "true",
            "MICROSOFT_ENTRA_TENANT_ID": TENANT_ID,
            "MICROSOFT_ENTRA_CLIENT_ID": CLIENT_ID,
            "MICROSOFT_ENTRA_ISSUER": ISSUER,
            "MICROSOFT_ENTRA_JWKS_URL": "https://login.microsoftonline.com/unit/discovery/v2.0/keys",
            "MERCY_ALLOW_DEV_MICROSOFT_IDENTITY_MAP_JSON": "true",
            "MERCY_MICROSOFT_IDENTITY_MAP_JSON": _mapping(firm=False),
        }
        with _patched_env(env), _patched_jwks():
            exchange = exchange_microsoft_token_for_mercy_session(_token())
            tenant_user = _tenant_user_from_supabase_jwt(f"Bearer {exchange['access_token']}")

        self.assertEqual(tenant_user.tenant_id, "solo-alpha")

    def test_main_registers_microsoft_exchange_route(self) -> None:
        source = (os.path.dirname(os.path.dirname(__file__)) + "/main.py")
        with open(source, "r", encoding="utf-8") as handle:
            main_source = handle.read()

        self.assertIn('@app.post("/v1/auth/microsoft/exchange")', main_source)
        self.assertIn("exchange_microsoft_token_for_mercy_session(request.bootstrap_token)", main_source)


if __name__ == "__main__":
    unittest.main()
