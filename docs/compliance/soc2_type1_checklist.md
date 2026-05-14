# Mercy AI SOC 2 Type 1 Readiness Checklist

Status date: 2026-05-14

Mercy AI is in practical SOC 2 Type 1 preparation for a limited beta with D.C. solo and small-firm attorneys. This checklist is not a SOC 2 report and does not claim certification.

## Control Environment

| Area | Current Status | Evidence / Notes |
| --- | --- | --- |
| Governance owner | Partial | Product/security owner is implicit; formal security owner and auditor liaison still need assignment before audit. |
| Asset inventory | Partial | Core assets are known: FastAPI core, PostgreSQL/pgvector, LangSmith traces, Standalone Web, Office Add-in. Formal inventory register still needed. |
| Risk assessment | Partial | Product risks are identified around attorney confidentiality, citation accuracy, tenant isolation, and AI output review. Formal risk matrix still needed. |
| Vendor management | Partial | Key vendors are LLM providers, LangSmith, PostgreSQL/Supabase hosting, and deployment hosting. Vendor review files still needed. |

## Security

| Control | Current Status | Evidence / Notes |
| --- | --- | --- |
| Tenant isolation | Implemented | Matters, RAG records, checkpoints, beta quotas, and audit logs use tenant-scoped context. |
| Audit logging | Implemented | Sensitive actions emit LangSmith/local traces and DB audit rows when PostgreSQL is configured. |
| Encryption in transit | Implemented / deploy-dependent | HSTS/security headers are emitted. Set `MERCY_REQUIRE_HTTPS=true` behind production proxy. |
| Encryption at rest | Deploy-dependent | PostgreSQL provider encryption must be enabled by host; guidance documented in `security_overview.md`. |
| Input/output sanitization | Implemented | LLM and RAG payloads run through control-character cleanup and PII redaction hooks. |
| Rate limiting | Implemented | `/v1/*` endpoints enforce tenant/IP path rate limiting; default is 180 requests/minute. |
| Data deletion | Implemented | `DELETE /v1/account/data` soft-deletes matters and purges or deactivates tenant-scoped transient records. |
| Security headers / CSP / CORS | Implemented | Headers are set by middleware; CORS uses explicit allow-list via `MERCY_ALLOWED_ORIGINS`. |

## Availability

| Control | Current Status | Evidence / Notes |
| --- | --- | --- |
| Persistent storage | Implemented | PostgreSQL/pgvector is primary; local in-memory fallback is restricted to `MERCY_ENV=local`. |
| Backup and restore | Not started | Must be configured with the PostgreSQL host before SOC 2 audit. |
| Incident response | Partial | Logging supports investigation. Formal incident runbook and customer notification policy still needed. |

## Confidentiality and Privacy

| Control | Current Status | Evidence / Notes |
| --- | --- | --- |
| Attorney-client sensitive data handling | Partial | Product uses tenant isolation, redaction hooks, and review warnings. Formal confidentiality policy and training still needed. |
| Privacy policy | Prepared | Customer-facing beta privacy policy added. Legal review required before publication. |
| Data retention | Partial | Application deletion flow exists; final retention windows and purge automation still need approval. |
| AI provider data controls | Partial | Provider keys are environment based. Must confirm no-training/data retention settings with each provider. |

## Automated Checks

| Check | Current Status | Evidence / Notes |
| --- | --- | --- |
| Compliance CLI | Implemented | Run `python -m scripts.check_security_compliance`. |
| Python static security hook | Hooked | CLI detects and can run Bandit when installed. |
| Node dependency audit hook | Hooked | CLI detects `npm audit --json` for web and add-in package roots. |
| Headers and CORS configuration | Implemented | CLI verifies the control module exposes configured headers and origin policy guidance. |

## Remaining Work Before SOC 2 Type 1 Audit

- Select audit firm and scope Trust Services Criteria.
- Finalize formal policies: access control, vendor risk, incident response, secure SDLC, backup/restore, change management, retention, and confidentiality.
- Configure hosted PostgreSQL encryption, backups, point-in-time recovery, and access logs.
- Define production identity provider controls, MFA requirements, and admin access review cadence.
- Produce evidence exports from LangSmith, DB audit logs, deployment logs, and vulnerability scans.
- Complete legal review of beta terms, DPA, privacy policy, and security overview.
