# Mercy Legal AI Build Documentation

Mercy Legal AI is a D.C.-native legal AI platform for solo attorneys and small firms. The current build follows a **One Brain, Multiple Surfaces** model:

- **Brain**: FastAPI Shared Intelligence Core in `main.py`.
- **Agent X**: LangGraph-compatible legal agent network in `agent_network.py` with Hermes intelligence in `hermes_intelligence.py`.
- **Standalone Web App**: Next.js app in `mercy-legal-web/`.
- **Office Add-in**: Vite/React Microsoft Word add-in in `mercy-legal-plugin/`.
- **Discovery Engine**: Brownfield legal discovery engine in `legal_discovery_ai/`.

Current posture: **strong backend and agent layer; stable but still basic frontend; beta productization in progress**.

## Product Position

Mercy is designed for D.C. solo attorneys and small firms that need practical AI help with matter intake, legal research, document review, drafting, citation/source verification, and Word-based drafting workflows.

Mercy is inspired by high-trust professional legal AI products, but it starts with a narrower wedge:

- D.C. law and practice.
- Matter-centered workflows.
- Small-firm affordability.
- Attorney-review-required output.
- Visible route, source, guardrail, and citation metadata.
- Office add-in workflow for drafting in Word.

## Current System Map

| Area | Path | Current State |
| --- | --- | --- |
| FastAPI Core | `main.py` | Live local/beta API with router, matters, intake, RAG, agents, beta, monitoring, security, templates, discovery, and drafting endpoints. |
| Router | `legal_task_router.py` | MoE task routing with route mode, expert, confidence, missing inputs, guardrail profile, citations, fallback, and capability metadata. |
| Response Envelope | `response_envelope.py` | Standard legal output metadata for route, expert, confidence, guardrails, citations, ethics, matter snapshot, and audit timestamp. |
| Matter Context | `mercy_context.py`, `mercy_storage.py` | Tenant-aware matter context with PostgreSQL/pgvector persistence when configured and local fallback for explicit local dev. |
| D.C. RAG | `dc_knowledge_rag.py` | D.C. source registry, ingestion, retrieval, backend status, pgvector path, optional adapter boundaries, and local fallback. |
| RAGAS/Evals | `ragas_eval.py`, `evals/` | Deterministic RAGAS-style reports, 45-case quick dataset, and 200-case advanced regression suite. |
| Agent X | `agent_network.py`, `hermes_intelligence.py` | ReACT agents, Hermes reflection/memory hooks, MCP-compatible skills, sandboxed skill execution, LLM provider fallback. |
| LLM Providers | `llm_providers.py` | LiteLLM abstraction for OpenAI, Anthropic, Groq, Gemini, and compatible providers. |
| Templates | `template_gallery.py`, `prompts/` | D.C. prompt registry, few-shot examples, and template gallery. |
| Beta | `beta_launch.py` | Invite/waitlist, quota, legal docs, feedback, and analytics endpoints. |
| Monitoring | `monitoring.py` | Cost events, metrics, alerts, beta state, and admin endpoints. |
| Security | `security_controls.py`, `docs/compliance/` | Rate limiting, headers, redaction hooks, audit logging, deletion flow, SOC 2 preparation docs. |
| Web App | `mercy-legal-web/` | Next.js app connected to core; needs auth, App Router restructuring, matter workflow polish, entitlements, and beta UX. |
| Office Add-in | `mercy-legal-plugin/` | Word add-in connected to core agent network; needs HTTPS production hosting and release packaging. |

## Important Endpoints

```text
GET  /health
GET  /v1/product/capabilities
GET  /v1/security/compliance
GET  /v1/monitoring/dashboard
GET  /v1/monitoring/metrics
GET  /v1/monitoring/cost/breakdown
DELETE /v1/account/data
GET  /v1/beta/status
POST /v1/beta/waitlist
POST /v1/beta/invites
POST /v1/beta/invites/accept
GET  /v1/beta/legal/{document_kind}
POST /v1/beta/feedback
GET  /v1/beta/analytics
GET  /v1/templates/gallery
POST /v1/matters
GET  /v1/matters
GET  /v1/matters/{matter_id}
POST /v1/matter/intake
POST /v1/matter/intake/full
POST /v1/router/inspect
POST /v1/rag/retrieve
GET  /v1/rag/status
POST /v1/rag/ingest
POST /v1/rag/evaluate
GET  /v1/observability/trace
POST /v1/observability/trace
GET  /v1/agent/skills
POST /v1/agent/execute
POST /v1/workspace/discovery
POST /v1/workspace/discovery/upload
POST /v1/workspace/draft
```

## Verification

Canonical full verification:

```powershell
.\legal_discovery_ai\.venv\Scripts\python.exe scripts\verify.py
```

This checks backend tests, compile, Pyright, Ruff, core smoke endpoints, quick RAGAS, web typecheck/lint/build, Office add-in lint/build, and manifest validation.

Other useful commands:

```powershell
python -m scripts.check_security_compliance
python -m scripts.monitoring status --days=7
python -m evals.run_regression --corpus=full --json
python -m scripts.seed_dc_knowledge --source=all --refresh
```

## Current Limitations

The old build docs described Mercy as mostly in-memory/basic. That is no longer accurate for the core. The current limitations are more specific:

- The Next.js frontend is connected to the core but still needs professional authenticated product structure.
- Sign-in/sign-up are not yet production-ready.
- Stripe checkout exists but entitlement enforcement is not fully connected.
- The Office add-in is core-connected but still needs production HTTPS hosting and release packaging.
- D.C. source grounding is strong for seeded/local regression, but full official body-text extraction and citation finalization remain hardening work.
- Production storage requires finalized retention, backup, deletion, export, and support processes before broad client-data use.
- End-to-end web/Office beta workflow tests should be added before external beta.

## Next Recommended Build Steps

1. Restructure `mercy-legal-web` into clean `(marketing)`, `(auth)`, `(app)`, and `(admin)` route groups.
2. Add real web auth and tenant/session propagation.
3. Build a polished matter-centered workspace.
4. Improve document/source-anchor UX.
5. Standardize reliability metadata across all web workflows.
6. Prepare Office add-in HTTPS production release package.
7. Connect Stripe/beta quotas to tenant capability gates.
8. Upgrade D.C. source verification and official text handling.
9. Add end-to-end beta workflow verification.
10. Use `docs/beta-readiness-checklist.md` before inviting real attorneys.

