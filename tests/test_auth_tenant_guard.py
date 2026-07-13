from __future__ import annotations

import os
import unittest
import base64
import hashlib
import hmac
import json
import time
import tempfile
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

from auth_context import _tenant_user_from_supabase_jwt
from mercy_storage import reset_storage_for_tests

os.environ.setdefault("MERCY_ENV", "local")

try:
    from fastapi.testclient import TestClient

    from main import app

    FASTAPI_AVAILABLE = True
except ModuleNotFoundError:
    TestClient = None
    app = None
    FASTAPI_AVAILABLE = False


def _headers(tenant_id: str, user_id: str = "user-1") -> dict[str, str]:
    return {
        "Authorization": "Bearer test-token",
        "X-Mercy-Tenant-Id": tenant_id,
        "X-Mercy-User-Id": user_id,
    }


def _jwt_headers(token: str, tenant_id: str = "client-supplied-tenant") -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "X-Mercy-Tenant-Id": tenant_id,
        "X-Mercy-Firm-Id": "client-supplied-firm",
        "X-Mercy-User-Id": "client-supplied-user",
        "X-Mercy-Roles": "client_supplied_role",
    }


def _matter_id(label: str) -> str:
    return f"{label}-{uuid4().hex}"


def _b64url(payload: dict[str, object]) -> str:
    return base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")).rstrip(b"=").decode("ascii")


def _supabase_jwt(
    *,
    secret: str = "unit-supabase-secret",
    user_id: str = "jwt-user-a",
    tenant_id: str | None = "jwt-tenant-a",
    firm_id: str | None = None,
    expires_in: int = 3600,
    roles: list[str] | None = None,
    account_status: str | None = "active",
    account_active: bool | str | None = True,
    issuer: str | None = None,
    audience: str = "authenticated",
    user_metadata: dict[str, object] | None = None,
    account_type: str | None = None,
    include_account_type: bool = True,
    legacy_role: str | None = None,
) -> str:
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload: dict[str, object] = {
        "aud": audience,
        "sub": user_id,
        "iat": now,
        "exp": now + expires_in,
        "app_metadata": {"roles": roles or ["attorney"]},
        "user_metadata": user_metadata or {"name": "JWT User"},
    }
    if tenant_id:
        app_metadata = payload["app_metadata"]
        assert isinstance(app_metadata, dict)
        app_metadata["tenant_id"] = tenant_id
    if firm_id:
        app_metadata = payload["app_metadata"]
        assert isinstance(app_metadata, dict)
        app_metadata["firm_id"] = firm_id
    if account_status:
        app_metadata = payload["app_metadata"]
        assert isinstance(app_metadata, dict)
        app_metadata["account_status"] = account_status
    if account_active is not None:
        app_metadata = payload["app_metadata"]
        assert isinstance(app_metadata, dict)
        app_metadata["workspace_active"] = account_active
    if include_account_type:
        app_metadata = payload["app_metadata"]
        assert isinstance(app_metadata, dict)
        app_metadata["account_type"] = account_type or ("firm" if firm_id else "solo")
    if legacy_role is not None:
        app_metadata = payload["app_metadata"]
        assert isinstance(app_metadata, dict)
        app_metadata["role"] = legacy_role
    if issuer:
        payload["iss"] = issuer
    signing_input = f"{_b64url(header)}.{_b64url(payload)}"
    signature = hmac.new(secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode('ascii')}"


RS_PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
RS_PUBLIC_KEY = RS_PRIVATE_KEY.public_key()


def _supabase_rs256_jwt(
    *,
    user_id: str = "rs-user-a",
    tenant_id: str = "rs-tenant-a",
    roles: list[str] | None = None,
    account_status: str | None = "active",
    issuer: str = "https://mercy-test.supabase.co/auth/v1",
    audience: str = "authenticated",
    expires_in: int = 3600,
    kid: str | None = "supabase-unit-key",
) -> str:
    now = int(time.time())
    payload: dict[str, object] = {
        "iss": issuer,
        "aud": audience,
        "sub": user_id,
        "iat": now,
        "exp": now + expires_in,
        "app_metadata": {
            "tenant_id": tenant_id,
            "roles": roles or ["attorney"],
            "account_type": "solo",
            "workspace_active": True,
        },
        "user_metadata": {},
    }
    if account_status:
        app_metadata = payload["app_metadata"]
        assert isinstance(app_metadata, dict)
        app_metadata["account_status"] = account_status
    headers = {"kid": kid} if kid else None
    return jwt.encode(payload, RS_PRIVATE_KEY, algorithm="RS256", headers=headers)


@contextmanager
def _patched_env(*args, **kwargs):
    from mercy_config import get_config

    if len(args) >= 2 and isinstance(args[1], dict):
        values = args[1]
        if values.get("MERCY_AUTH_MODE") == "supabase" and "SUPABASE_URL" not in values:
            values = values | {"SUPABASE_URL": ""}
        if values.get("MERCY_AUTH_MODE") == "supabase":
            values = {
                "SUPABASE_JWT_ISSUER": "",
                "MERCY_SUPABASE_JWT_ISSUER": "",
                "SUPABASE_JWKS_URL": "",
                "MERCY_SUPABASE_JWKS_URL": "",
            } | values
            args = (args[0], values, *args[2:])
    with patch.dict(*args, **kwargs):
        get_config.cache_clear()
        try:
            yield
        finally:
            get_config.cache_clear()


class AuthTenantGuardTests(unittest.TestCase):
    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_legal_endpoint_rejects_unauthenticated_non_local_request(self) -> None:
        with _patched_env(os.environ, {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": "unit-supabase-secret"}):
            client = TestClient(app)  # type: ignore[arg-type]
            response = client.get("/v1/matters")

        self.assertEqual(response.status_code, 401)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_valid_supabase_jwt_is_accepted_and_derives_identity(self) -> None:
        token = _supabase_jwt(user_id="jwt-user-a", tenant_id="jwt-tenant-a", roles=["attorney", "firm_admin"])
        with _patched_env(
            os.environ,
            {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": "unit-supabase-secret"},
        ):
            client = TestClient(app)  # type: ignore[arg-type]
            created = client.post("/v1/matters", headers=_jwt_headers(token, tenant_id="spoofed-tenant"), json={"name": "JWT matter"})

        self.assertEqual(created.status_code, 200)
        payload = created.json()
        self.assertEqual(payload["tenant_id"], "jwt-tenant-a")
        self.assertEqual(payload["created_by_user_id"], "jwt-user-a")

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_supabase_user_metadata_cannot_create_trusted_workspace_identity(self) -> None:
        token = _supabase_jwt(
            user_id="unprovisioned-user",
            tenant_id=None,
            account_status=None,
            user_metadata={
                "tenant_id": "victim-tenant",
                "firm_id": "victim-firm",
                "roles": ["superadmin"],
                "account_status": "active",
                "workspace_active": True,
            },
        )
        with _patched_env(
            os.environ,
            {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": "unit-supabase-secret"},
        ):
            client = TestClient(app)  # type: ignore[arg-type]
            response = client.post("/v1/matters", headers=_jwt_headers(token), json={"name": "Forbidden matter"})

        self.assertEqual(response.status_code, 401)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_supabase_user_metadata_cannot_override_trusted_tenant_firm_or_roles(self) -> None:
        token = _supabase_jwt(
            user_id="trusted-attorney",
            tenant_id="tenant-a",
            firm_id="firm-a",
            roles=["attorney"],
            account_status="active",
            account_type="firm",
            user_metadata={
                "tenant_id": "tenant-b",
                "firm_id": "firm-b",
                "roles": ["superadmin"],
                "account_status": "active",
            },
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            env = {
                "MERCY_ENV": "prod",
                "MERCY_AUTH_MODE": "supabase",
                "SUPABASE_JWT_SECRET": "unit-supabase-secret",
                "POSTGRES_URL": f"sqlite+pysqlite:///{Path(temp_dir) / 'metadata-conflict.db'}",
            }
            with _patched_env(os.environ, env):
                reset_storage_for_tests()
                tenant_user = _tenant_user_from_supabase_jwt(f"Bearer {token}")
                client = TestClient(app)  # type: ignore[arg-type]
                created = client.post("/v1/matters", headers=_jwt_headers(token), json={"name": "Trusted matter"})
                admin = client.get("/v1/admin/microsoft-identity-mappings", headers={"Authorization": f"Bearer {token}"})
                reset_storage_for_tests()

        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(created.json()["tenant_id"], "tenant-a")
        self.assertEqual(tenant_user.firm_id, "firm-a")
        self.assertEqual(tenant_user.roles, ("attorney",))
        self.assertEqual(admin.status_code, 403)

    def test_supabase_user_metadata_cannot_reactivate_blocked_account_or_add_bypass_role(self) -> None:
        token = _supabase_jwt(
            tenant_id="blocked-tenant",
            roles=["attorney"],
            account_status="suspended",
            account_active=False,
            user_metadata={
                "roles": ["ops"],
                "account_status": "active",
                "workspace_active": True,
            },
        )
        with _patched_env(
            os.environ,
            {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": "unit-supabase-secret"},
        ):
            with self.assertRaisesRegex(Exception, "deactivated"):
                _tenant_user_from_supabase_jwt(f"Bearer {token}")

            deactivated_platform = _supabase_jwt(
                tenant_id="platform-tenant",
                roles=["ops"],
                account_status="suspended",
                account_active=False,
            )
            with self.assertRaisesRegex(Exception, "deactivated"):
                _tenant_user_from_supabase_jwt(f"Bearer {deactivated_platform}")

    def test_supabase_malformed_active_or_firm_claims_fail_closed(self) -> None:
        malformed_active = _supabase_jwt(tenant_id="tenant-a", account_status="active", account_active="definitely")
        missing_firm = _supabase_jwt(tenant_id="tenant-a", account_status="active", account_type="firm")
        solo_with_firm = _supabase_jwt(tenant_id="tenant-a", firm_id="firm-a", account_status="active", account_type="solo")
        missing_active = _supabase_jwt(tenant_id="tenant-a", account_status="active", account_active=None)
        missing_type = _supabase_jwt(tenant_id="tenant-a", account_status="active", include_account_type=False)
        with _patched_env(
            os.environ,
            {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": "unit-supabase-secret"},
        ):
            with self.assertRaisesRegex(Exception, "deactivated"):
                _tenant_user_from_supabase_jwt(f"Bearer {malformed_active}")
            with self.assertRaisesRegex(Exception, "Firm accounts require"):
                _tenant_user_from_supabase_jwt(f"Bearer {missing_firm}")
            with self.assertRaisesRegex(Exception, "Solo accounts cannot"):
                _tenant_user_from_supabase_jwt(f"Bearer {solo_with_firm}")
            with self.assertRaisesRegex(Exception, "deactivated"):
                _tenant_user_from_supabase_jwt(f"Bearer {missing_active}")
            with self.assertRaisesRegex(Exception, "account type"):
                _tenant_user_from_supabase_jwt(f"Bearer {missing_type}")

    def test_supabase_conflicting_role_and_status_aliases_fail_closed(self) -> None:
        conflicting_role = _supabase_jwt(roles=["attorney"], legacy_role="superadmin")
        conflicting_status = _supabase_jwt()
        parts = conflicting_status.split(".")
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
        payload["app_metadata"]["subscription_status"] = "suspended"
        signing_input = f"{parts[0]}.{_b64url(payload)}"
        signature = hmac.new(b"unit-supabase-secret", signing_input.encode("ascii"), hashlib.sha256).digest()
        conflicting_status = f"{signing_input}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode('ascii')}"

        with _patched_env(
            os.environ,
            {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": "unit-supabase-secret"},
        ):
            with self.assertRaisesRegex(Exception, "role claim"):
                _tenant_user_from_supabase_jwt(f"Bearer {conflicting_role}")
            with self.assertRaisesRegex(Exception, "account status claims conflict"):
                _tenant_user_from_supabase_jwt(f"Bearer {conflicting_status}")

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_modern_supabase_rs256_jwt_uses_jwks_and_derives_identity(self) -> None:
        token = _supabase_rs256_jwt(user_id="rs-user-a", tenant_id="rs-tenant-a")
        env = {
            "MERCY_ENV": "prod",
            "MERCY_AUTH_MODE": "supabase",
            "SUPABASE_URL": "https://mercy-test.supabase.co",
            "SUPABASE_JWKS_URL": "https://mercy-test.supabase.co/auth/v1/.well-known/jwks.json",
        }
        with _patched_env(os.environ, env), patch("auth_context.jwt.PyJWKClient") as jwks:
            jwks.return_value.get_signing_key.return_value = SimpleNamespace(key=RS_PUBLIC_KEY)
            client = TestClient(app)  # type: ignore[arg-type]
            created = client.post("/v1/matters", headers=_jwt_headers(token, tenant_id="spoofed-tenant"), json={"name": "RS matter"})

        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(created.json()["tenant_id"], "rs-tenant-a")
        self.assertEqual(created.json()["created_by_user_id"], "rs-user-a")
        jwks.return_value.get_signing_key.assert_called_once_with("supabase-unit-key")

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_modern_supabase_superadmin_metadata_grants_admin_access(self) -> None:
        token = _supabase_rs256_jwt(user_id="admin-user", tenant_id="tenant_admin_001", roles=["superadmin"])
        with tempfile.TemporaryDirectory() as temp_dir:
            env = {
                "MERCY_ENV": "prod",
                "MERCY_AUTH_MODE": "supabase",
                "SUPABASE_URL": "https://mercy-test.supabase.co",
                "SUPABASE_JWKS_URL": "https://mercy-test.supabase.co/auth/v1/.well-known/jwks.json",
                "POSTGRES_URL": f"sqlite+pysqlite:///{Path(temp_dir) / 'superadmin.db'}",
            }
            with _patched_env(os.environ, env), patch("auth_context.jwt.PyJWKClient") as jwks:
                reset_storage_for_tests()
                jwks.return_value.get_signing_key.return_value = SimpleNamespace(key=RS_PUBLIC_KEY)
                client = TestClient(app)  # type: ignore[arg-type]
                response = client.get("/v1/admin/microsoft-identity-mappings", headers={"Authorization": f"Bearer {token}"})
                reset_storage_for_tests()

        self.assertEqual(response.status_code, 200, response.text)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_modern_supabase_attorney_metadata_does_not_grant_admin_access(self) -> None:
        token = _supabase_rs256_jwt(user_id="attorney-user", tenant_id="tenant_attorney_001", roles=["attorney"])
        with tempfile.TemporaryDirectory() as temp_dir:
            env = {
                "MERCY_ENV": "prod",
                "MERCY_AUTH_MODE": "supabase",
                "SUPABASE_URL": "https://mercy-test.supabase.co",
                "SUPABASE_JWKS_URL": "https://mercy-test.supabase.co/auth/v1/.well-known/jwks.json",
                "POSTGRES_URL": f"sqlite+pysqlite:///{Path(temp_dir) / 'attorney.db'}",
            }
            with _patched_env(os.environ, env), patch("auth_context.jwt.PyJWKClient") as jwks:
                reset_storage_for_tests()
                jwks.return_value.get_signing_key.return_value = SimpleNamespace(key=RS_PUBLIC_KEY)
                client = TestClient(app)  # type: ignore[arg-type]
                response = client.get("/v1/admin/microsoft-identity-mappings", headers={"Authorization": f"Bearer {token}"})
                reset_storage_for_tests()

        self.assertEqual(response.status_code, 403)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_superadmin_can_provision_solo_beta_account(self) -> None:
        token = _supabase_rs256_jwt(user_id="admin-user", tenant_id="admin-tenant", roles=["superadmin"])
        with tempfile.TemporaryDirectory() as temp_dir:
            env = {
                "MERCY_ENV": "prod",
                "MERCY_AUTH_MODE": "supabase",
                "SUPABASE_URL": "https://mercy-test.supabase.co",
                "SUPABASE_JWKS_URL": "https://mercy-test.supabase.co/auth/v1/.well-known/jwks.json",
                "POSTGRES_URL": f"sqlite+pysqlite:///{Path(temp_dir) / 'solo-provision.db'}",
            }
            with _patched_env(os.environ, env), patch("auth_context.jwt.PyJWKClient") as jwks:
                reset_storage_for_tests()
                jwks.return_value.get_signing_key.return_value = SimpleNamespace(key=RS_PUBLIC_KEY)
                client = TestClient(app)  # type: ignore[arg-type]
                response = client.post(
                    "/v1/admin/microsoft-identity-mappings",
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "microsoft_tenant_id": "tenant-solo-beta",
                        "microsoft_object_id": "pending:solo@example.com",
                        "email": "solo@example.com",
                        "mercy_user_id": "pending:solo@example.com",
                        "tenant_id": "tenant-solo-beta",
                        "roles": ["owner", "admin", "attorney"],
                        "status": "trialing",
                        "attorney_seat_limit": 1,
                    },
                )
                reset_storage_for_tests()

        self.assertEqual(response.status_code, 200, response.text)
        mapping = response.json()["mapping"]
        self.assertEqual(mapping["account_type"], "solo")
        self.assertIsNone(mapping["firm_id"])
        self.assertEqual(mapping["tenant_id"], "tenant-solo-beta")
        self.assertEqual(mapping["status"], "trialing")

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_superadmin_can_provision_firm_beta_account(self) -> None:
        token = _supabase_rs256_jwt(user_id="admin-user", tenant_id="admin-tenant", roles=["superadmin"])
        with tempfile.TemporaryDirectory() as temp_dir:
            env = {
                "MERCY_ENV": "prod",
                "MERCY_AUTH_MODE": "supabase",
                "SUPABASE_URL": "https://mercy-test.supabase.co",
                "SUPABASE_JWKS_URL": "https://mercy-test.supabase.co/auth/v1/.well-known/jwks.json",
                "POSTGRES_URL": f"sqlite+pysqlite:///{Path(temp_dir) / 'firm-provision.db'}",
            }
            with _patched_env(os.environ, env), patch("auth_context.jwt.PyJWKClient") as jwks:
                reset_storage_for_tests()
                jwks.return_value.get_signing_key.return_value = SimpleNamespace(key=RS_PUBLIC_KEY)
                client = TestClient(app)  # type: ignore[arg-type]
                response = client.post(
                    "/v1/admin/microsoft-identity-mappings",
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "microsoft_tenant_id": "firm-beta",
                        "microsoft_object_id": "pending:owner@firm.com",
                        "email": "owner@firm.com",
                        "mercy_user_id": "pending:owner@firm.com",
                        "tenant_id": "tenant-firm-workspace",
                        "firm_id": "firm-beta",
                        "roles": ["owner", "admin", "firm_admin", "attorney"],
                        "status": "active",
                        "attorney_seat_limit": 2,
                    },
                )
                reset_storage_for_tests()

        self.assertEqual(response.status_code, 200, response.text)
        mapping = response.json()["mapping"]
        self.assertEqual(mapping["account_type"], "firm")
        self.assertEqual(mapping["firm_id"], "firm-beta")
        self.assertEqual(mapping["tenant_id"], "tenant-firm-workspace")
        self.assertEqual(mapping["attorney_seat_limit"], 2)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_non_superadmin_cannot_provision_beta_account(self) -> None:
        token = _supabase_rs256_jwt(user_id="admin-user", tenant_id="admin-tenant", roles=["admin"])
        with tempfile.TemporaryDirectory() as temp_dir:
            env = {
                "MERCY_ENV": "prod",
                "MERCY_AUTH_MODE": "supabase",
                "SUPABASE_URL": "https://mercy-test.supabase.co",
                "SUPABASE_JWKS_URL": "https://mercy-test.supabase.co/auth/v1/.well-known/jwks.json",
                "POSTGRES_URL": f"sqlite+pysqlite:///{Path(temp_dir) / 'non-superadmin.db'}",
            }
            with _patched_env(os.environ, env), patch("auth_context.jwt.PyJWKClient") as jwks:
                reset_storage_for_tests()
                jwks.return_value.get_signing_key.return_value = SimpleNamespace(key=RS_PUBLIC_KEY)
                client = TestClient(app)  # type: ignore[arg-type]
                response = client.post(
                    "/v1/admin/microsoft-identity-mappings",
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "microsoft_tenant_id": "tenant-denied",
                        "microsoft_object_id": "pending:denied@example.com",
                        "mercy_user_id": "pending:denied@example.com",
                        "tenant_id": "tenant-denied",
                    },
                )
                reset_storage_for_tests()

        self.assertEqual(response.status_code, 403)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_firm_beta_account_requires_two_or_more_seats(self) -> None:
        token = _supabase_rs256_jwt(user_id="admin-user", tenant_id="admin-tenant", roles=["superadmin"])
        with tempfile.TemporaryDirectory() as temp_dir:
            env = {
                "MERCY_ENV": "prod",
                "MERCY_AUTH_MODE": "supabase",
                "SUPABASE_URL": "https://mercy-test.supabase.co",
                "SUPABASE_JWKS_URL": "https://mercy-test.supabase.co/auth/v1/.well-known/jwks.json",
                "POSTGRES_URL": f"sqlite+pysqlite:///{Path(temp_dir) / 'seat-minimum.db'}",
            }
            with _patched_env(os.environ, env), patch("auth_context.jwt.PyJWKClient") as jwks:
                reset_storage_for_tests()
                jwks.return_value.get_signing_key.return_value = SimpleNamespace(key=RS_PUBLIC_KEY)
                client = TestClient(app)  # type: ignore[arg-type]
                response = client.post(
                    "/v1/admin/microsoft-identity-mappings",
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "microsoft_tenant_id": "firm-one-seat",
                        "microsoft_object_id": "pending:one@firm.com",
                        "mercy_user_id": "pending:one@firm.com",
                        "tenant_id": "tenant-one-seat",
                        "firm_id": "firm-one-seat",
                        "status": "active",
                        "attorney_seat_limit": 1,
                    },
                )
                reset_storage_for_tests()

        self.assertEqual(response.status_code, 400)
        self.assertIn("at least 2", response.text)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_account_status_gate_allows_active_and_trialing_blocks_inactive(self) -> None:
        with _patched_env(os.environ, {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": "unit-supabase-secret"}):
            for status in ("active", "trialing"):
                token = _supabase_jwt(user_id=f"user-{status}", tenant_id=f"tenant-{status}", account_status=status)
                tenant_user = _tenant_user_from_supabase_jwt(f"Bearer {token}")
                self.assertEqual(tenant_user.account_status, status)

            for status in ("pending", "past_due", "incomplete", "suspended", "canceled"):
                token = _supabase_jwt(user_id=f"user-{status}", tenant_id=f"tenant-{status}", account_status=status)
                with self.assertRaises(Exception):
                    _tenant_user_from_supabase_jwt(f"Bearer {token}")

            missing_status = _supabase_jwt(user_id="missing-status-user", tenant_id="tenant-missing-status", account_status=None)
            with self.assertRaises(Exception):
                _tenant_user_from_supabase_jwt(f"Bearer {missing_status}")

            token = _supabase_jwt(user_id="deactivated-user", tenant_id="tenant-deactivated", account_status="active", account_active=False)
            with self.assertRaises(Exception):
                _tenant_user_from_supabase_jwt(f"Bearer {token}")

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_solo_practitioner_has_single_tenant_workspace_scope(self) -> None:
        token = _supabase_jwt(user_id="solo-user", tenant_id="solo-tenant-a")
        with _patched_env(
            os.environ,
            {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": "unit-supabase-secret"},
        ):
            tenant_user = _tenant_user_from_supabase_jwt(f"Bearer {token}")
            client = TestClient(app)  # type: ignore[arg-type]
            created = client.post("/v1/matters", headers=_jwt_headers(token), json={"name": "Solo matter"})

        self.assertEqual(tenant_user.tenant_id, "solo-tenant-a")
        self.assertIsNone(tenant_user.firm_id)
        self.assertFalse(tenant_user.tenant_id_is_firm_fallback)
        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.json()["tenant_id"], "solo-tenant-a")

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_small_firm_firm_id_only_is_valid_for_account_level_routes(self) -> None:
        token = _supabase_jwt(user_id="firm-account-user", tenant_id=None, firm_id="firm-alpha", roles=["ops"])
        with _patched_env(
            os.environ,
            {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": "unit-supabase-secret"},
        ):
            tenant_user = _tenant_user_from_supabase_jwt(f"Bearer {token}")
            client = TestClient(app)  # type: ignore[arg-type]
            response = client.get("/v1/beta/analytics", headers={"Authorization": f"Bearer {token}"})

        self.assertEqual(tenant_user.tenant_id, "firm-alpha")
        self.assertEqual(tenant_user.firm_id, "firm-alpha")
        self.assertTrue(tenant_user.tenant_id_is_firm_fallback)
        self.assertEqual(response.status_code, 200)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_small_firm_preserves_parent_firm_and_child_tenant_scope(self) -> None:
        token = _supabase_jwt(user_id="firm-user", tenant_id="tenant-alpha", firm_id="firm-alpha")
        with _patched_env(
            os.environ,
            {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": "unit-supabase-secret"},
        ):
            tenant_user = _tenant_user_from_supabase_jwt(f"Bearer {token}")
            client = TestClient(app)  # type: ignore[arg-type]
            created = client.post("/v1/matters", headers=_jwt_headers(token), json={"name": "Firm matter"})

        self.assertEqual(tenant_user.firm_id, "firm-alpha")
        self.assertEqual(tenant_user.tenant_id, "tenant-alpha")
        self.assertFalse(tenant_user.tenant_id_is_firm_fallback)
        self.assertEqual(tenant_user.to_context()["account_id"], "firm-alpha")
        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.json()["tenant_id"], "tenant-alpha")

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_small_firm_can_use_multiple_tenant_scopes_under_one_firm(self) -> None:
        with _patched_env(
            os.environ,
            {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": "unit-supabase-secret"},
        ):
            tenant_a = _tenant_user_from_supabase_jwt(f"Bearer {_supabase_jwt(user_id='user-a', tenant_id='tenant-a', firm_id='firm-alpha')}")
            tenant_b = _tenant_user_from_supabase_jwt(f"Bearer {_supabase_jwt(user_id='user-b', tenant_id='tenant-b', firm_id='firm-alpha')}")

        self.assertEqual(tenant_a.firm_id, "firm-alpha")
        self.assertEqual(tenant_b.firm_id, "firm-alpha")
        self.assertEqual(tenant_a.tenant_id, "tenant-a")
        self.assertEqual(tenant_b.tenant_id, "tenant-b")

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_missing_tenant_and_firm_claims_are_rejected(self) -> None:
        token = _supabase_jwt(user_id="missing-tenant-user", tenant_id=None, firm_id=None)
        with _patched_env(
            os.environ,
            {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": "unit-supabase-secret"},
        ):
            client = TestClient(app)  # type: ignore[arg-type]
            response = client.get("/v1/matters", headers={"Authorization": f"Bearer {token}"})

        self.assertEqual(response.status_code, 401)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_missing_invalid_and_expired_supabase_jwt_are_rejected(self) -> None:
        expired = _supabase_jwt(expires_in=-60)
        valid = _supabase_jwt()
        invalid = f"{valid.rsplit('.', 1)[0]}.invalid-signature"
        with _patched_env(
            os.environ,
            {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": "unit-supabase-secret"},
        ):
            client = TestClient(app)  # type: ignore[arg-type]
            missing = client.get("/v1/matters")
            bad_signature = client.get("/v1/matters", headers={"Authorization": f"Bearer {invalid}"})
            expired_response = client.get("/v1/matters", headers={"Authorization": f"Bearer {expired}"})

        self.assertEqual(missing.status_code, 401)
        self.assertEqual(bad_signature.status_code, 401)
        self.assertEqual(expired_response.status_code, 401)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_supabase_jwt_rejects_unsupported_algorithm_missing_kid_and_bad_claims(self) -> None:
        unsupported = jwt.encode(
            {
                "aud": "authenticated",
                "sub": "unsupported-user",
                "exp": int(time.time()) + 600,
                "app_metadata": {"tenant_id": "tenant-a", "roles": ["attorney"]},
            },
            "secret",
            algorithm="HS384",
        )
        missing_kid = _supabase_rs256_jwt(kid=None)
        wrong_audience = _supabase_rs256_jwt(audience="wrong-audience")
        wrong_issuer = _supabase_rs256_jwt(issuer="https://wrong-project.supabase.co/auth/v1")
        expired = _supabase_rs256_jwt(expires_in=-60)
        env = {
            "MERCY_ENV": "prod",
            "MERCY_AUTH_MODE": "supabase",
            "SUPABASE_URL": "https://mercy-test.supabase.co",
            "SUPABASE_JWKS_URL": "https://mercy-test.supabase.co/auth/v1/.well-known/jwks.json",
        }
        with _patched_env(os.environ, env), patch("auth_context.jwt.PyJWKClient") as jwks:
            jwks.return_value.get_signing_key.return_value = SimpleNamespace(key=RS_PUBLIC_KEY)
            client = TestClient(app)  # type: ignore[arg-type]
            responses = [
                client.get("/v1/matters", headers={"Authorization": f"Bearer {unsupported}"}),
                client.get("/v1/matters", headers={"Authorization": f"Bearer {missing_kid}"}),
                client.get("/v1/matters", headers={"Authorization": f"Bearer {wrong_audience}"}),
                client.get("/v1/matters", headers={"Authorization": f"Bearer {wrong_issuer}"}),
                client.get("/v1/matters", headers={"Authorization": f"Bearer {expired}"}),
            ]

        self.assertEqual([response.status_code for response in responses], [401, 401, 401, 401, 401])

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_supabase_hs256_jwt_rejects_wrong_audience(self) -> None:
        token = _supabase_jwt(audience="wrong-audience")
        with _patched_env(
            os.environ,
            {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": "unit-supabase-secret"},
        ):
            client = TestClient(app)  # type: ignore[arg-type]
            response = client.get("/v1/matters", headers={"Authorization": f"Bearer {token}"})

        self.assertEqual(response.status_code, 401)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_supabase_jwt_misconfiguration_fails_closed(self) -> None:
        token = _supabase_jwt()
        with _patched_env(os.environ, {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": ""}):
            client = TestClient(app)  # type: ignore[arg-type]
            response = client.get("/v1/matters", headers={"Authorization": f"Bearer {token}"})

        self.assertEqual(response.status_code, 500)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_test_auth_only_works_in_explicit_test_environments(self) -> None:
        test_headers = _headers("ci-tenant", user_id="ci-user")
        with _patched_env(os.environ, {"MERCY_ENV": "test", "MERCY_AUTH_MODE": "test", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            accepted = client.get("/v1/matters", headers=test_headers)
        with _patched_env(os.environ, {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "test", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            rejected = client.get("/v1/matters", headers=test_headers)

        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(rejected.status_code, 500)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_legacy_token_auth_is_not_a_production_mode(self) -> None:
        with _patched_env(os.environ, {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "token", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            response = client.get("/v1/matters", headers=_headers("tenant-token"))

        self.assertEqual(response.status_code, 500)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_supabase_jwt_issuer_must_match_configured_project(self) -> None:
        valid = _supabase_jwt(issuer="https://mercy-test.supabase.co/auth/v1")
        wrong_issuer = _supabase_jwt(issuer="https://other-project.supabase.co/auth/v1")
        with _patched_env(
            os.environ,
            {
                "MERCY_ENV": "prod",
                "MERCY_AUTH_MODE": "supabase",
                "SUPABASE_URL": "https://mercy-test.supabase.co",
                "SUPABASE_JWT_SECRET": "unit-supabase-secret",
            },
        ):
            client = TestClient(app)  # type: ignore[arg-type]
            accepted = client.get("/v1/matters", headers={"Authorization": f"Bearer {valid}"})
            rejected = client.get("/v1/matters", headers={"Authorization": f"Bearer {wrong_issuer}"})

        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(rejected.status_code, 401)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_client_supplied_tenant_cannot_override_verified_jwt_tenant(self) -> None:
        tenant_a = _supabase_jwt(user_id="jwt-user-a", tenant_id="jwt-tenant-a")
        tenant_b = _supabase_jwt(user_id="jwt-user-b", tenant_id="jwt-tenant-b")
        with _patched_env(
            os.environ,
            {"MERCY_ENV": "prod", "MERCY_AUTH_MODE": "supabase", "SUPABASE_JWT_SECRET": "unit-supabase-secret"},
        ):
            client = TestClient(app)  # type: ignore[arg-type]
            created = client.post(
                "/v1/matters",
                headers=_jwt_headers(tenant_a, tenant_id="jwt-tenant-b"),
                json={"name": "Tenant A JWT matter"},
            )
            matter_id = created.json()["matter_id"]
            same_tenant = client.get(f"/v1/matters/{matter_id}", headers=_jwt_headers(tenant_a, tenant_id="jwt-tenant-b"))
            other_tenant = client.get(f"/v1/matters/{matter_id}", headers=_jwt_headers(tenant_b, tenant_id="jwt-tenant-a"))

        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.json()["tenant_id"], "jwt-tenant-a")
        self.assertEqual(same_tenant.status_code, 200)
        self.assertEqual(other_tenant.status_code, 404)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_sensitive_ops_endpoints_require_admin_or_ops_role(self) -> None:
        with _patched_env(os.environ, {"MERCY_ENV": "test", "MERCY_AUTH_MODE": "test", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            attorney_headers = _headers("tenant-a", "user-a") | {"X-Mercy-Roles": "attorney"}
            invite_forbidden = client.post("/v1/beta/invites", headers=attorney_headers, json={"email": "beta@example.com"})
            analytics_forbidden = client.get("/v1/beta/analytics", headers=attorney_headers)
            ingest_forbidden = client.post("/v1/rag/ingest", headers=attorney_headers, json={"source": {}, "chunks": []})

            invite_allowed = client.post(
                "/v1/beta/invites",
                headers=_headers("tenant-a", "ops-user") | {"X-Mercy-Roles": "ops"},
                json={"email": "ops-beta@example.com"},
            )
            analytics_allowed = client.get(
                "/v1/beta/analytics",
                headers=_headers("tenant-a", "admin-user") | {"X-Mercy-Roles": "admin"},
            )
            with patch("main.ingest_dc_sources", return_value={"status": "ok", "sources_registered": 1, "chunks_registered": 0}):
                ingest_allowed = client.post(
                    "/v1/rag/ingest",
                    headers=_headers("tenant-a", "ops-user") | {"X-Mercy-Roles": "ops"},
                    json={"source": {"source_id": "unit"}, "chunks": []},
                )
            firm_only_headers = {
                "Authorization": "Bearer test-token",
                "X-Mercy-Firm-Id": "firm-alpha",
                "X-Mercy-User-Id": "firm-ops-user",
                "X-Mercy-Roles": "ops",
            }
            firm_account_allowed = client.get("/v1/beta/analytics", headers=firm_only_headers)
            firm_tenant_scoped_denied = client.post("/v1/rag/ingest", headers=firm_only_headers, json={"source": {"source_id": "unit"}, "chunks": []})

        self.assertEqual(invite_forbidden.status_code, 403)
        self.assertEqual(analytics_forbidden.status_code, 403)
        self.assertEqual(ingest_forbidden.status_code, 403)
        self.assertEqual(invite_allowed.status_code, 200)
        self.assertEqual(analytics_allowed.status_code, 200)
        self.assertEqual(ingest_allowed.status_code, 200)
        self.assertEqual(firm_account_allowed.status_code, 200)
        self.assertEqual(firm_tenant_scoped_denied.status_code, 403)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_sensitive_ops_endpoints_preserve_unauthenticated_behavior(self) -> None:
        with _patched_env(os.environ, {"MERCY_ENV": "test", "MERCY_AUTH_MODE": "test", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            invite = client.post("/v1/beta/invites", json={"email": "beta@example.com"})
            analytics = client.get("/v1/beta/analytics")
            ingest = client.post("/v1/rag/ingest", json={"source": {}, "chunks": []})

        self.assertEqual(invite.status_code, 401)
        self.assertEqual(analytics.status_code, 401)
        self.assertEqual(ingest.status_code, 401)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_local_dev_bypass_requires_explicit_env_pair(self) -> None:
        with _patched_env(os.environ, {"MERCY_ENV": "local", "MERCY_AUTH_MODE": "dev"}):
            client = TestClient(app)  # type: ignore[arg-type]
            response = client.get("/v1/matters")

        self.assertEqual(response.status_code, 200)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_cross_tenant_matter_access_is_forbidden(self) -> None:
        matter_id = _matter_id("auth-tenant-guard-matter")
        with _patched_env(os.environ, {"MERCY_ENV": "local", "MERCY_AUTH_MODE": "dev", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            create_response = client.post(
                "/v1/matter/intake",
                headers=_headers("tenant-a"),
                json={
                    "matter_id": matter_id,
                    "client_id": "client-a",
                    "matter_name": "Tenant A Matter",
                    "jurisdiction": "District of Columbia",
                    "surface_context": "unit_test_auth",
                },
            )
            same_tenant_response = client.get(
                f"/v1/matters/{matter_id}",
                headers=_headers("tenant-a"),
            )
            cross_tenant_response = client.get(
                f"/v1/matters/{matter_id}",
                headers=_headers("tenant-b"),
            )

        self.assertEqual(create_response.status_code, 200)
        self.assertEqual(same_tenant_response.status_code, 200)
        self.assertEqual(cross_tenant_response.status_code, 404)
        self.assertEqual(cross_tenant_response.json()["detail"], "Matter not found.")

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_cross_tenant_document_access_returns_safe_not_found(self) -> None:
        matter_id = _matter_id("auth-doc-tenant-matter")
        document_id = "tenant-a-only-document"
        with _patched_env(os.environ, {"MERCY_ENV": "local", "MERCY_AUTH_MODE": "dev", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            create_response = client.post(
                "/v1/matter/intake",
                headers=_headers("tenant-a"),
                json={
                    "matter_id": matter_id,
                    "client_id": "client-a",
                    "matter_name": "Tenant A Document Matter",
                    "documents": [{"document_id": document_id, "filename": "tenant-a.pdf", "status": "Ready"}],
                    "surface_context": "unit_test_auth",
                },
            )
            same_tenant_response = client.get(f"/v1/matters/{matter_id}/documents", headers=_headers("tenant-a"))
            cross_tenant_response = client.get(f"/v1/matters/{matter_id}/documents/{document_id}/preview", headers=_headers("tenant-b"))

        self.assertEqual(create_response.status_code, 200)
        self.assertEqual(same_tenant_response.status_code, 200)
        self.assertEqual(same_tenant_response.json()["documents"][0]["document_id"], document_id)
        self.assertEqual(cross_tenant_response.status_code, 404)
        self.assertIn(cross_tenant_response.json()["detail"], {"Matter not found.", "Document not found."})

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_matter_a_document_does_not_enter_matter_b_agent_context(self) -> None:
        matter_a = _matter_id("matter-a")
        matter_b = _matter_id("matter-b")
        with _patched_env(os.environ, {"MERCY_ENV": "local", "MERCY_AUTH_MODE": "dev", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            client.post(
                "/v1/matter/intake",
                headers=_headers("tenant-a"),
                json={
                    "matter_id": matter_a,
                    "matter_name": "Matter A",
                    "documents": [{"document_id": "matter-a-secret-doc", "filename": "matter-a-secret.pdf"}],
                    "surface_context": "unit_test_auth",
                },
            )
            client.post(
                "/v1/matter/intake",
                headers=_headers("tenant-a"),
                json={
                    "matter_id": matter_b,
                    "matter_name": "Matter B",
                    "documents": [{"document_id": "matter-b-doc", "filename": "matter-b.pdf"}],
                    "surface_context": "unit_test_auth",
                },
            )
            with (
                patch("main.check_quota"),
                patch("main.record_usage", return_value={"strong_model_remaining": 49}),
                patch("main.execute_agent_task") as execute_agent_task,
            ):
                execute_agent_task.return_value = {
                    "agent_network_version": "unit",
                    "selected_agent": "research",
                    "selected_expert": "research",
                    "agent_result": {"answer": "ok"},
                    "mcp_skills_used": [],
                    "citations": [],
                }
                response = client.post(
                    "/v1/agent/execute",
                    headers=_headers("tenant-a"),
                    json={
                        "task": "Use the selected matter only.",
                        "matter_id": matter_b,
                        "matter_context": {
                            "auth_context": {"tenant_id": "tenant-b", "user_id": "attacker"},
                            "documents": [{"document_id": "matter-a-secret-doc", "filename": "matter-a-secret.pdf"}],
                            "attached_documents": [{"document_id": "matter-a-secret-doc"}],
                        },
                    },
                )
                context = execute_agent_task.call_args.kwargs["matter_context"]

        self.assertEqual(response.status_code, 200)
        self.assertEqual(context["auth_context"]["tenant_id"], "tenant-a")
        document_ids = {document.get("document_id") for document in context.get("documents", [])}
        self.assertEqual(document_ids, {"matter-b-doc"})
        self.assertNotIn("matter-a-secret-doc", str(context))

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_outlook_capture_roundtrip_is_visible_only_to_owning_tenant(self) -> None:
        matter_id = _matter_id("outlook-history-roundtrip")
        with _patched_env(os.environ, {"MERCY_ENV": "local", "MERCY_AUTH_MODE": "dev", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            created = client.post(
                "/v1/matter/intake",
                headers=_headers("tenant-a", "outlook-user"),
                json={
                    "matter_id": matter_id,
                    "matter_name": "Outlook History Roundtrip",
                    "surface_context": "unit_test_auth",
                },
            )
            with (
                patch("main.check_quota"),
                patch("main.record_usage", return_value={"strong_model_remaining": 49}),
            ):
                captured = client.post(
                    "/v1/agent/execute",
                    headers=_headers("tenant-a", "outlook-user"),
                    json={
                        "task": "Update intake matter context with attorney-approved Outlook correspondence.",
                        "matter_id": matter_id,
                        "surface_context": "office_addin",
                        "params": {
                            "new_facts": {
                                "office_addin_note": "Subject: Scheduling order\nDeadline: July 20.",
                                "office_capture": {
                                    "surface": "outlook",
                                    "capture_kind": "correspondence",
                                    "attorney_approved": True,
                                    "approval_method": "explicit_save_to_matter_action",
                                },
                            },
                            "auth_context": {"tenant_id": "forged-tenant", "user_id": "forged-user"},
                        },
                    },
                )
            same_tenant = client.get(f"/v1/matters/{matter_id}", headers=_headers("tenant-a", "outlook-user"))
            cross_tenant = client.get(f"/v1/matters/{matter_id}", headers=_headers("tenant-b", "other-user"))

        events = [
            event
            for event in same_tenant.json().get("history", [])
            if event.get("event") == "office_correspondence_saved"
        ]
        self.assertEqual(created.status_code, 200)
        self.assertEqual(captured.status_code, 200)
        self.assertEqual(captured.json()["agent_result"]["status"], "pass")
        self.assertEqual(same_tenant.status_code, 200)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["tenant_id"], "tenant-a")
        self.assertEqual(events[0]["actor_user_id"], "outlook-user")
        self.assertEqual(cross_tenant.status_code, 404)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_outlook_capture_cannot_create_or_cross_update_a_matter(self) -> None:
        owner_matter_id = _matter_id("outlook-owner-matter")
        missing_matter_id = _matter_id("outlook-missing-matter")
        capture_payload = {
            "office_addin_note": "This content must not be stored.",
            "office_capture": {
                "surface": "outlook",
                "capture_kind": "correspondence",
                "attorney_approved": True,
                "approval_method": "explicit_save_to_matter_action",
            },
        }
        with _patched_env(os.environ, {"MERCY_ENV": "local", "MERCY_AUTH_MODE": "dev", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            client.post(
                "/v1/matter/intake",
                headers=_headers("tenant-a"),
                json={"matter_id": owner_matter_id, "matter_name": "Owner Matter", "surface_context": "unit_test_auth"},
            )
            with (
                patch("main.check_quota"),
                patch("main.record_usage", return_value={"strong_model_remaining": 49}),
            ):
                cross_tenant = client.post(
                    "/v1/agent/execute",
                    headers=_headers("tenant-b"),
                    json={
                        "task": "Update intake matter context with approved Outlook correspondence.",
                        "matter_id": owner_matter_id,
                        "surface_context": "office_addin",
                        "matter_context": {"auth_context": {"tenant_id": "tenant-a", "user_id": "forged-owner"}},
                        "params": {"new_facts": capture_payload},
                    },
                )
                missing = client.post(
                    "/v1/agent/execute",
                    headers=_headers("tenant-b"),
                    json={
                        "task": "Update intake matter context with approved Outlook correspondence.",
                        "matter_id": missing_matter_id,
                        "surface_context": "office_addin",
                        "params": {"new_facts": capture_payload},
                    },
                )
            owner_read = client.get(f"/v1/matters/{owner_matter_id}", headers=_headers("tenant-a"))
            missing_read = client.get(f"/v1/matters/{missing_matter_id}", headers=_headers("tenant-b"))

        self.assertEqual(cross_tenant.status_code, 404)
        self.assertEqual(missing.status_code, 200)
        self.assertEqual(missing.json()["agent_result"]["status"], "block")
        self.assertEqual(missing_read.status_code, 404)
        self.assertFalse(
            any(event.get("event") == "office_correspondence_saved" for event in owner_read.json().get("history", []))
        )


if __name__ == "__main__":
    unittest.main()
