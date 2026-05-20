from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any

from fastapi import Header, HTTPException, Request

from mercy_config import get_config
from observability import trace_event


LOCAL_DEV_TENANT_ID = "local-dev-tenant"
LOCAL_DEV_USER_ID = "local-dev-user"


@dataclass(frozen=True)
class TenantUser:
    tenant_id: str
    user_id: str
    auth_mode: str
    roles: tuple[str, ...] = ()

    def to_context(self) -> dict[str, Any]:
        return {
            "tenant_id": self.tenant_id,
            "user_id": self.user_id,
            "auth_mode": self.auth_mode,
            "roles": list(self.roles),
        }

    def to_metadata(self) -> dict[str, Any]:
        return asdict(self) | {"roles": list(self.roles)}


def local_dev_auth_bypass_enabled() -> bool:
    config = get_config()
    return config.mercy_env == "local" and config.mercy_auth_mode == "dev"


def _parse_roles(raw: str | None) -> tuple[str, ...]:
    if not raw:
        return ()
    return tuple(role.strip() for role in raw.split(",") if role.strip())


def _bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer authorization for Mercy legal endpoint.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty bearer authorization for Mercy legal endpoint.")
    return token


def _validate_bearer_token(authorization: str | None) -> None:
    token = _bearer_token(authorization)
    expected = get_config().effective_api_token
    if not expected:
        raise HTTPException(status_code=500, detail="Mercy token authentication is not configured.")
    if token != expected:
        raise HTTPException(status_code=401, detail="Invalid bearer authorization for Mercy legal endpoint.")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("ascii"))


def _jwt_payload(token: str) -> dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=401, detail="Invalid JWT structure.")
    try:
        header = json.loads(_b64url_decode(parts[0]))
        payload = json.loads(_b64url_decode(parts[1]))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid JWT encoding.") from exc
    if not isinstance(header, dict) or not isinstance(payload, dict):
        raise HTTPException(status_code=401, detail="Invalid JWT payload.")
    if header.get("alg") != "HS256":
        raise HTTPException(status_code=401, detail="Unsupported JWT algorithm.")
    secret = get_config().supabase_jwt_secret
    if secret is None or not secret.get_secret_value():
        raise HTTPException(status_code=500, detail="Supabase JWT verification is not configured.")
    signing_input = f"{parts[0]}.{parts[1]}".encode("ascii")
    expected = hmac.new(secret.get_secret_value().encode("utf-8"), signing_input, hashlib.sha256).digest()
    try:
        actual = _b64url_decode(parts[2])
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid JWT signature encoding.") from exc
    if not hmac.compare_digest(actual, expected):
        raise HTTPException(status_code=401, detail="Invalid JWT signature.")
    exp = payload.get("exp")
    if exp is None:
        raise HTTPException(status_code=401, detail="JWT expiration is required.")
    try:
        expires_at = int(exp)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid JWT expiration.") from exc
    now = int(datetime.now(UTC).timestamp())
    if expires_at <= now:
        raise HTTPException(status_code=401, detail="JWT has expired.")
    nbf = payload.get("nbf")
    if nbf is not None:
        try:
            not_before = int(nbf)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=401, detail="Invalid JWT not-before claim.") from exc
        if not_before > now:
            raise HTTPException(status_code=401, detail="JWT is not active yet.")
    aud = payload.get("aud")
    if aud not in {None, "authenticated"}:
        raise HTTPException(status_code=401, detail="Invalid JWT audience.")
    supabase_url = get_config().supabase_url
    expected_issuer = f"{supabase_url.rstrip('/')}/auth/v1" if supabase_url else None
    issuer = payload.get("iss")
    if expected_issuer and issuer != expected_issuer:
        raise HTTPException(status_code=401, detail="Invalid JWT issuer.")
    return payload


def _claim_metadata(payload: dict[str, Any], name: str) -> dict[str, Any]:
    value = payload.get(name)
    return value if isinstance(value, dict) else {}


def _claim_string(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _roles_from_claims(payload: dict[str, Any]) -> tuple[str, ...]:
    app_metadata = _claim_metadata(payload, "app_metadata")
    user_metadata = _claim_metadata(payload, "user_metadata")
    candidates = (
        app_metadata.get("roles"),
        user_metadata.get("roles"),
        app_metadata.get("role"),
        user_metadata.get("role"),
        payload.get("roles"),
        payload.get("role"),
    )
    roles: list[str] = []
    for candidate in candidates:
        if isinstance(candidate, list):
            roles.extend(str(role).strip() for role in candidate if str(role).strip())
        elif isinstance(candidate, str):
            roles.extend(role.strip() for role in candidate.split(",") if role.strip())
    return tuple(dict.fromkeys(roles or ["attorney"]))


def _tenant_from_claims(payload: dict[str, Any]) -> str | None:
    app_metadata = _claim_metadata(payload, "app_metadata")
    user_metadata = _claim_metadata(payload, "user_metadata")
    return _claim_string(
        app_metadata.get("tenant_id"),
        app_metadata.get("tenantId"),
        app_metadata.get("firm_id"),
        app_metadata.get("firmId"),
        user_metadata.get("tenant_id"),
        user_metadata.get("tenantId"),
        user_metadata.get("firm_id"),
        user_metadata.get("firmId"),
        payload.get("tenant_id"),
        payload.get("tenantId"),
        payload.get("firm_id"),
        payload.get("firmId"),
    )


def _tenant_user_from_supabase_jwt(authorization: str | None) -> TenantUser:
    payload = _jwt_payload(_bearer_token(authorization))
    user_id = _claim_string(payload.get("sub"), payload.get("user_id"))
    tenant_id = _tenant_from_claims(payload)
    if not user_id:
        raise HTTPException(status_code=401, detail="JWT subject is required.")
    if not tenant_id:
        raise HTTPException(status_code=401, detail="JWT tenant or firm claim is required.")
    return TenantUser(
        tenant_id=tenant_id,
        user_id=user_id,
        auth_mode="supabase_jwt",
        roles=_roles_from_claims(payload),
    )


async def get_current_tenant_user(
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
    tenant_id: str | None = Header(default=None, alias="X-Mercy-Tenant-Id"),
    user_id: str | None = Header(default=None, alias="X-Mercy-User-Id"),
    roles: str | None = Header(default=None, alias="X-Mercy-Roles"),
) -> TenantUser:
    """Central FastAPI dependency for tenant and user identity on legal endpoints."""

    if local_dev_auth_bypass_enabled():
        tenant_user = TenantUser(
            tenant_id=tenant_id or LOCAL_DEV_TENANT_ID,
            user_id=user_id or LOCAL_DEV_USER_ID,
            auth_mode="local_dev",
            roles=_parse_roles(roles),
        )
    else:
        auth_mode = get_config().mercy_auth_mode
        if auth_mode == "supabase":
            tenant_user = _tenant_user_from_supabase_jwt(authorization)
        elif auth_mode == "token":
            _validate_bearer_token(authorization)
            if not tenant_id or not user_id:
                raise HTTPException(status_code=401, detail="Missing tenant or user context for Mercy legal endpoint.")
            tenant_user = TenantUser(
                tenant_id=tenant_id,
                user_id=user_id,
                auth_mode="bearer",
                roles=_parse_roles(roles),
            )
        else:
            raise HTTPException(status_code=500, detail="Mercy production auth is not configured.")

    trace_event(
        name="auth_context_checked",
        surface_context=str(request.url.path),
        category="auth",
        metadata={
            "path": request.url.path,
            "method": request.method,
            "tenant_id": tenant_user.tenant_id,
            "user_id": tenant_user.user_id,
            "auth_mode": tenant_user.auth_mode,
        },
    )
    return tenant_user


__all__ = [
    "LOCAL_DEV_TENANT_ID",
    "LOCAL_DEV_USER_ID",
    "TenantUser",
    "get_current_tenant_user",
    "local_dev_auth_bypass_enabled",
]
