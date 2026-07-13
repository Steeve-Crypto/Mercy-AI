from __future__ import annotations

import hashlib
import os
import re
import time
from collections import deque
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from observability import trace_event


SECURITY_CONTROLS_VERSION = "mercy-security-controls-1.0"
DEFAULT_RATE_LIMIT_PER_MINUTE = 180
PII_REDACTION_LABELS = {
    "email": "[REDACTED_EMAIL]",
    "phone": "[REDACTED_PHONE]",
    "ssn": "[REDACTED_SSN]",
    "credit_card": "[REDACTED_PAYMENT_CARD]",
}
PII_PATTERNS = {
    "email": re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE),
    "phone": re.compile(r"(?<!\d)(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}(?!\d)"),
    "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "credit_card": re.compile(r"\b(?:\d[ -]*?){13,16}\b"),
}
CONTROL_CHAR_PATTERN = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def sanitize_text(value: Any, *, max_length: int = 20_000) -> str:
    text = "" if value is None else str(value)
    text = CONTROL_CHAR_PATTERN.sub(" ", text).strip()
    for key, pattern in PII_PATTERNS.items():
        text = pattern.sub(PII_REDACTION_LABELS[key], text)
    if len(text) > max_length:
        return f"{text[:max_length]}...[TRUNCATED]"
    return text


def redact_pii(value: Any, *, max_text_length: int = 20_000) -> Any:
    if isinstance(value, str):
        return sanitize_text(value, max_length=max_text_length)
    if isinstance(value, list):
        return [redact_pii(item, max_text_length=max_text_length) for item in value[:100]]
    if isinstance(value, tuple):
        return tuple(redact_pii(item, max_text_length=max_text_length) for item in value[:100])
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, item in list(value.items())[:200]:
            key_text = str(key)
            if key_text.lower() in {"password", "secret", "token", "api_key", "authorization", "access_token"}:
                redacted[key_text] = "[REDACTED_SECRET]"
            else:
                redacted[key_text] = redact_pii(item, max_text_length=max_text_length)
        return redacted
    return value


def sanitize_payload(payload: dict[str, Any] | None, *, max_text_length: int = 20_000) -> dict[str, Any]:
    redacted = redact_pii(payload or {}, max_text_length=max_text_length)
    return redacted if isinstance(redacted, dict) else {}


def _tenant_id(tenant_context: dict[str, Any] | None) -> str | None:
    return str(tenant_context.get("tenant_id")) if isinstance(tenant_context, dict) and tenant_context.get("tenant_id") else None


def _user_id(tenant_context: dict[str, Any] | None) -> str | None:
    return str(tenant_context.get("user_id")) if isinstance(tenant_context, dict) and tenant_context.get("user_id") else None


def _hash_identifier(value: str | None) -> str | None:
    if not value:
        return None
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def record_security_audit(
    action: str,
    *,
    tenant_context: dict[str, Any] | None = None,
    matter_id: str | None = None,
    category: str = "security",
    metadata: dict[str, Any] | None = None,
    guardrail_status: str | None = None,
) -> dict[str, Any]:
    audit_id = str(uuid4())
    now = datetime.now(UTC).isoformat()
    tenant_id = _tenant_id(tenant_context)
    user_id = _user_id(tenant_context)
    safe_metadata = sanitize_payload(metadata or {}, max_text_length=4000)
    payload = {
        "audit_id": audit_id,
        "action": action,
        "category": category,
        "tenant_id": tenant_id,
        "user_id_hash": _hash_identifier(user_id),
        "matter_id": matter_id,
        "created_at": now,
        "metadata": safe_metadata,
    }
    trace_event(
        name=f"audit_{action}",
        surface_context="security_audit",
        category=category,
        guardrail_status=guardrail_status,
        matter_reference=matter_id,
        metadata=payload,
    )
    try:
        from mercy_storage import record_audit_log

        record_audit_log(
            audit_id=audit_id,
            tenant_id=tenant_id,
            user_id=user_id,
            action=action,
            category=category,
            matter_id=matter_id,
            metadata=safe_metadata,
            created_at=now,
        )
    except Exception:
        trace_event(
            name="audit_db_log_unavailable",
            surface_context="security_audit",
            category="security",
            guardrail_status="warn",
            matter_reference=matter_id,
            metadata={"audit_id": audit_id, "action": action, "tenant_id": tenant_id},
        )
    return payload


def security_headers() -> dict[str, str]:
    return {
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Content-Security-Policy": (
            "default-src 'self'; "
            "img-src 'self' data: https:; "
            "style-src 'self' 'unsafe-inline'; "
            "script-src 'self'; "
            "connect-src 'self' https: http://localhost:* http://127.0.0.1:*; "
            "frame-ancestors 'none';"
        ),
    }


class InMemoryRateLimiter:
    def __init__(self, *, max_buckets: int = 10_000) -> None:
        self._events: dict[str, deque[float]] = {}
        self._last_seen: dict[str, float] = {}
        self._max_buckets = max(1, max_buckets)
        self._checks = 0

    def _remove_bucket(self, key: str) -> None:
        self._events.pop(key, None)
        self._last_seen.pop(key, None)

    def _maintain_bucket_bound(self, now: float, window_seconds: int, incoming_key: str) -> None:
        self._checks += 1
        if self._checks % 256 == 0:
            stale_keys = [key for key, last_seen in self._last_seen.items() if now - last_seen > window_seconds]
            for key in stale_keys:
                self._remove_bucket(key)
        if incoming_key not in self._events and len(self._events) >= self._max_buckets:
            oldest_key = min(self._last_seen, key=self._last_seen.__getitem__)
            self._remove_bucket(oldest_key)

    def check(self, key: str, *, limit: int, window_seconds: int = 60) -> tuple[bool, int]:
        now = time.monotonic()
        self._maintain_bucket_bound(now, window_seconds, key)
        bucket = self._events.setdefault(key, deque())
        self._last_seen[key] = now
        while bucket and now - bucket[0] > window_seconds:
            bucket.popleft()
        if len(bucket) >= limit:
            retry_after = max(1, int(window_seconds - (now - bucket[0]))) if bucket else window_seconds
            return False, retry_after
        bucket.append(now)
        return True, 0


RATE_LIMITER = InMemoryRateLimiter()


def request_rate_limit_key(*, client_host: str, path: str, authorization: str | None) -> str:
    """Use an authenticated session key when present, otherwise isolate anonymous clients by address."""
    scheme, separator, credential = (authorization or "").strip().partition(" ")
    if separator and scheme.lower() == "bearer" and credential.strip():
        fingerprint = hashlib.sha256(credential.strip().encode("utf-8")).hexdigest()[:16]
        return f"session:{fingerprint}:{path}"
    return f"client:{client_host}:{path}"


def check_rate_limit(key: str, *, limit: int | None = None, window_seconds: int = 60) -> tuple[bool, int]:
    configured = int(os.getenv("MERCY_RATE_LIMIT_PER_MINUTE") or DEFAULT_RATE_LIMIT_PER_MINUTE)
    return RATE_LIMITER.check(key, limit=limit or configured, window_seconds=window_seconds)


def security_compliance_status() -> dict[str, Any]:
    return {
        "version": SECURITY_CONTROLS_VERSION,
        "soc2_type1_readiness": "preparation_in_progress",
        "controls": {
            "audit_logging": "LangSmith trace events plus DB-backed audit logs when PostgreSQL is configured",
            "https": "HSTS headers enabled; MERCY_REQUIRE_HTTPS=true rejects non-HTTPS /v1 traffic behind a proxy",
            "encryption_at_rest": "PostgreSQL provider encryption required; see docs/compliance/security_overview.md",
            "pii_redaction": "LLM and RAG inputs/outputs pass through sanitization hooks",
            "rate_limiting": f"/v1/* limited by client address for bearer-less traffic or bearer fingerprint for authenticated traffic, default {DEFAULT_RATE_LIMIT_PER_MINUTE}/minute",
            "delete_all_data": "DELETE /v1/account/data soft-deletes tenant matters and purges tenant-scoped transient RAG/checkpoint records",
            "cors": "Explicit origin allow-list via MERCY_ALLOWED_ORIGINS",
        },
        "customer_documents": [
            "docs/compliance/soc2_type1_checklist.md",
            "docs/compliance/soc2_readiness_statement.md",
            "docs/compliance/privacy_policy.md",
            "docs/compliance/security_overview.md",
        ],
        "attorney_trust_signal": "Matter data is tenant-scoped, audited, redacted before AI calls, and subject to attorney review.",
    }
