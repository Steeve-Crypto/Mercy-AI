# Mercy AI Security Overview

Status date: 2026-05-14

Mercy AI is designed for D.C. attorneys handling confidential legal workflows. The current beta security posture is practical, tenant-scoped, and audit-focused.

## Core Controls

- Tenant isolation: every authenticated workflow carries tenant context and tenant-scoped matter access checks.
- Persistent storage: PostgreSQL/pgvector is the primary backend for matters, RAG chunks, sources, checkpoints, and audit logs.
- Audit logging: sensitive events are written to LangSmith/local observability and to DB audit logs when PostgreSQL is configured.
- RAG grounding: research uses official D.C. source records and citation provenance.
- Attorney review: generated content carries human review and verification warnings.
- Rate limiting: `/v1/*` endpoints are limited by tenant/IP/path to reduce abuse.
- Sanitization: LLM and RAG inputs and outputs pass through control-character cleanup and PII redaction hooks.
- Data deletion: beta users can invoke `DELETE /v1/account/data` to soft-delete matters and purge tenant-scoped transient records.

## Encryption In Transit

Mercy API responses include HSTS and other security headers. Production deployments should terminate TLS at the edge or load balancer and set:

```text
MERCY_REQUIRE_HTTPS=true
MERCY_ALLOWED_ORIGINS=https://app.example.com,https://office.example.com
```

## Encryption At Rest

Mercy relies on the configured PostgreSQL or Supabase provider for encryption at rest. Production setup should require:

- Database encryption at rest enabled.
- TLS-required database connections.
- Restricted database credentials and rotation.
- Automated backups and point-in-time recovery.
- Access logging for administrative database actions.

## Security Headers

Mercy emits:

- `Strict-Transport-Security`
- `Content-Security-Policy`
- `X-Content-Type-Options`
- `X-Frame-Options`
- `Referrer-Policy`
- `Permissions-Policy`

## CORS

Allowed origins are explicit and configured through `MERCY_ALLOWED_ORIGINS`. Wildcard origins should not be used for production legal data workflows.

## Vulnerability Checks

Run:

```bash
python -m scripts.check_security_compliance
```

The check reports required docs, security headers, Python security scan hook availability through Bandit, and Node audit hook availability for the web and Office add-in package roots.
