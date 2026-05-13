from __future__ import annotations

import json
import re
from typing import Any

from system_prompts import DC_LOCAL_RULE_SCHEMA

try:
    from fastapi import Request
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.responses import Response
except Exception:
    Request = Any
    Response = Any
    BaseHTTPMiddleware = object


CITATION_PATTERN = re.compile(
    r"\b(?:\d+\s+(?:F\.(?:2d|3d|4th|Supp\.?\s?\d*)|U\.S\.|A\.3d)|D\.C\.\s+Cir\.|D\.C\.)\b"
)


def _find_text_payload(payload: dict[str, Any]) -> str:
    for key in ("draft", "text", "case_summary", "output"):
        value = payload.get(key)
        if isinstance(value, str):
            return value
    facts = payload.get("facts")
    if isinstance(facts, dict):
        return json.dumps(facts, ensure_ascii=True)
    return json.dumps(payload, ensure_ascii=True)


def evaluate_dc_guardrails(payload: dict[str, Any]) -> dict[str, Any]:
    text = _find_text_payload(payload)
    lower = text.lower()
    has_verified_citation = bool(CITATION_PATTERN.search(text))
    has_verify_placeholder = "[verify cite]" in lower or "[insert" in lower
    has_record_placeholder = "[insert record" in lower or "record" in lower

    rule_28 = {
        "disclosure_statement": "disclosure" in lower,
        "table_of_contents": "table of contents" in lower,
        "table_of_authorities": "table of authorities" in lower,
        "jurisdictional_statement": "jurisdiction" in lower,
        "issues_presented": "issue" in lower,
        "statement_of_case": "statement" in lower or "facts" in lower,
        "summary_of_argument": "summary of argument" in lower,
        "argument_with_authorities_and_record_cites": (
            "argument" in lower and (has_verified_citation or has_verify_placeholder)
        ),
        "standard_of_review": "standard of review" in lower,
        "conclusion_relief_sought": "conclusion" in lower or "relief" in lower,
        "certificate_of_compliance": "certificate" in lower,
    }
    rule_32 = {
        "word_ready_text": isinstance(text, str) and bool(text.strip()),
        "citation_placeholders_marked": has_verified_citation or has_verify_placeholder,
        "record_placeholders_marked": has_record_placeholder,
        "certificate_metadata_available": "certificate" in lower
        or payload.get("draft_type") != "full_appellate_brief",
        "no_unverified_authority_presented_as_verified": "[verify cite]" in lower
        or has_verified_citation
        or "citation" not in lower,
    }
    ethics_388 = {
        "human_review_required": bool(payload.get("human_review_required", True)),
        "confidentiality_warning": True,
        "citation_verification_required": True,
        "fee_reasonableness_note": "premium_billing_hook" in payload,
        "supervising_attorney_required": True,
    }

    failures = [
        f"rule_28.{key}"
        for key, passed in rule_28.items()
        if not passed and payload.get("draft_type") == "full_appellate_brief"
    ]
    failures.extend(f"rule_32.{key}" for key, passed in rule_32.items() if not passed)
    failures.extend(f"ethics_388.{key}" for key, passed in ethics_388.items() if not passed)

    return {
        "schema": DC_LOCAL_RULE_SCHEMA,
        "rule_28": rule_28,
        "rule_32": rule_32,
        "ethics_388": ethics_388,
        "status": "pass" if not failures else "review_required",
        "review_flags": failures,
    }


def apply_dc_guardrails(payload: Any) -> Any:
    if not isinstance(payload, dict):
        return payload
    guarded = dict(payload)
    guarded["dc_guardrails"] = evaluate_dc_guardrails(guarded)
    guarded.setdefault("human_review_required", True)
    return guarded


class DCGuardrailMiddleware(BaseHTTPMiddleware):
    """Attach D.C. Rule 28/32 and Ethics Opinion 388 checks to JSON API output."""

    async def dispatch(self, request: Request, call_next) -> Response:
        from starlette.responses import JSONResponse

        response = await call_next(request)
        content_type = response.headers.get("content-type", "")
        if not request.url.path.startswith("/v1/") or "application/json" not in content_type:
            return response

        body = b""
        async for chunk in response.body_iterator:
            body += chunk

        try:
            payload = json.loads(body.decode("utf-8"))
        except Exception:
            return Response(
                content=body,
                status_code=response.status_code,
                media_type=content_type,
                headers=dict(response.headers),
            )

        headers = {
            key: value
            for key, value in response.headers.items()
            if key.lower() not in {"content-length", "content-type"}
        }
        return JSONResponse(
            content=apply_dc_guardrails(payload),
            status_code=response.status_code,
            headers=headers,
        )
