# Mercy Security and Compliance Overview for Users

Mercy Legal AI is designed for attorney-supervised legal workflows. This overview explains the current beta security posture in plain language.

## Current Posture

Mercy is a local/beta-candidate product. The backend includes practical security controls, but real-client production use requires the beta readiness checklist to pass for the relevant tenant and deployment.

## Core Protections

- Tenant-scoped matter access.
- Authentication guard for protected legal endpoints outside local dev.
- Attorney-review requirements on legal output.
- Citation and record verification warnings.
- D.C. ethics and confidentiality reminders.
- Security headers and CORS hardening.
- Rate limiting for `/v1/*` endpoints.
- PII redaction and sanitization hooks.
- Audit traces and database audit logs when persistent storage is configured.
- Tenant data deletion endpoint.

## Data Handling

Mercy does not use client documents, prompts, matter facts, or legal work product for model training by Mercy.

Beta users should confirm the active data posture before using real client information:

- Local/demo mode.
- Beta persistent mode.
- Production-hardened mode.

## Source and Citation Limits

Mercy can return D.C. source-grounding metadata and candidate citations. Attorneys must verify official source text, current law, pinpoint citations, quotations, record support, and legal conclusions before use.

## Office Add-in Local Storage

The Word add-in is designed to avoid storing raw confidential selected text, document text, or generated legal content in localStorage. Offline queues store redacted metadata and require rerunning with the active document after reconnecting.

## User Responsibilities

Attorneys using Mercy must:

- Review all output.
- Verify citations and source text.
- Verify record support.
- Protect confidential information.
- Confirm conflicts and engagement scope.
- Apply professional judgment.
- Ensure client billing complies with engagement terms and fee-reasonableness rules.

