# Mercy AI

Mercy AI is an AI-native legal workspace for D.C. appellate and administrative practice. The current build follows a "One Brain, Two Windows" architecture:

- Shared Intelligence Core: FastAPI service in `main.py`.
- Standalone Platform: browser workspace in `standalone_platform/`.
- Word Plugin: Microsoft Word taskpane scaffold in `word_plugin/`.
- Mercy Legal Web: Next.js product and dashboard app in `mercy-legal-web/`.
- Mercy Legal Plugin: production-oriented Word add-in in `mercy-legal-plugin/`.

## Local API Run

```powershell
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Then open:

```text
http://127.0.0.1:8000/dashboard
```

## Environment

Copy `.env.example` to `.env` and set one LLM provider key if live model drafting is needed:

```text
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
```

Without a configured model key, Mercy returns structured fallback drafts with attorney verification placeholders.

## Main Project Areas

| Path | Purpose |
| --- | --- |
| `main.py` | FastAPI service, route definitions, dashboard/plugin hosting. |
| `bridge.py` | Bridge into the legal discovery engine. |
| `dc_guardrails.py` | D.C. appellate and ethics guardrail middleware. |
| `mercy_context.py` | In-memory matter context and billing-report scaffolding. |
| `system_prompts.py` | D.C. Clerk Operating System prompt and rules schema. |
| `standalone_platform/` | Static dashboard served by the FastAPI app. |
| `word_plugin/` | Lightweight Word taskpane scaffold. |
| `mercy-legal-web/` | Next.js web product/dashboard. |
| `mercy-legal-plugin/` | React/Vite Word add-in implementation. |
| `legal_discovery_ai/` | Legal discovery engine package. |
| `tools/` | Local Mercy CLI utilities. |

## Documentation

- `MERCY_BUILD_DOCUMENTATION.md`
- `DEPLOYMENT.md`
- `PRODUCT_BLUEPRINT_ALIGNMENT.md`

## Production Hardening

The repo is ready for source control, but the product still needs production hardening before public deployment:

- Authentication and tenant isolation.
- Encrypted persistent matter storage with retention controls.
- Official citation and source verification integrations.
- HTTPS hosting for the Word add-in.
- Payment and premium-tier enforcement.
- Audit logging that preserves supervision without over-retaining client data.
