# Mercy Legal AI

Mercy Legal AI is a D.C.-native legal AI platform for solo attorneys and small firms. It is designed as a practical alternative to enterprise legal AI: one shared legal intelligence core powering a standalone web workspace and a Microsoft Word add-in.

Current product posture: **strong backend, stable basic frontend, beta-readiness in progress**.

## What Mercy Is

Mercy helps D.C. attorneys:

- Open and manage matter context.
- Capture structured intake facts, parties, deadlines, posture, documents, and sensitivity flags.
- Route legal work through a shared MoE legal task router.
- Research D.C. law with official-source metadata and visible grounding signals.
- Draft attorney-review-required legal work product.
- Analyze documents and selected Word text.
- Verify citations and guardrails before use.
- Track beta usage, feedback, cost, monitoring, and security posture.

Mercy is not a replacement for attorney judgment. Every legal output is attorney-review-required and must be verified against controlling law, record support, citations, and current official sources before use.

## Architecture

Mercy follows a **One Brain, Multiple Surfaces** model:

| Layer | Path | Status |
| --- | --- | --- |
| Shared Intelligence Core | `main.py` and root Python modules | Strong local/beta backend. FastAPI endpoints for routing, matter context, RAG, agents, templates, monitoring, beta, and security controls. |
| Agent X / Agent Network | `agent_network.py`, `hermes_intelligence.py`, `agents/` | LangGraph-compatible ReACT agents with Hermes reasoning/reflection, MCP-compatible skill metadata, sandboxed execution, and deterministic local fallback. |
| D.C. Knowledge Base | `dc_knowledge_rag.py`, `scripts/seed_dc_knowledge.py`, `datasets/`, `evals/` | Seeded official D.C. source registry with 1,145 chunks and deterministic RAGAS-style regression reports. Full official body-text extraction and citation finalization remain production hardening work. |
| Standalone Web App | `mercy-legal-web/` | Next.js App Router app with live core client and dashboard components. Stable but still basic from a product UX/auth perspective. Frontend productization is the main current priority. |
| Office Add-in | `mercy-legal-plugin/` | Vite/React/Fluent UI Word add-in calling the shared core agent network, with offline-safe redacted queue/cache behavior. Production hosting and release packaging remain. |
| Legacy Smoke Surfaces | `standalone_platform/`, `word_plugin/` | Local scaffolds retained for smoke testing and historical compatibility. Not the primary product surfaces. |
| Discovery Engine | `legal_discovery_ai/` | Brownfield legal discovery package integrated through `bridge.py`. |

## Current Capabilities

Implemented local/beta capabilities include:

- FastAPI Shared Intelligence Core with `/v1/*` legal endpoints.
- MoE legal task router and response envelope.
- Auth and tenant isolation guard for protected endpoints.
- Matter context and structured intake.
- PostgreSQL/pgvector-backed persistence when configured, with explicit local fallback.
- D.C. RAG source registry, ingestion contract, seeded official-source knowledge base, and status endpoint.
- RAGAS-style evaluation and advanced 200-case deterministic regression suite.
- LiteLLM provider routing for OpenAI, Anthropic, Groq, Gemini, and compatible providers.
- Agent X agent network with LangGraph-compatible ReACT cycles, sandboxed skills, and Hermes intelligence layer.
- D.C. template gallery and prompt registry.
- Limited beta endpoints for invite status, quotas, feedback, legal docs, and analytics.
- Monitoring, cost tracking, rate limiting, security headers, audit hooks, and SOC 2 Type 1 preparation docs.
- Next.js dashboard connected to the core through `src/lib/core-client.ts`.
- Word add-in connected to `/v1/matter/intake/full` and `/v1/agent/execute`.

## What Is Still Basic or In Progress

The backend is ahead of the product surface. The main remaining work is frontend productization:

- Real web authentication/session handling and tenant selection.
- Clean separation between marketing, auth, authenticated app, and admin routes.
- A polished matter-centered web workflow for intake, documents, research, drafting, citation verification, and export.
- Production document storage posture, retention policy, backups, and admin controls.
- Subscription and entitlement enforcement connected to Stripe and beta quotas.
- Production Office add-in hosting, manifest assets, support/privacy URLs, and release process.
- Full official D.C. source text extraction, refresh operations, and citation finalization workflow.
- End-to-end browser tests for real attorney workflows.

## Local Prerequisites

- Python 3.12 recommended.
- Node.js and npm.
- Dependencies installed for:
  - root Python backend
  - `mercy-legal-web/`
  - `mercy-legal-plugin/`
- Optional PostgreSQL/Supabase database for persistent matters and pgvector RAG storage.
- Optional LLM provider key for live model calls.

## Environment Setup

Copy the example environment file:

```powershell
Copy-Item .env.example .env
```

For local development, the default posture is:

```text
MERCY_ENV=local
MERCY_AUTH_MODE=dev
MERCY_RETENTION_MODE=zero_retention
MERCY_RAG_VECTOR_BACKEND=local
MERCY_RAG_GRAPH_BACKEND=local
```

Set one provider key if live LLM calls are needed:

```text
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GROQ_API_KEY=
GEMINI_API_KEY=
```

Set a database URL when testing persistent storage:

```text
POSTGRES_URL=
SUPABASE_URL=
```

## Local Quick Start

Install Python dependencies:

```powershell
python -m pip install -r requirements.txt
```

Install web dependencies:

```powershell
cd mercy-legal-web
npm install
cd ..
```

Install Office add-in dependencies:

```powershell
cd mercy-legal-plugin
npm install
cd ..
```

Run the FastAPI backend:

```powershell
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Run the Next.js web app:

```powershell
cd mercy-legal-web
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

Run the Office add-in dev server:

```powershell
cd mercy-legal-plugin
npm run dev
```

## Canonical Verification

Use this command as the primary health check:

```powershell
.\legal_discovery_ai\.venv\Scripts\python.exe scripts\verify.py
```

If you are using another Python executable:

```powershell
$env:MERCY_PYTHON="C:\path\to\python.exe"
python scripts\verify.py
```

The verifier runs:

- Backend unit tests.
- Python compile checks.
- Pyright.
- Ruff safety lint subset.
- Core smoke endpoints.
- Quick RAGAS evaluation.
- Next.js typecheck, lint, and build.
- Office add-in lint, build, and manifest validation.

## Setup Wizard Status

A dedicated setup wizard is not yet implemented. Until then, developers should use:

- `.env.example` for environment setup.
- `scripts/verify.py` for system validation.
- `scripts/core_smoke.py` for core endpoint smoke checks.
- `scripts/seed_dc_knowledge.py` for D.C. knowledge seeding.
- `scripts/check_security_compliance.py` for security/compliance checks.

Planned setup-wizard behavior:

- Detect Python, Node, npm, and dependency status.
- Validate `.env` and auth mode.
- Check database connectivity when configured.
- Confirm LLM provider availability.
- Run a reduced smoke sequence.
- Report whether Mercy is local-only, beta-ready, or blocked.

## Beta Status

Mercy is in **local/beta-candidate** status.

Backend beta infrastructure exists: invite status, quotas, feedback, legal docs, analytics, monitoring, security docs, and audit hooks. The product should not invite real D.C. attorneys until the beta-readiness checklist passes, especially around:

- Real web auth and tenant/session handling.
- Production database configuration and backup posture.
- Retention/deletion policy.
- Office add-in HTTPS hosting and manifest release assets.
- Polished matter workflow in the web app.
- Verified source/citation limitations clearly displayed.

See `docs/beta-readiness-checklist.md`.

## Main Documentation

- `specs/001-migrate-docs-spec/spec.md` - consolidated product source of truth.
- `specs/002-legal-ai-integration/plan.md` - current brownfield implementation and hardening plan.
- `specs/002-legal-ai-integration/tasks.md` - active PD backlog and status.
- `DEPLOYMENT.md` - local and production deployment guide.
- `docs/beta-readiness-checklist.md` - attorney beta go/no-go checklist.
- `docs/product/web-app-architecture.md` - target web app route and auth architecture.
- `docs/product/office-addin-release-runbook.md` - Office add-in release process.

## Developer Notes

- Do not create another app, router, RAG service, or add-in surface unless the Spec Kit plan changes.
- Keep legal intelligence in the shared FastAPI core.
- Keep `mercy-legal-web/` as the primary web product candidate.
- Keep `mercy-legal-plugin/` as the primary Office add-in candidate.
- Treat `standalone_platform/` and `word_plugin/` as legacy smoke/demo surfaces.
- Preserve response envelope, guardrails, citation metadata, source status, attorney-review language, tenant context, and data posture in all legal outputs.

