# Mercy AI Build Documentation

Mercy AI is an AI-native legal workspace for D.C. appellate and administrative
practice. The current build implements the blueprint's "One Brain, Two Windows"
model:

- Brain: Mercy Shared Intelligence Core, a FastAPI service in `main.py`.
- Window 1: Standalone Platform, a browser workspace at `/dashboard`.
- Window 2: Word Plugin, a Microsoft Word taskpane scaffold under
  `/word_plugin`.

## Product Position

Mercy is designed as a D.C.-native, affordable alternative to enterprise legal
AI platforms. The product is focused on solo and boutique D.C. lawyers who need
record-grounded drafting, local-rule checks, and attorney-supervised AI output.

The public-market inspiration is Harvey's legal/professional-services focus:
secure AI, complex workflows, document-heavy legal work, and high-value drafting.
Mercy differs by starting narrower: D.C. Circuit, administrative records, solo
lawyer adoption, pass-through case pricing, and local ethics guardrails.

## Core Files

| Path | Purpose |
| --- | --- |
| `main.py` | FastAPI app, route definitions, static dashboard/plugin hosting. |
| `bridge.py` | Root bridge into `legal_discovery_ai` without modifying original discovery code. |
| `Mercy_Folder/bridge.py` | Compatibility shim for the earlier typoed path. |
| `system_prompts.py` | D.C. Clerk Operating System prompt and D.C. rule schema. |
| `dc_guardrails.py` | Middleware that attaches Rule 28, Rule 32, and Ethics Opinion 388 checks to API output. |
| `mercy_context.py` | In-memory matter context, tier metadata, and billing report generation. |
| `standalone_platform/` | Browser dashboard UI. |
| `word_plugin/` | Word taskpane scaffold and manifest. |
| `tools/mercy_cli.py` | Local CLI for health, capabilities, matters, drafting, and billing reports. |
| `DEPLOYMENT.md` | Local, Docker, and production deployment notes. |
| `PRODUCT_BLUEPRINT_ALIGNMENT.md` | Blueprint alignment and remaining product gaps. |
| `Dockerfile` | Container build for the FastAPI service. |
| `.env.example` | Environment variable template. |

## API Surface

### Health and Product

- `GET /health`
  Returns service status, product name, and Clerk OS version.

- `GET /v1/product/capabilities`
  Returns product positioning, free/premium capabilities, and zero-retention
  posture.

- `GET /v1/workspace/clerk-os`
  Returns the D.C. Clerk OS system prompt for inspection.

### Matters

- `POST /v1/matters`
  Creates an in-memory matter with `name` and `tier`.

- `GET /v1/matters`
  Lists active in-memory matters.

- `GET /v1/matters/{matter_id}`
  Returns one matter context.

- `GET /v1/matters/{matter_id}/billing-report`
  Generates a premium billing report from recorded discovery/drafting events.

### Workspace

- `POST /v1/workspace/discovery`
  Calls the existing `legal_discovery_ai.crew.run_crew` function for document
  discovery using a file path and optional supplemental text.

- `POST /v1/workspace/discovery/upload`
  Accepts a PDF upload, saves it to `legal_discovery_ai/data/uploads`, and runs
  discovery.

- `POST /v1/workspace/draft`
  Uses Clerk OS to turn facts into Word-ready legal text. If no LLM key is
  configured, Mercy returns a structured fallback draft with verification
  placeholders.

## D.C. Clerk Operating System

The Clerk OS is not a general assistant. It is instructed to behave as a senior
D.C. appellate clerk:

- Prioritize D.C. Circuit rules, D.C. Court of Appeals practice, and controlling
  authority.
- Apply Rule 28 and Rule 32 structure/format checks.
- Treat D.C. Bar Ethics Opinion 388 as a supervision mandate.
- Never invent cases, record cites, quotations, standards of review, or facts.
- Mark missing legal support with `[VERIFY CITE]` or bracketed attorney-review
  placeholders.
- Produce Word-ready text without chatty commentary.

## Guardrails

`DCGuardrailMiddleware` intercepts `/v1/*` JSON responses and attaches:

- `rule_28` checks for brief components.
- `rule_32` checks for Word-ready formatting, citation placeholders, and record
  placeholders.
- `ethics_388` checks for human review, confidentiality, citation verification,
  supervising attorney review, and fee reasonableness.

The guardrail result is advisory. It flags `review_required` rather than
blocking output so an attorney can decide whether to revise.

## Standalone Platform

URL:

```text
http://127.0.0.1:8000/dashboard
```

Current capabilities:

- Create a matter workspace.
- Select free or premium tier.
- Run record intake by file path or PDF upload.
- Paste or reuse facts JSON.
- Generate a D.C. Clerk OS draft.
- View guardrail output.
- Generate billing reports.
- Copy Word-ready drafting output.

Design direction:

- Premium legal command center rather than generic web form.
- Professional, high-trust palette: ink, parchment, brass, burgundy, and teal.
- Dense operational layout suited for legal work.
- Stronger visual hierarchy inspired by legal/professional AI platforms, not a
  literal clone.
- Accessible contrast, keyboard focus states, and reduced-motion handling.

## Word Plugin

Manifest:

```text
word_plugin/manifest.xml
```

Taskpane:

```text
http://127.0.0.1:8000/word_plugin/taskpane.html
```

Current capabilities:

- Accept a Matter ID from the dashboard.
- Accept facts JSON.
- Select draft type and requested relief.
- Call `/v1/workspace/draft`.
- Insert generated text into the active Word document.
- Fallback to clipboard copy if Word context is unavailable.

Production note: many Word sideload environments require HTTPS. The current
local version is served by FastAPI over HTTP for simplicity.

## CLI

Run from the repo root:

```powershell
.\legal_discovery_ai\.venv\Scripts\python.exe tools\mercy_cli.py health
.\legal_discovery_ai\.venv\Scripts\python.exe tools\mercy_cli.py capabilities --output json
.\legal_discovery_ai\.venv\Scripts\python.exe tools\mercy_cli.py create-matter "EPA v. Smith" --tier premium
.\legal_discovery_ai\.venv\Scripts\python.exe tools\mercy_cli.py matters --output json
.\legal_discovery_ai\.venv\Scripts\python.exe tools\mercy_cli.py draft --facts-json "{""case_summary"":""Agency denied petition.""}"
```

CLI design is inspired by AgentBrain and SkillX patterns:

- Explicit resource commands.
- `--api-url` override.
- `--output table|json`.
- Machine-readable JSON for automation.

## Local Run

```powershell
cd "C:\Users\12404\Downloads\Mercy AI"
.\legal_discovery_ai\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\legal_discovery_ai\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Open:

```text
http://127.0.0.1:8000/dashboard
```

## Current Limitations

- Matter context is in-memory and resets when the server restarts.
- Citation verification is a guardrail scaffold, not a full official-source
  checker yet.
- Multi-document administrative record indexing is not fully implemented.
- Bates-page anchoring is not implemented.
- Authentication and Stripe are not implemented.
- Word production hosting should move to HTTPS.

## Deployment Readiness

The repo includes:

- `Dockerfile`
- `.env.example`
- `DEPLOYMENT.md`

Production hardening still needed:

- HTTPS reverse proxy or hosted platform.
- Authentication and tenant isolation.
- Encrypted persistence layer if premium matter storage is enabled.
- Stripe or payment provider.
- Official citation/audit source integrations.
- Logging policy that preserves auditability without over-retaining client data.

## Next Recommended Build Steps

1. Add auth and user identity.
2. Add persistent encrypted matters with retention controls.
3. Build citation verification against official court/PACER/CourtListener sources.
4. Add Bates/record chunk anchors to discovery output.
5. Add Stripe-backed premium gating.
6. Package Word add-in over HTTPS.
7. Add Playwright visual regression checks for dashboard and taskpane.
