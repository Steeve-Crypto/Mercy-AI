# Mercy Legal AI Deployment Guide

This guide covers local development, beta-candidate deployment, and production considerations for Mercy Legal AI.

Current posture: **local/beta-candidate**. The backend is strong; production readiness depends on web auth, tenant/session hardening, database operations, Office add-in HTTPS hosting, and beta workflow verification.

## System Components

| Component | Path | Runtime | Purpose |
| --- | --- | --- | --- |
| FastAPI Shared Intelligence Core | repository root, `main.py` | Python | Legal router, matter context, RAG, Agent X, templates, beta, monitoring, security, discovery, drafting. |
| Next.js Web App | `mercy-legal-web/` | Node/Next.js | Public marketing and standalone attorney workspace. Stable but still productizing. |
| Office Add-in | `mercy-legal-plugin/` | Node/Vite/Office.js | Word taskpane connected to the shared core agent network. |
| Optional Database | PostgreSQL/Supabase with pgvector | SQL | Persistent matters, source records, chunks, checkpoints, and audit logs. |

Legacy `standalone_platform/` and `word_plugin/` surfaces are retained for local smoke/demo use only.

## Required Tools

- Python 3.12 recommended.
- Node.js and npm.
- Optional PostgreSQL or Supabase database.
- Optional LLM provider key.
- For Office add-in work: Microsoft Word desktop or web sideload environment.

## Environment Variables

Start from:

```powershell
Copy-Item .env.example .env
```

Important variables:

| Variable | Purpose |
| --- | --- |
| `MERCY_ENV` | `local`, `staging`, or production-like environment name. |
| `MERCY_AUTH_MODE` | `dev` permits local bypass. Production must not rely on dev auth. |
| `MERCY_API_TOKEN` | Shared bearer token for local/core calls when configured. |
| `MERCY_RETENTION_MODE` | Data retention posture. Local default is `zero_retention`. |
| `POSTGRES_URL` / `SUPABASE_URL` | Enables persistent SQLAlchemy storage and pgvector-backed RAG paths. |
| `MERCY_RAG_VECTOR_BACKEND` | `local`, `pgvector`, `qdrant`, or configured backend mode. |
| `MERCY_RAG_GRAPH_BACKEND` | `local`, `neo4j`, or configured graph mode. |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY` | Optional live LLM providers through LiteLLM. |
| `LANGSMITH_TRACING`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT` | Optional tracing. |
| `MERCY_ALLOWED_ORIGINS` | CORS allowlist for production. |
| `MERCY_REQUIRE_HTTPS` | Enforce HTTPS behavior in production. |
| `MERCY_DAILY_TENANT_COST_CAP_USD` | Optional cost cap. |

Next.js web variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_MERCY_CORE_API_URL` | Browser-visible core API URL. |
| `MERCY_CORE_API_URL` | Server-side core API URL. |
| `MERCY_CORE_API_TOKEN` / `MERCY_API_TOKEN` | Server-side auth token for core calls. |
| `NEXT_PUBLIC_APP_URL` | Public web app URL for checkout redirects. |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_SOLO`, `STRIPE_PRICE_SMALL_FIRM`, `STRIPE_PRICE_PRACTICE` | Stripe checkout configuration. |

Office add-in variables:

| Variable | Purpose |
| --- | --- |
| `VITE_MERCY_CORE_API_URL` | Core API URL used by the add-in. |
| `VITE_MERCY_API_TOKEN` | Optional local/beta token. |
| `VITE_MERCY_TENANT_ID`, `VITE_MERCY_USER_ID` | Local/beta tenant context. |

## Local Backend

Install dependencies:

```powershell
python -m pip install -r requirements.txt
```

Run FastAPI:

```powershell
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Health check:

```text
http://127.0.0.1:8000/health
```

Important endpoints:

```text
GET  /health
GET  /v1/product/capabilities
GET  /v1/matters
POST /v1/matter/intake/full
POST /v1/router/inspect
POST /v1/rag/retrieve
GET  /v1/rag/status
GET  /v1/agent/skills
POST /v1/agent/execute
GET  /v1/templates/gallery
GET  /v1/beta/status
GET  /v1/monitoring/metrics
```

## Local Next.js Web App

Install dependencies:

```powershell
cd mercy-legal-web
npm install
```

Run dev server:

```powershell
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

Build checks:

```powershell
npm run typecheck
npm run lint
npm run build
```

Current web posture:

- Marketing pages exist.
- Dashboard components call the FastAPI core.
- Auth pages are present but not yet production-ready.
- Productization work should move authenticated workflows into a clean `(app)` route group and protect them with real session middleware.

## Local Office Add-in

Install dependencies:

```powershell
cd mercy-legal-plugin
npm install
```

Install local HTTPS certificates if needed:

```powershell
npm run install:certs
```

Run the Vite dev server:

```powershell
npm run dev
```

Validate manifest:

```powershell
npm run validate:manifest
```

Build:

```powershell
npm run build
```

Start desktop sideload session:

```powershell
npm run start:desktop
```

Stop sideload session:

```powershell
npm run stop
```

Production add-in release still requires HTTPS hosting, production manifest generation, privacy/support URLs, icons, screenshots, and beta test accounts.

## Database Setup

For local-only development, Mercy can run with local fallback state:

```text
MERCY_ENV=local
MERCY_AUTH_MODE=dev
POSTGRES_URL=
SUPABASE_URL=
```

For persistent beta/staging:

1. Create PostgreSQL or Supabase database.
2. Enable pgvector when using vector search in Postgres.
3. Set `POSTGRES_URL` or `SUPABASE_URL`.
4. Ensure TLS/database encryption/backups are enabled by the provider.
5. Run the core smoke and verification scripts.

Seed D.C. knowledge:

```powershell
python -m scripts.seed_dc_knowledge --source=all --refresh
```

Check RAG status:

```text
GET /v1/rag/status
```

## Verification

Canonical verification:

```powershell
.\legal_discovery_ai\.venv\Scripts\python.exe scripts\verify.py
```

Alternative Python:

```powershell
$env:MERCY_PYTHON="C:\path\to\python.exe"
python scripts\verify.py
```

Security/compliance check:

```powershell
python -m scripts.check_security_compliance
```

Monitoring CLI:

```powershell
python -m scripts.monitoring status --days=7
```

Advanced RAGAS regression:

```powershell
python -m evals.run_regression --corpus=full --json
```

## Hosted Beta Activation

Operator runbook: `docs/product/hosted-beta-activation.md`.

Locally runnable preparation (no hosted secrets required for pure checks):

```powershell
cd mercy-legal-web
node scripts\validate-stripe-entitlements.mjs
npm.cmd run typecheck
npm.cmd run test:e2e:local -- tests/e2e/auth-claims.spec.ts --project=chromium
```

When hosted Supabase/Stripe credentials are available:

```powershell
cd mercy-legal-web
node scripts\backfill-auth-claims.mjs
node scripts\backfill-auth-claims.mjs --apply
node scripts\validate-stripe-entitlements.mjs --live
```

## Production Considerations

Do not invite real attorneys or process real client data in production until these are complete:

- Real web authentication and protected app routes.
- Tenant/session propagation from web and Office surfaces to the core.
- Production database with encryption at rest, TLS, backups, point-in-time recovery, restricted credentials, and access logging.
- Document retention, deletion, export, and support policy.
- HTTPS for all app and add-in surfaces.
- Strict `MERCY_ALLOWED_ORIGINS`.
- `MERCY_REQUIRE_HTTPS=true`.
- Production-safe secrets management.
- Office add-in production manifest with valid support, terms, privacy, icon, and hosting URLs.
- Clear source/citation limitations in the UI.
- Stripe/beta entitlements connected to tenant capability gates (mapping + webhook sync shipped; live checkout/cancel smoke still required).
- End-to-end beta workflow checks.
- Legacy claim backfill applied for any pre-hardening accounts.

## Recommended Deployment Shape

For beta:

- FastAPI core hosted behind HTTPS.
- Next.js app hosted separately or on a platform that supports server-side env vars and protected routes.
- PostgreSQL/Supabase with pgvector enabled.
- Office add-in taskpane hosted over HTTPS.
- One beta tenant per firm.
- Monitoring and alerting enabled.
- No broad public signup until beta checklist passes.

For production:

- Separate staging and production environments.
- Separate databases and LangSmith projects.
- Strong auth provider and tenant admin model.
- Automated backup and recovery testing.
- Formal security review and SOC 2 evidence collection.
- Documented support, incident, and deletion workflows.

