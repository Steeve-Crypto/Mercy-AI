# Implementation Plan: Mercy Legal AI Brownfield Architecture

**Branch**: `001-migrate-docs-spec` | **Date**: 2026-05-11 | **Spec**: [spec.md](./spec.md)
**Input**: Consolidated Mercy product vision plus the current brownfield
implementation in the repository.

<!--
Purpose: This plan records the implementation reality of the existing Mercy AI
codebase and turns it into a practical integration strategy. It must be read as a
brownfield plan: spec.md is the product vision, while the codebase is the current
system of record for what has already been built.

Primary product authority: specs/001-migrate-docs-spec/spec.md
Current implementation reality: root FastAPI modules, mercy-legal-web/,
mercy-legal-plugin/, legal_discovery_ai/, standalone_platform/, word_plugin/,
and tools/mercy_cli.py.
-->

## Summary

Mercy is not a greenfield project. The repository already contains substantial
working implementation across the Shared Intelligence Core, Standalone Platform,
Office / Word Add-in, and Legal Discovery AI. The near-term plan is to integrate
these built surfaces around one shared live core contract, not to recreate them.

The current architecture is a brownfield "One Brain, Multiple Surfaces" system:

1. **Shared Intelligence Core**: `main.py`, `bridge.py`, `mercy_context.py`,
   `dc_guardrails.py`, and `system_prompts.py` already provide FastAPI endpoints,
   matter storage, discovery/drafting bridges, billing hooks, D.C. guardrails,
   and Clerk OS prompt behavior.
2. **Standalone Platform**: There are two web surfaces:
   `standalone_platform/` is a static FastAPI-served workspace wired to the local
   core; `mercy-legal-web/` is a substantial Next.js product/dashboard app with
   marketing, auth shells, pricing/Stripe checkout, dashboard modules, matter
   management, document vault, assistant panel, contract analyzer, clause library,
   and activity UI. The Next dashboard currently uses local mock/static data
   rather than the live core.
3. **Office / Word Add-in**: There are two add-in surfaces:
   `word_plugin/` is a lightweight local taskpane wired to the FastAPI drafting
   endpoint; `mercy-legal-plugin/` is the production-oriented Vite/React/Fluent UI
   Word add-in with Office.js document read/insert helpers, risk review, clause
   library, chat, report generation, manifest tooling, and local mock AI services.
4. **Legal Discovery AI**: `legal_discovery_ai/` is a CrewAI package and
   Streamlit UI for PDF parsing, risk scanning, case brief writing, RAG over past
   cases, export to Markdown/PDF/DOCX/JSON, and provider fallback across
   Anthropic, OpenAI, and Gemini.

The main implementation gap is cross-surface integration: the built Next.js
dashboard and production Word add-in need to call the live Shared Intelligence
Core with a stable route/matter/guardrail/source metadata contract.

## Brownfield Inventory

### Shared Intelligence Core

| Path | Already Built | Current Gap |
|------|---------------|-------------|
| `main.py` | FastAPI app, CORS, static mounts, `/health`, product capabilities, matter create/list/get, billing report, Clerk OS, discovery, discovery upload, drafting endpoints. | No explicit MoE route endpoint or route metadata contract yet. Request models are narrow and do not cover full structured intake. |
| `bridge.py` | Bridges to `legal_discovery_ai.run_crew`, normalizes discovery results, builds billing hooks, calls configured LLM for drafting, provides safe fallback drafts. | Discovery/drafting output lacks unified source-anchor and route envelope. |
| `mercy_context.py` | In-memory local matter store with matter ID, name, tier, facts, drafts, billing events, product capability metadata, billing reports. | Intake fields, documents, route history, guardrail history, and source anchors are not modeled. |
| `dc_guardrails.py` | Middleware attaches D.C. Rule 28/32 and Ethics Opinion 388 checks to `/v1/*` JSON output. | Guardrail shape is advisory and not yet a full compliance signal envelope used by all UI surfaces. |
| `system_prompts.py` | D.C. Clerk OS prompt, no-fabrication rules, Word-ready drafting instructions, D.C. local rule schema, prompt builder. | Prompt contracts are not yet surfaced as reusable skills or route-specific capabilities. |
| `tools/mercy_cli.py` | Local CLI for health, capabilities, matters, matter creation, drafting, and billing reports. | CLI does not cover route inspection, intake, research, or discovery upload. |

### Standalone Platform

| Path | Already Built | Current Gap |
|------|---------------|-------------|
| `standalone_platform/` | Static dashboard served by FastAPI. It creates matters, runs discovery by path/upload, drafts from facts, displays guardrails, copies drafts, and fetches billing reports. | Local scaffold only; not the primary production dashboard UI. |
| `mercy-legal-web/` | Next.js 15 app with marketing page, sign-in/sign-up shells, dashboard layout, assistant panel, contract analyzer, document vault, upload UI, clause library, matter management, activity feed, Zustand store, Stripe checkout route, shadcn-style UI primitives. | Dashboard data is mock/static from `src/lib/data.ts`; auth forms are placeholders; document upload progress is simulated; no adapter to FastAPI core yet. |
| `mercy-legal-web/src/app/api/checkout/route.ts` | Stripe subscription checkout with demo fallback when Stripe configuration is absent. | Entitlements are not enforced against core capabilities. |

### Office / Word Add-In

| Path | Already Built | Current Gap |
|------|---------------|-------------|
| `word_plugin/` | Lightweight taskpane wired to `http://127.0.0.1:8000/v1/workspace/draft`, with Word insertion or clipboard fallback. | Local scaffold; not the polished production add-in. |
| `mercy-legal-plugin/` | Vite/React/Fluent UI add-in with Office manifest, HTTPS localhost config, icons, risk view, clause library, chat, report view, Word read/selection/insert helpers, production manifest generator, validation scripts. | `src/services/api.ts` returns mocked analysis/explanation/drafting results instead of calling the FastAPI core; no shared route/guardrail metadata display yet. |
| `mercy-legal-plugin/scripts/generate-production-manifest.mjs` | Generates HTTPS production manifest from local manifest. | Production hosting, support/privacy/terms, auth, and live core configuration remain deployment gates. |

### Legal Discovery AI

| Path | Already Built | Current Gap |
|------|---------------|-------------|
| `legal_discovery_ai/src/legal_discovery_ai/crew.py` | CrewAI document parser, risk scanner, case brief writer, provider fallback, RAG tools when OpenAI key is present, sequential crew, CLI entry point. | Output is not yet normalized into the shared route/source/guardrail envelope. |
| `legal_discovery_ai/src/legal_discovery_ai/app.py` | Streamlit UI with PDF upload, agent status panel, analysis history, friendly provider errors, formatted tabs, export to Markdown/PDF/DOCX/JSON. | Separate UI path; not yet integrated into the Next dashboard or production add-in. |
| `legal_discovery_ai/data/` | Past-case RAG directory, upload directory, analysis history file. | Uploads/history are local processing artifacts, not production document vault storage. |

## Architecture Direction

The correct brownfield direction is integration and contract stabilization:

```text
Existing product surfaces
  |-- mercy-legal-web dashboard
  |-- mercy-legal-plugin Word add-in
  |-- standalone_platform local dashboard
  |-- word_plugin local taskpane
  |-- legal_discovery_ai Streamlit/CrewAI
  `-- tools/mercy_cli.py

All should converge on:
  Shared Intelligence Core
    -> matter context
    -> route / capability contract
    -> discovery, drafting, research, clause, compliance skills
    -> D.C. guardrail and source metadata envelope
    -> safe surface-specific rendering
```

Do not create another dashboard, add-in, or discovery engine. Use the existing
ones and wire them to the core.

## MoE Routing Strategy

The MoE task router is still needed, but it should be implemented as a
brownfield compatibility layer over existing endpoints, not as a replacement for
the working core.

Minimum route envelope:

| Field | Purpose |
|-------|---------|
| `route_mode` | Intake, D.C. research, drafting, document review, discovery review, contract review, clause explanation, billing report, compliance check, or general matter assistance. |
| `confidence` | Route certainty for UI display and fallback decisions. |
| `missing_inputs` | Facts, matter data, selected text, document source, relief, jurisdiction, or authority support needed before a safe answer. |
| `selected_capability` | Existing or future handler: FastAPI draft, discovery crew, clause helper, contract analyzer, research skill, billing report, or compliance check. |
| `guardrail_profile` | D.C. compliance requirements applied to the response. |
| `fallback_path` | Safe local/mock/fallback behavior when live model, source, or document context is unavailable. |
| `surface_context` | Calling surface such as Next dashboard, production Word add-in, static dashboard, local taskpane, Streamlit, or CLI. |
| `premium_gate` | Free, paid, premium, production-gated, or future expansion status. |

First implementation target: add route metadata to existing `main.py` responses
and expose a small route-inspection helper or endpoint. Then update
`mercy-legal-web` and `mercy-legal-plugin` to consume that metadata.

## Cross-Surface Integration Plan

### Standalone Platform Priority

The production Standalone Platform priority is `mercy-legal-web/`, because that
is the substantial user-facing dashboard. It should be connected to the live
FastAPI core in small slices:

1. Add a typed core API client in `mercy-legal-web/src/lib/`.
2. Replace mock matter data with `/v1/matters` and `/v1/matters/{id}`.
3. Wire document review actions to `/v1/workspace/discovery` or
   `/v1/workspace/discovery/upload`.
4. Wire drafting/research-style assistant actions to existing core endpoints or
   route inspection as those contracts are added.
5. Display `dc_guardrails`, route metadata, missing inputs, and verification
   status in the dashboard.

`standalone_platform/` should remain a local smoke-test surface for the FastAPI
core until the Next dashboard fully owns the product workflow.

### Office / Word Add-In Priority

The production Office priority is `mercy-legal-plugin/`, because it already has
the polished Vite/React/Fluent UI implementation and manifest tooling. It should
be connected to the live core without losing preview behavior:

1. Replace mock methods in `mercy-legal-plugin/src/services/api.ts` with a core
   API client configurable by environment.
2. Preserve development fallback data when Word or the core is unavailable.
3. Send full document text and selected text to the appropriate route/core
   endpoint.
4. Render route, missing-input, compliance, source, and human-review metadata in
   `RiskSummary`, `AssistantChat`, and `DocumentActions`.
5. Keep `word_plugin/` as a lightweight local draft/insertion scaffold.

### Legal Discovery AI Priority

`legal_discovery_ai/` is already a meaningful agent/crew component. The next step
is not to rebuild it; it is to normalize its output through `bridge.py` so the
web dashboard and Word add-in can show facts, risks, source/page placeholders,
guardrails, missing elements, next actions, and export/report data consistently.

## Technical Context

**Backend**: FastAPI, Pydantic, Uvicorn, Python local modules, CrewAI bridge,
in-memory matter store, middleware guardrails.
**Standalone Web**: Next.js 15, React 19, Tailwind CSS 4, Radix UI primitives,
lucide-react, Zustand, Stripe SDK, mocked dashboard data.
**Office Add-In**: Vite 5, React 18, Fluent UI, Office.js typings/tools,
framer-motion, manifest validation/generation scripts, mocked local AI services.
**Discovery**: CrewAI, crewai-tools, Streamlit, reportlab, python-docx,
python-dotenv, provider fallback across Anthropic/OpenAI/Gemini.
**Current Storage**: In-memory matters in `mercy_context.py`, local upload files
under `legal_discovery_ai/data/uploads`, analysis history JSON, no production
database.
**Production Gates**: Authentication, tenant isolation, encrypted persistence,
retention/deletion controls, official citation/source verification, HTTPS Word
hosting, support/privacy/terms, payment enforcement, and audit logging.

## Current Data Flow

```text
Static dashboard
  -> FastAPI core
  -> in-memory matters / discovery bridge / drafting bridge
  -> D.C. guardrail middleware
  -> static UI display

Lightweight word_plugin
  -> FastAPI /v1/workspace/draft
  -> Word insertion or clipboard fallback

Next dashboard
  -> local static data and demo checkout today
  -> must be wired to FastAPI core next

Production Vite Word add-in
  -> Office.js reads document/selection
  -> mocked api.ts analysis/explain/draft today
  -> must be wired to FastAPI core next

Legal Discovery AI
  -> Streamlit or bridge.py
  -> CrewAI parser/risk/brief workflow
  -> local exports and normalized bridge facts
```

## Quality And Compliance Check

- **Vision alignment**: PASS. Codebase already targets D.C. small-firm legal AI
  across dashboard, Word, and discovery surfaces.
- **Brownfield accuracy**: PASS. This plan acknowledges built surfaces and does
  not treat Mercy as a new app.
- **Surface ownership**: PASS. `mercy-legal-web/` is the production Standalone
  Platform candidate; `mercy-legal-plugin/` is the production Office Add-in
  candidate; root FastAPI is the Shared Intelligence Core.
- **Guardrails**: PARTIAL. Core middleware exists, but the Next dashboard and
  production add-in do not yet consume live guardrail metadata.
- **MoE routing**: PARTIAL. Product requirements and target contract are clear,
  but code does not yet expose a route envelope or router endpoint.
- **Data handling**: PARTIAL. Local/demo posture exists; production persistence,
  auth, tenant isolation, and audit controls remain blockers.
- **Source grounding**: PARTIAL. Discovery and drafting placeholders exist, but
  official verification and cross-surface source anchors are not implemented.

## Major Risks

| Risk | Current Evidence | Mitigation |
|------|------------------|------------|
| Production dashboard is visually built but not live-core integrated | `mercy-legal-web/src/lib/data.ts` drives dashboard mocks. | Add typed FastAPI client and replace mock data slice by slice. |
| Production Word add-in is polished but uses mock AI services | `mercy-legal-plugin/src/services/api.ts` returns delayed hardcoded responses. | Replace with configurable core API calls and keep preview fallback. |
| Duplicate surface logic can drift | Static dashboard, lightweight taskpane, Next dashboard, and Vite add-in each have local behavior. | Converge on shared core route/guardrail/source envelope. |
| MoE routing is specified but not implemented | Existing endpoints are discovery/draft/matter specific. | Add brownfield route metadata around existing handlers before adding new skills. |
| Client-data production readiness is incomplete | No auth, tenant isolation, encrypted persistence, or retention controls in active core. | Keep local/demo posture until production gates are implemented. |
| Legal outputs need stronger source status | Guardrails and placeholders exist, but official verification is not live. | Make source-anchor and verification status mandatory in shared response contracts. |
