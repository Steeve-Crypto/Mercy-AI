from __future__ import annotations

import os
from dataclasses import asdict, dataclass
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


def _validate_bearer_token(authorization: str | None) -> None:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer authorization for Mercy legal endpoint.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty bearer authorization for Mercy legal endpoint.")
    expected = get_config().effective_api_token
    if expected and token != expected:
        raise HTTPException(status_code=401, detail="Invalid bearer authorization for Mercy legal endpoint.")


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
        _validate_bearer_token(authorization)
        if not tenant_id or not user_id:
            raise HTTPException(status_code=401, detail="Missing tenant or user context for Mercy legal endpoint.")
        tenant_user = TenantUser(
            tenant_id=tenant_id,
            user_id=user_id,
            auth_mode="bearer",
            roles=_parse_roles(roles),
        )

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
