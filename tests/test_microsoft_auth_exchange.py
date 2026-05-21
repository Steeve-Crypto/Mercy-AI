from __future__ import annotations

import json
import os
import time
import unittest
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

from fastapi import HTTPException

from auth_context import _tenant_user_from_supabase_jwt
from microsoft_auth import exchange_microsoft_token_for_mercy_session


PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PUBLIC_KEY = PRIVATE_KEY.public_key()
TENANT_ID = "entra-tenant"
CLIENT_ID = "office-client-id"
ISSUER = f"https://login.microsoftonline.com/{TENANT_ID}/v2.0"
SUPABASE_SECRET = "microsoft-exchange-supabase-secret"
SUPABASE_URL = "https://mercy-test.supabase.co"


def _mapping(*, firm: bool = True) -> str:
    scope = {"firm_id": "firm-alpha"} if firm else {"tenant_id": "solo-alpha"}
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
def _patched_env(extra: dict[str, str]):
    from mercy_config import get_config

    env = {
        "MERCY_ENV": "prod",
        "MERCY_AUTH_MODE": "supabase",
        "SUPABASE_URL": SUPABASE_URL,
        "SUPABASE_JWT_SECRET": SUPABASE_SECRET,
        "MERCY_OFFICE_NAA_ENABLED": "true",
        "MICROSOFT_ENTRA_TENANT_ID": TENANT_ID,
        "MICROSOFT_ENTRA_CLIENT_ID": CLIENT_ID,
        "MICROSOFT_ENTRA_ISSUER": ISSUER,
        "MICROSOFT_ENTRA_JWKS_URL": "https://login.microsoftonline.com/unit/discovery/v2.0/keys",
        "MERCY_MICROSOFT_IDENTITY_MAP_JSON": _mapping(),
        **extra,
    }
    with patch.dict(os.environ, env):
        get_config.cache_clear()
        try:
            yield
        finally:
            get_config.cache_clear()


@contextmanager
def _patched_jwks():
    with patch("microsoft_auth.jwt.PyJWKClient") as jwks:
        jwks.return_value.get_signing_key_from_jwt.return_value = SimpleNamespace(key=PUBLIC_KEY)
        yield


class MicrosoftAuthExchangeTests(unittest.TestCase):
    def test_exchange_accepts_valid_mocked_microsoft_token_and_returns_backend_token(self) -> None:
        with _patched_env({}), _patched_jwks():
            exchange = exchange_microsoft_token_for_mercy_session(_token())
            access_token = exchange["access_token"]
            tenant_user = _tenant_user_from_supabase_jwt(f"Bearer {access_token}")

        self.assertEqual(exchange["token_type"], "bearer")
        self.assertEqual(exchange["auth_mode"], "microsoft_naa")
        self.assertEqual(tenant_user.tenant_id, "firm-alpha")
        self.assertEqual(tenant_user.user_id, "mercy-user-a")
        self.assertIn("firm_admin", tenant_user.roles)

    def test_exchange_rejects_missing_invalid_expired_wrong_issuer_and_wrong_audience(self) -> None:
        with _patched_env({}), _patched_jwks():
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
        with _patched_env({"MERCY_MICROSOFT_IDENTITY_MAP_JSON": json.dumps({"users": []})}), _patched_jwks():
            with self.assertRaises(HTTPException) as raised:
                exchange_microsoft_token_for_mercy_session(_token())

        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(raised.exception.detail, "Microsoft identity is not mapped to a Mercy tenant.")

    def test_exchange_maps_solo_tenant_scope(self) -> None:
        with _patched_env({"MERCY_MICROSOFT_IDENTITY_MAP_JSON": _mapping(firm=False)}), _patched_jwks():
            exchange = exchange_microsoft_token_for_mercy_session(_token())
            tenant_user = _tenant_user_from_supabase_jwt(f"Bearer {exchange['access_token']}")

        self.assertEqual(tenant_user.tenant_id, "solo-alpha")
        self.assertEqual(tenant_user.user_id, "mercy-user-a")

    def test_exchange_fails_closed_when_naa_disabled_or_misconfigured(self) -> None:
        with _patched_env({"MERCY_OFFICE_NAA_ENABLED": "false"}), _patched_jwks():
            with self.assertRaises(HTTPException) as disabled:
                exchange_microsoft_token_for_mercy_session(_token())
        with _patched_env({"MICROSOFT_ENTRA_CLIENT_ID": ""}), _patched_jwks():
            with self.assertRaises(HTTPException) as misconfigured:
                exchange_microsoft_token_for_mercy_session(_token())

        self.assertEqual(disabled.exception.status_code, 503)
        self.assertEqual(misconfigured.exception.status_code, 500)

    def test_main_registers_microsoft_exchange_route(self) -> None:
        source = (os.path.dirname(os.path.dirname(__file__)) + "/main.py")
        with open(source, "r", encoding="utf-8") as handle:
            main_source = handle.read()

        self.assertIn('@app.post("/v1/auth/microsoft/exchange")', main_source)
        self.assertIn("exchange_microsoft_token_for_mercy_session(request.bootstrap_token)", main_source)


if __name__ == "__main__":
    unittest.main()
