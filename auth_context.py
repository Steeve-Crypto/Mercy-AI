from __future__ import annotations

import base64
import hashlib
import hmac
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any

from fastapi import Header, HTTPException, Request
import jwt

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
    firm_id: str | None = None
    tenant_id_is_firm_fallback: bool = False
    account_status: str | None = None
    account_active: bool = True

    def to_context(self) -> dict[str, Any]:
        context = {
            "tenant_id": self.tenant_id,
            "user_id": self.user_id,
            "auth_mode": self.auth_mode,
            "roles": list(self.roles),
            "account_id": self.firm_id or self.tenant_id,
        }
        if self.firm_id:
            context["firm_id"] = self.firm_id
        if self.account_status:
            context["account_status"] = self.account_status
        context["account_active"] = self.account_active
        return context

    def to_metadata(self) -> dict[str, Any]:
        return asdict(self) | {"roles": list(self.roles)}


def local_dev_auth_bypass_enabled() -> bool:
    config = get_config()
    return config.mercy_env == "local" and config.mercy_auth_mode == "dev"


def _parse_roles(raw: str | None) -> tuple[str, ...]:
    if not raw:
        return ()
    return tuple(role.strip().lower() for role in raw.split(",") if role.strip())


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
    alg = header.get("alg")
    if alg == "HS256":
        return _verify_hs256_jwt(parts, payload)
    if alg in {"RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512"}:
        return _verify_asymmetric_jwt(token, header)
    raise HTTPException(status_code=401, detail=f"Unsupported JWT algorithm: {alg or 'missing'}.")


def _expected_jwt_audience() -> str:
    return get_config().supabase_jwt_audience or "authenticated"


def _expected_jwt_issuer() -> str | None:
    return get_config().effective_supabase_jwt_issuer


def _validate_required_claims(payload: dict[str, Any]) -> None:
    if not _claim_string(payload.get("sub")):
        raise HTTPException(status_code=401, detail="JWT subject is required.")


def _audience_matches(audience: Any, expected: str) -> bool:
    if isinstance(audience, str):
        return audience == expected
    if isinstance(audience, list):
        return expected in {str(item) for item in audience}
    return False


def _verify_registered_claims(payload: dict[str, Any]) -> None:
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
    if not _audience_matches(payload.get("aud"), _expected_jwt_audience()):
        raise HTTPException(status_code=401, detail="Invalid JWT audience.")
    expected_issuer = _expected_jwt_issuer()
    issuer = payload.get("iss")
    if expected_issuer and issuer != expected_issuer:
        raise HTTPException(status_code=401, detail="Invalid JWT issuer.")
    _validate_required_claims(payload)


def _verify_hs256_jwt(parts: list[str], payload: dict[str, Any]) -> dict[str, Any]:
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
    _verify_registered_claims(payload)
    return payload


def _verify_asymmetric_jwt(token: str, header: dict[str, Any]) -> dict[str, Any]:
    kid = _claim_string(header.get("kid"))
    if not kid:
        raise HTTPException(status_code=401, detail="JWT key id is required for Supabase JWKS verification.")
    jwks_url = get_config().effective_supabase_jwks_url
    if not jwks_url:
        raise HTTPException(status_code=500, detail="Supabase JWKS verification is not configured.")
    try:
        signing_key = jwt.PyJWKClient(jwks_url).get_signing_key(kid).key
        decode_kwargs: dict[str, Any] = {
            "key": signing_key,
            "algorithms": [str(header["alg"])],
            "audience": _expected_jwt_audience(),
            "options": {"require": ["exp", "sub"]},
        }
        expected_issuer = _expected_jwt_issuer()
        if expected_issuer:
            decode_kwargs["issuer"] = expected_issuer
        decoded = jwt.decode(token, **decode_kwargs)
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="JWT has expired.") from exc
    except jwt.ImmatureSignatureError as exc:
        raise HTTPException(status_code=401, detail="JWT is not active yet.") from exc
    except jwt.InvalidAudienceError as exc:
        raise HTTPException(status_code=401, detail="Invalid JWT audience.") from exc
    except jwt.InvalidIssuerError as exc:
        raise HTTPException(status_code=401, detail="Invalid JWT issuer.") from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid JWT signature or claims.") from exc
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Unable to verify Supabase JWT signing key.") from exc
    if not isinstance(decoded, dict):
        raise HTTPException(status_code=401, detail="Invalid JWT payload.")
    _validate_required_claims(decoded)
    return decoded


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
            roles.extend(str(role).strip().lower() for role in candidate if str(role).strip())
        elif isinstance(candidate, str):
            roles.extend(role.strip().lower() for role in candidate.split(",") if role.strip())
    return tuple(dict.fromkeys(roles or ["attorney"]))


def _tenant_from_claims(payload: dict[str, Any]) -> str | None:
    app_metadata = _claim_metadata(payload, "app_metadata")
    user_metadata = _claim_metadata(payload, "user_metadata")
    return _claim_string(
        app_metadata.get("tenant_id"),
        app_metadata.get("tenantId"),
        user_metadata.get("tenant_id"),
        user_metadata.get("tenantId"),
        payload.get("tenant_id"),
        payload.get("tenantId"),
    )


def _firm_from_claims(payload: dict[str, Any]) -> str | None:
    app_metadata = _claim_metadata(payload, "app_metadata")
    user_metadata = _claim_metadata(payload, "user_metadata")
    return _claim_string(
        app_metadata.get("firm_id"),
        app_metadata.get("firmId"),
        user_metadata.get("firm_id"),
        user_metadata.get("firmId"),
        payload.get("firm_id"),
        payload.get("firmId"),
    )


ACTIVE_ACCOUNT_STATUSES = {"active", "trialing"}
BLOCKED_ACCOUNT_STATUSES = {"pending", "suspended", "canceled"}
VALID_ACCOUNT_STATUSES = ACTIVE_ACCOUNT_STATUSES | BLOCKED_ACCOUNT_STATUSES
PLATFORM_BYPASS_ROLES = {"superadmin", "platform_admin", "ops"}


def _account_status_from_claims(payload: dict[str, Any]) -> str | None:
    app_metadata = _claim_metadata(payload, "app_metadata")
    user_metadata = _claim_metadata(payload, "user_metadata")
    status = _claim_string(
        app_metadata.get("subscription_status"),
        app_metadata.get("account_status"),
        user_metadata.get("subscription_status"),
        user_metadata.get("account_status"),
        payload.get("subscription_status"),
        payload.get("account_status"),
    )
    return status.lower() if status else None


def _account_active_from_claims(payload: dict[str, Any]) -> bool:
    app_metadata = _claim_metadata(payload, "app_metadata")
    user_metadata = _claim_metadata(payload, "user_metadata")
    for value in (
        app_metadata.get("workspace_active"),
        app_metadata.get("account_active"),
        app_metadata.get("active"),
        user_metadata.get("workspace_active"),
        user_metadata.get("account_active"),
        user_metadata.get("active"),
        payload.get("workspace_active"),
        payload.get("account_active"),
    ):
        if isinstance(value, bool):
            return value
        if isinstance(value, str) and value.strip().lower() in {"false", "0", "no", "disabled", "deactivated"}:
            return False
    return True


def _enforce_account_access(roles: tuple[str, ...], status: str | None, active: bool) -> None:
    if any(role in PLATFORM_BYPASS_ROLES for role in roles):
        return
    if not active:
        raise HTTPException(status_code=403, detail="Mercy workspace access is deactivated for this account.")
    if not status:
        raise HTTPException(status_code=403, detail="Mercy workspace access requires an active or trialing account.")
    normalized_status = status.strip().lower()
    if normalized_status not in VALID_ACCOUNT_STATUSES:
        raise HTTPException(status_code=403, detail="Mercy workspace account status is not recognized.")
    if normalized_status not in ACTIVE_ACCOUNT_STATUSES:
        raise HTTPException(status_code=403, detail="Mercy workspace access requires an active or trialing account.")


def _tenant_user_from_supabase_jwt(authorization: str | None) -> TenantUser:
    payload = _jwt_payload(_bearer_token(authorization))
    user_id = _claim_string(payload.get("sub"), payload.get("user_id"))
    tenant_id_claim = _tenant_from_claims(payload)
    firm_id = _firm_from_claims(payload)
    if not user_id:
        raise HTTPException(status_code=401, detail="JWT subject is required.")
    if not tenant_id_claim and not firm_id:
        raise HTTPException(status_code=401, detail="JWT tenant or firm claim is required.")
    roles = _roles_from_claims(payload)
    account_status = _account_status_from_claims(payload)
    account_active = _account_active_from_claims(payload)
    _enforce_account_access(roles, account_status, account_active)
    return TenantUser(
        tenant_id=tenant_id_claim or firm_id or "",
        user_id=user_id,
        auth_mode="supabase_jwt",
        roles=roles,
        firm_id=firm_id,
        tenant_id_is_firm_fallback=tenant_id_claim is None and firm_id is not None,
        account_status=account_status,
        account_active=account_active,
    )


async def get_current_tenant_user(
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
    tenant_id: str | None = Header(default=None, alias="X-Mercy-Tenant-Id"),
    firm_id: str | None = Header(default=None, alias="X-Mercy-Firm-Id"),
    user_id: str | None = Header(default=None, alias="X-Mercy-User-Id"),
    roles: str | None = Header(default=None, alias="X-Mercy-Roles"),
) -> TenantUser:
    """Central FastAPI dependency for tenant and user identity on legal endpoints."""

    if local_dev_auth_bypass_enabled():
        tenant_user = TenantUser(
            tenant_id=tenant_id or firm_id or LOCAL_DEV_TENANT_ID,
            user_id=user_id or LOCAL_DEV_USER_ID,
            auth_mode="local_dev",
            roles=_parse_roles(roles),
            firm_id=firm_id,
            tenant_id_is_firm_fallback=tenant_id is None and firm_id is not None,
        )
    else:
        config = get_config()
        auth_mode = config.mercy_auth_mode
        if auth_mode == "supabase":
            tenant_user = _tenant_user_from_supabase_jwt(authorization)
        elif auth_mode == "test":
            if config.mercy_env not in {"test", "verify"}:
                raise HTTPException(status_code=500, detail="Mercy test auth is not enabled for this environment.")
            _validate_bearer_token(authorization)
            if not (tenant_id or firm_id) or not user_id:
                raise HTTPException(status_code=401, detail="Missing tenant or user context for Mercy legal endpoint.")
            tenant_user = TenantUser(
                tenant_id=tenant_id or firm_id or "",
                user_id=user_id,
                auth_mode="test",
                roles=_parse_roles(roles),
                firm_id=firm_id,
                tenant_id_is_firm_fallback=tenant_id is None and firm_id is not None,
            )
        elif auth_mode == "token" and config.is_local:
            _validate_bearer_token(authorization)
            if not (tenant_id or firm_id) or not user_id:
                raise HTTPException(status_code=401, detail="Missing tenant or user context for Mercy legal endpoint.")
            tenant_user = TenantUser(
                tenant_id=tenant_id or firm_id or "",
                user_id=user_id,
                auth_mode="bearer",
                roles=_parse_roles(roles),
                firm_id=firm_id,
                tenant_id_is_firm_fallback=tenant_id is None and firm_id is not None,
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
            "firm_id": tenant_user.firm_id,
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
