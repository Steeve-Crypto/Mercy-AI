from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import json
from typing import Any

import jwt
from fastapi import HTTPException

from mercy_config import get_config
from mercy_storage import (
    get_microsoft_identity_mapping,
    mark_microsoft_identity_login,
    persistent_storage_configured,
    validate_microsoft_identity_mapping_scope,
)
from observability import trace_event

ACTIVE_ACCOUNT_STATUSES = {"active", "trialing"}


@dataclass(frozen=True)
class MicrosoftIdentity:
    tid: str
    oid: str
    subject: str
    email: str | None


@dataclass(frozen=True)
class MercyIdentityMapping:
    user_id: str
    tenant_id: str | None
    firm_id: str | None
    roles: tuple[str, ...]
    status: str = "active"


def _b64url(payload: dict[str, Any]) -> str:
    return base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")).rstrip(b"=").decode("ascii")


def _mapping_config() -> dict[str, Any]:
    config = get_config()
    if not (config.is_local and config.allow_dev_microsoft_identity_map_json):
        raise HTTPException(status_code=403, detail="Microsoft identity is not mapped to a Mercy tenant.")
    raw = get_config().microsoft_identity_map_json
    if raw is None or not raw.get_secret_value().strip():
        raise HTTPException(status_code=403, detail="Microsoft identity is not mapped to a Mercy tenant.")
    try:
        payload = json.loads(raw.get_secret_value())
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="Microsoft identity mapping is invalid.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=500, detail="Microsoft identity mapping must be an object.")
    return payload


def _roles(value: Any) -> tuple[str, ...]:
    if isinstance(value, list):
        return tuple(str(role).strip() for role in value if str(role).strip()) or ("attorney",)
    if isinstance(value, str):
        return tuple(role.strip() for role in value.split(",") if role.strip()) or ("attorney",)
    return ("attorney",)


def _safe_mapping(record: dict[str, Any], identity: MicrosoftIdentity) -> MercyIdentityMapping:
    firm_id = str(record.get("firm_id") or "").strip() or None
    raw_tenant_id = str(record.get("tenant_id") or "").strip() or None
    if raw_tenant_id:
        try:
            validate_microsoft_identity_mapping_scope(
                firm_id=firm_id,
                tenant_id=raw_tenant_id,
                effective_scope_type=str(record.get("effective_scope_type") or "").strip() or None,
                effective_scope_id=str(record.get("effective_scope_id") or "").strip() or None,
            )
        except ValueError:
            raise HTTPException(status_code=403, detail="Microsoft identity mapping is missing tenant scope.")
    elif not firm_id:
        raise HTTPException(status_code=403, detail="Microsoft identity mapping is missing firm or tenant scope.")
    user_id = str(record.get("user_id") or f"ms:{identity.tid}:{identity.oid}").strip()
    return MercyIdentityMapping(user_id=user_id, tenant_id=raw_tenant_id, firm_id=firm_id, roles=_roles(record.get("roles")), status="active")


def _safe_db_mapping(record: dict[str, Any]) -> MercyIdentityMapping:
    status = str(record.get("status") or "").strip().lower()
    if status not in ACTIVE_ACCOUNT_STATUSES:
        raise HTTPException(status_code=403, detail="Microsoft identity mapping is not active.")
    firm_id = str(record.get("firm_id") or "").strip() or None
    tenant_id = str(record.get("tenant_id") or "").strip() or None
    try:
        scope_type, scope_id = validate_microsoft_identity_mapping_scope(
            firm_id=firm_id,
            tenant_id=tenant_id,
            effective_scope_type=str(record.get("effective_scope_type") or "").strip() or None,
            effective_scope_id=str(record.get("effective_scope_id") or "").strip() or None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="Microsoft identity mapping is invalid.") from exc
    if not tenant_id:
        raise HTTPException(status_code=403, detail="Microsoft identity mapping is invalid.")
    if scope_type == "firm" and not firm_id:
        raise HTTPException(status_code=403, detail="Microsoft identity mapping is invalid.")
    if scope_type == "solo" and not tenant_id:
        raise HTTPException(status_code=403, detail="Microsoft identity mapping is invalid.")
    user_id = str(record.get("mercy_user_id") or "").strip()
    if not user_id:
        raise HTTPException(status_code=403, detail="Microsoft identity mapping is invalid.")
    return MercyIdentityMapping(user_id=user_id, tenant_id=tenant_id, firm_id=firm_id, roles=_roles(record.get("roles")), status=status)


def map_microsoft_identity(identity: MicrosoftIdentity) -> MercyIdentityMapping:
    if persistent_storage_configured():
        record = get_microsoft_identity_mapping(identity.tid, identity.oid)
        if record is None:
            raise HTTPException(status_code=403, detail="Microsoft identity is not mapped to a Mercy tenant.")
        return _safe_db_mapping(record)

    config = get_config()
    if not (config.is_local and config.allow_dev_microsoft_identity_map_json):
        raise HTTPException(status_code=500, detail="Microsoft identity provisioning storage is not configured.")

    config = _mapping_config()
    users = config.get("users") if isinstance(config.get("users"), list) else []
    email = (identity.email or "").strip().lower()
    for candidate in users:
        if not isinstance(candidate, dict):
            continue
        candidate_tid = str(candidate.get("tid") or "").strip()
        candidate_oid = str(candidate.get("oid") or "").strip()
        candidate_email = str(candidate.get("email") or "").strip().lower()
        if candidate_tid == identity.tid and candidate_oid == identity.oid:
            return _safe_mapping(candidate, identity)
        if email and candidate_email == email:
            return _safe_mapping(candidate, identity)

    raise HTTPException(status_code=403, detail="Microsoft identity is not mapped to a Mercy tenant.")


def verify_microsoft_bootstrap_token(token: str) -> MicrosoftIdentity:
    config = get_config()
    if not config.office_naa_enabled:
        raise HTTPException(status_code=503, detail="Microsoft Office SSO is not enabled.")
    if not config.microsoft_entra_tenant_id or not config.microsoft_entra_client_id or not config.microsoft_entra_issuer or not config.microsoft_entra_jwks_url:
        raise HTTPException(status_code=500, detail="Microsoft Office SSO is not configured.")
    try:
        key = jwt.PyJWKClient(config.microsoft_entra_jwks_url).get_signing_key_from_jwt(token).key
        payload = jwt.decode(
            token,
            key=key,
            algorithms=["RS256"],
            audience=config.microsoft_entra_client_id,
            issuer=config.microsoft_entra_issuer,
            options={"require": ["exp", "iat"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Microsoft token has expired.") from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid Microsoft token.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=401, detail="Invalid Microsoft token.")
    tid = str(payload.get("tid") or "").strip()
    oid = str(payload.get("oid") or "").strip()
    subject = str(payload.get("sub") or "").strip()
    if tid != config.microsoft_entra_tenant_id:
        raise HTTPException(status_code=401, detail="Invalid Microsoft tenant.")
    if not oid and not subject:
        raise HTTPException(status_code=401, detail="Microsoft token subject is required.")
    email = payload.get("preferred_username") or payload.get("email") or payload.get("upn")
    return MicrosoftIdentity(tid=tid, oid=oid or subject, subject=subject or oid, email=str(email).strip().lower() if email else None)


def issue_mercy_session_token(identity: MicrosoftIdentity, mapping: MercyIdentityMapping) -> str:
    config = get_config()
    if config.supabase_jwt_secret is None or not config.supabase_jwt_secret.get_secret_value():
        raise HTTPException(status_code=500, detail="Supabase JWT verification is not configured.")
    now = datetime.now(UTC)
    exp = now + timedelta(minutes=15)
    app_metadata: dict[str, Any] = {
        "roles": list(mapping.roles),
        "account_type": "firm" if mapping.firm_id else "solo",
        "account_status": mapping.status,
        "workspace_active": True,
    }
    if mapping.tenant_id:
        app_metadata["tenant_id"] = mapping.tenant_id
    if mapping.firm_id:
        app_metadata["firm_id"] = mapping.firm_id
    payload = {
        "aud": "authenticated",
        "sub": mapping.user_id,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "app_metadata": app_metadata,
        "user_metadata": {"microsoft_tid": identity.tid},
    }
    if config.supabase_url:
        payload["iss"] = f"{config.supabase_url.rstrip('/')}/auth/v1"
    signing_input = f"{_b64url({'alg': 'HS256', 'typ': 'JWT'})}.{_b64url(payload)}"
    import hashlib
    import hmac

    signature = hmac.new(config.supabase_jwt_secret.get_secret_value().encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode('ascii')}"


def exchange_microsoft_token_for_mercy_session(token: str) -> dict[str, Any]:
    if not token.strip():
        raise HTTPException(status_code=401, detail="Microsoft token is required.")
    identity = verify_microsoft_bootstrap_token(token.strip())
    mapping = map_microsoft_identity(identity)
    access_token = issue_mercy_session_token(identity, mapping)
    if persistent_storage_configured():
        mark_microsoft_identity_login(identity.tid, identity.oid)
    trace_event(
        name="office_microsoft_sso_exchanged",
        surface_context="office_auth",
        category="auth",
        metadata={
            "microsoft_tenant_id": identity.tid,
            "tenant_id": mapping.tenant_id,
            "firm_mapped": bool(mapping.firm_id),
            "roles": list(mapping.roles),
        },
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": 900,
        "auth_mode": "microsoft_naa",
    }
