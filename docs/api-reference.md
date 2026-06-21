# Mercy Legal AI API Reference

This is a concise reference for the current FastAPI Shared Intelligence Core. It is not a full OpenAPI export.

Base local URL:

```text
http://127.0.0.1:8000
```

## Auth Headers

Protected endpoints expect tenant/user context outside explicit local dev:

```text
Authorization: Bearer <token>
X-Mercy-Tenant-Id: <tenant>
X-Mercy-User-Id: <user>
X-Mercy-Roles: attorney | admin | ops
```

## Health and Capabilities

```text
GET /health
GET /v1/product/capabilities
```

## Matters and Intake

```text
POST /v1/matters
GET  /v1/matters
GET  /v1/matters/{matter_id}
GET  /v1/matters/{matter_id}/billing-report
POST /v1/matter/intake
POST /v1/matter/intake/full
```

Use these endpoints to create matter context, complete intake, and retrieve tenant-scoped matter state.

## Router

```text
POST /v1/router/inspect
```

Returns MoE route metadata: route mode, expert, confidence, selected capability, missing inputs, guardrails, citations, fallback path, and response envelope.

## RAG and Source Grounding

```text
POST /v1/rag/retrieve
GET  /v1/rag/status
POST /v1/rag/ingest
POST /v1/rag/evaluate
```

Use RAG endpoints for D.C. source retrieval, source status, ingestion, and RAGAS-style evaluation.

## Agent X

```text
GET  /v1/agent/skills
POST /v1/agent/execute
```

Agent X executes routed legal tasks through specialized agents, ReACT loops, Hermes intelligence, sandboxed MCP-compatible skills, and response envelopes.

## Templates

```text
GET /v1/templates/gallery
```

Returns D.C.-specific templates with practice area, difficulty, required inputs, prompt template metadata, and attorney-review requirements.

## Beta

```text
GET  /v1/beta/status
POST /v1/beta/waitlist
POST /v1/beta/invites
POST /v1/beta/invites/accept
GET  /v1/beta/legal/{document_kind}
POST /v1/beta/feedback
GET  /v1/beta/analytics
```

## Monitoring and Security

```text
GET    /v1/security/compliance
GET    /v1/monitoring/dashboard
GET    /v1/monitoring/metrics
GET    /v1/monitoring/cost/breakdown
DELETE /v1/account/data
GET    /v1/observability/trace
POST   /v1/observability/trace
```

Monitoring endpoints should be admin-only outside local dev.

## Workspace and Discovery

```text
POST /v1/workspace/discovery
POST /v1/workspace/discovery/upload
POST /v1/workspace/draft
GET  /v1/workspace/clerk-os
GET  /v1/vault/documents
PATCH /v1/vault/documents/{document_id}/matter
GET  /v1/matters/{matter_id}/documents
GET  /v1/matters/{matter_id}/documents/{document_id}/preview
DELETE /v1/matters/{matter_id}/documents/{document_id}
```

These endpoints preserve compatibility with the brownfield discovery and drafting workflows.
`POST /v1/workspace/discovery/upload` currently accepts PDF uploads only; non-PDF filenames are rejected. DOCX, TXT, and OCR ingestion remain future Vault hardening items.
Vault list, attachment, preview, and delete operations derive tenant/user scope from authenticated server context. Client-supplied tenant, firm, or user IDs are not accepted as Vault operation parameters.

## Response Envelope

Legal outputs should preserve:

- `route`
- `expert`
- `confidence_score`
- `guardrail_status`
- `citations`
- `dc_ethics_metadata`
- `matter_context_snapshot`
- `audit_timestamp`
- `human_review_required`
