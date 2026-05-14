# Implementation Plan: Mercy Legal AI Integration

**Branch**: `002-legal-ai-integration` | **Date**: 2026-05-12 | **Spec**: [spec.md](./spec.md)
**Input**: Current brownfield Mercy state after MoE router, response envelope, matter context, D.C. RAG, RAGAS-style eval, observability, intake, agent network, and Office add-in integration work.

## Summary

This feature is the active Spec Kit home for the Mercy legal AI integration work. It documents the current brownfield architecture instead of proposing a new system.

Mercy now follows a "One Brain, Multiple Surfaces" model:

1. **FastAPI Shared Intelligence Core** in root Python modules owns routing, matter context, response envelopes, D.C. guardrails, RAG retrieval, evaluation, observability, intake, and agent execution.
2. **Standalone Platform** in `mercy-legal-web/` consumes core state and metadata from a typed Next.js client while still retaining some demo/dashboard sections.
3. **Office / Word Add-in** in `mercy-legal-plugin/` routes legal tasks through `/v1/agent/execute`, discovers MCP-compatible skills, displays route/reliability metadata, and now redacts local offline storage.
4. **Legal Discovery AI** in `legal_discovery_ai/` remains the brownfield discovery engine integrated through `bridge.py`.

The implementation is functional for local development and demo workflows. Production hardening has auth, tenant isolation, persistent matter storage, D.C. RAG persistence, a D.C. knowledge seeding pipeline, LangGraph runtime activation, LiteLLM-backed provider integration, and stronger eval thresholds in place; remaining hardening centers on encryption/retention policy, full official source text extraction, real MCP transport, and deployment operations.

## Technical Context

**Language/Version**: Python 3.12 local runtime observed; TypeScript/React for web and Office surfaces.
**Primary Dependencies**: FastAPI, Pydantic, Uvicorn, LiteLLM for multi-provider LLM calls, Next.js 15, React 19 for `mercy-legal-web`, Vite 5, React 18, Fluent UI, Office.js tooling for `mercy-legal-plugin`, CrewAI package under `legal_discovery_ai`.
**Storage**: SQLAlchemy-backed PostgreSQL + pgvector persistent store via `POSTGRES_URL` or `SUPABASE_URL` for matters, official D.C. RAG sources/chunks, and LangGraph checkpoints; local in-memory fallback is allowed only for explicit `MERCY_ENV=local` development.
**Testing**: Python `unittest` modules under `tests/`; `npm run typecheck`, `npm run build`, and `npm run lint` for TypeScript surfaces; Office manifest validation via `npm run validate:manifest`.
**Target Platform**: Local Windows development, FastAPI core, Next.js web app, Microsoft Word add-in.
**Project Type**: Brownfield multi-surface legal AI product with Python API core plus two TypeScript frontend surfaces.
**Performance Goals**: Local API and UI flows should remain responsive for solo/small-firm workflows; current implementation favors correctness, auditability, and safe fallback over latency optimization.
**Constraints**: D.C.-native scope, attorney review on all legal output, citation/record verification, no raw confidential Word content persisted locally, local nonpersistent matter posture until production storage is designed.
**Scale/Scope**: MVP single-user/local or small-firm workflows; production multi-tenant use is not yet approved.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Scope gate**: PASS. Feature serves D.C. appellate, administrative, contract, discovery, intake, and small-firm legal workflows. Non-D.C. use must be labeled general/out-of-scope.
- **Supervision gate**: PASS. `ResponseEnvelope`, router decisions, RAG payloads, add-in reliability signals, and guardrail metadata preserve attorney-review and verification requirements.
- **Privacy gate**: PARTIAL PASS. Persistent storage is tenant-scoped and local fallback is explicit dev-only; observability redacts high-risk fields and the Office add-in redacts offline localStorage. Encryption, retention, deletion, export, and full audit policy remain future production controls.
- **Architecture gate**: PASS. `main.py` FastAPI core is the legal brain. `mercy-legal-web/` and `mercy-legal-plugin/` consume the core instead of implementing separate legal behavior.
- **Grounding gate**: PARTIAL PASS. The response envelope, D.C. RAG provenance, citation metadata, and RAGAS-style eval exist. Current RAG source corpus is local seeded knowledge, not a production official source index.
- **Quality gate**: PASS for current local checks. Relevant commands are listed in Quick Verification below.

## Current Brownfield Architecture

```text
FastAPI Shared Intelligence Core
  main.py
  bridge.py
  legal_task_router.py
  response_envelope.py
  mercy_context.py
  dc_guardrails.py
  dc_knowledge_rag.py
  llm_providers.py
  ragas_eval.py
  scripts/seed_dc_knowledge.py
  observability.py
  client_intake_flow.py
  agent_network.py
  prompts/
  agents/
  tests/

Standalone Platform
  mercy-legal-web/
    src/lib/core-client.ts
    src/app/dashboard/
    src/components/dashboard/

Office / Word Add-in
  mercy-legal-plugin/
    src/services/api.ts
    src/components/metadata/
    src/components/skills/
    src/components/risk/
    src/components/chat/
    src/components/document/
    src/commands.ts
    manifest.xml

Brownfield discovery package
  legal_discovery_ai/

Local smoke surfaces
  standalone_platform/
  word_plugin/
  tools/mercy_cli.py
```

## Implemented Capabilities

| Area | Current State | Important Caveat |
|------|---------------|------------------|
| MoE Router | `legal_task_router.py` routes to research, drafting, compliance, intake, and citation verifier experts; `/v1/router/inspect` returns route metadata and uses LiteLLM classification when a provider key is configured. | Deterministic routing remains the fallback when no provider key is configured or a provider fails. |
| Response Envelope | `response_envelope.py` standardizes route, expert, confidence, guardrail status, citations, ethics metadata, matter snapshot, and audit timestamp. | `block` can represent missing required inputs, not only ethics blocking. |
| Matter Context | `mercy_context.py` models matter/client IDs, facts, documents, history, deadlines, sensitivity flags, and route history. | Production-like use requires `POSTGRES_URL` or `SUPABASE_URL`; local in-memory fallback is dev-only. |
| Full Intake | `client_intake_flow.py` and `prompts/intake.py` support structured D.C. intake and `/v1/matter/intake/full`. | Conflict and scope checks are workflow scaffolds, not real firm conflict systems. |
| D.C. RAG | `dc_knowledge_rag.py` exposes tenant-scoped D.C. retrieval from persisted official source/chunk records, with pgvector as the primary DB-backed vector path and optional Qdrant/Neo4j adapters. | Advanced pgvector tuning and full official source text extraction remain future hardening. |
| D.C. Knowledge Seeding | `scripts/seed_dc_knowledge.py` seeds official D.C. source records and legal-aware locator chunks for D.C. Code, Superior Court rules, DCMR, D.C. Court of Appeals opinions, and court forms through the PD032 ingestion contract. | Current seed chunks preserve official locators, headings, citations, and metadata; full body-text extraction from every official source remains a later expansion. |
| RAGAS Eval | `ragas_eval.py`, `datasets/dc_golden_dataset.jsonl`, and `/v1/rag/evaluate` produce local reports. | Metrics are deterministic RAGAS-style, and current eval threshold may fail. |
| Observability | `observability.py` exposes `/v1/observability/trace` and optional LangSmith submission, including storage-operation trace events. | LangSmith requires env vars and package availability; trace buffer remains process-local. |
| LLM Providers | `llm_providers.py` uses LiteLLM for OpenAI, Anthropic, Groq, Gemini, and provider/model overrides; MoE routing, RAG answer generation, drafting, and agent execution use real calls when a provider key is configured. | Structured templates remain the fallback when no provider key is configured, and provider failures fall back safely with trace metadata. |
| Agent Network | `agent_network.py` exposes `/v1/agent/skills` and `/v1/agent/execute`; agents and MCP-compatible skill metadata exist and report active LLM provider/model status. | MCP compatibility is manifest/schema-level, not a served MCP transport. |
| Office Add-in | `mercy-legal-plugin/` routes analysis, drafting, citation, ethics, matter update, and export actions through the core. | Offline storage is now redacted, but queued actions need the user to rerun with the active document for source content. |
| Standalone Web | `mercy-legal-web/` has a typed core client and displays envelope/matter metadata. | Several dashboard panels still use demo/mock data. |

## Data Model Summary

- **RouterDecision / Route Envelope**: expert, route mode, confidence, selected capability, guardrails, missing inputs, citations, fallback, confidentiality metadata.
- **ResponseEnvelope**: standardized compliance signal attached to legal endpoint outputs.
- **MatterContext**: tenant-scoped matter state with client identity, matter fields, facts, documents, deadlines, sensitivity flags, history, route history, drafts, and billing events, persisted through the SQLAlchemy repository when database storage is configured.
- **KnowledgeChunk / Citation Provenance**: tenant-scoped D.C. knowledge chunk with source title, citation label, verification status, provenance, entities, relationships, and pgvector-ready embedding metadata.
- **SeedSource / Seed Report**: official D.C. source catalog entries, legal-aware chunks, validation result counts, practice-area coverage, health, and latest successful seed timestamp.
- **GoldenExample / EvaluationRow**: D.C. eval cases and deterministic metric rows.
- **TraceRecord**: local and optional LangSmith observability events.
- **MCP Skill Manifest / Agent Result**: discoverable skill schemas and routed agent outputs.
- **LLMCallResult**: provider, model, fallback reason, token usage, estimated cost, trace ID, and whether a real LiteLLM call was used.
- **Office Offline Queue Item**: redacted local request metadata, cache key, action, and redaction summary only.

## API Contracts

Current core endpoints relevant to this feature:

```text
GET  /health
GET  /v1/product/capabilities
GET  /v1/matters
GET  /v1/matters/{matter_id}
POST /v1/matter/intake
POST /v1/matter/intake/full
POST /v1/router/inspect
POST /v1/rag/retrieve
POST /v1/rag/evaluate
GET  /v1/observability/trace
POST /v1/observability/trace
GET  /v1/agent/skills
POST /v1/agent/execute
POST /v1/workspace/draft
POST /v1/workspace/discovery
POST /v1/workspace/discovery/upload
GET  /v1/workspace/billing-report/{matter_id}
POST /v1/workspace/clerk-os
```

Legal endpoints should return or preserve the standard `response_envelope` contract wherever legal output is produced.

## Quick Verification

Use the canonical health check for backend, core smoke, RAGAS subset, Standalone Platform, and Office add-in verification:

```powershell
.\legal_discovery_ai\.venv\Scripts\python.exe scripts\verify.py
```

## Project Structure

### Documentation (this feature)

```text
specs/002-legal-ai-integration/
|-- spec.md
|-- plan.md
|-- tasks.md
`-- checklists/
```

### Source Code (repository root)

```text
main.py
bridge.py
legal_task_router.py
response_envelope.py
mercy_context.py
dc_guardrails.py
dc_knowledge_rag.py
llm_providers.py
ragas_eval.py
scripts/seed_dc_knowledge.py
scripts/test_prompts.py
observability.py
client_intake_flow.py
agent_network.py
agents/
prompts/dc_legal_prompts.py
prompts/registry.py
prompts/fewshot/dc_examples.jsonl
datasets/
reports/
tests/
mercy-legal-web/
mercy-legal-plugin/
legal_discovery_ai/
standalone_platform/
word_plugin/
tools/
```

**Structure Decision**: Keep the existing brownfield layout. Do not create another app, add-in, router package, or RAG service unless a later production-hardening task explicitly justifies it.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Optional LangGraph fallback instead of hard dependency | Keeps local development working without adding new dependency failures. | Requiring LangGraph immediately would break current environments until dependency/package policy is resolved. |
| Local seeded RAG for explicit local mode | Allows deterministic local testing while production-like retrieval uses tenant-scoped persisted sources/chunks. | Requiring a live external corpus for every local test would make smoke verification brittle. |
| Dev-only in-memory matter fallback | Keeps local development usable without a database. | Non-local client-data use now fails closed unless persistent storage is configured. |

## Immediate Known Risks

- Use `legal_discovery_ai\.venv` or set `MERCY_PYTHON` for the canonical verifier.
- `unittest discover` must be run with `-s tests -p "test_*.py"`; the canonical verifier uses this pattern.
- The current RAGAS-style release report passes threshold with the expanded 45-case dataset; the canonical verifier runs a fast 8-case subset.
- LangGraph and MCP are compatibility layers until real runtime/transport dependencies are activated.
- Production client data use still needs encryption, retention, deletion, export, and operational audit policy before deployment.

## High-Priority Risk Resolution Plan

These tasks promote the remaining security, stability, and quality risks from caveats into the active hardening queue. They are not new product features.

### PD028: Stop Standalone Server-Render Matter Mutation

**Problem**: `mercy-legal-web/src/lib/core-client.ts#getCoreSnapshot()` posts full demo intake and route inspection during dashboard server render, which mutates a shared demo matter and can attach route history before a user action.

**Required Change**: Split dashboard data loading into read-only snapshot calls and explicit user-triggered mutation calls. `getCoreSnapshot()` may call `/health`, `/v1/product/capabilities`, and read-only matter endpoints only. Demo context must remain local to the web app unless a user intentionally creates or updates a matter.

**Acceptance**: Loading `/dashboard` performs no POST requests, creates no matter, updates no matter, and attaches no route history. Demo-only context remains labeled as fallback/demo data.

### PD029: Add Core Auth and Tenant Isolation Guard

**Problem**: Core legal endpoints accept matter reads/writes without authentication, user identity, or tenant boundary checks.

**Required Change**: Add a centralized FastAPI auth dependency for protected legal endpoints. Support local bypass only when `MERCY_ENV=local` and `MERCY_AUTH_MODE=dev`. Introduce a request-scoped tenant/user context and require matter operations to validate same-tenant access.

**Acceptance**: Non-local legal endpoints reject unauthenticated requests. Same-tenant matter access succeeds. Cross-tenant matter access fails. Local dev remains usable with explicit dev auth mode.

### PD030: Activate Real LangGraph Runtime

**Problem**: `agent_network.py` currently reports `compatible_deterministic_state_graph` when `langgraph` is missing; the active venv does not have `langgraph` installed.

**Required Change**: Add `langgraph` to core Python dependencies, use compiled `StateGraph` execution when available, and fail closed in non-local environments if LangGraph is unavailable. Keep deterministic fallback only for local tests/dev.

**Acceptance**: `/v1/agent/skills` reports `langgraph.available=true` when dependencies are installed. Tests cover native graph execution and local-only fallback behavior.

### PD031: Connect Real RAG Backend Adapters

**Problem**: `dc_knowledge_rag.py` lists Qdrant, pgvector, and Neo4j-style backends but always uses seeded local chunks and deterministic local graph/vector search.

**Required Change**: Implement an adapter boundary for vector and graph retrieval. Use Qdrant when `MERCY_RAG_VECTOR_BACKEND=qdrant` and `MERCY_QDRANT_URL` are configured. Keep pgvector as a documented fallback path. Use Neo4j when `MERCY_RAG_GRAPH_BACKEND=neo4j` and `MERCY_NEO4J_URI` are configured. Production-like mode must not silently use seeded demo data.

**Acceptance**: Backend status accurately reports connected, fallback, or blocked state. Configured external backends are invoked in tests via mocked clients. Production-like mode blocks retrieval if only seeded demo data is available.

**PD035 update**: PostgreSQL + pgvector-backed persistence is now the primary RAG storage path when `POSTGRES_URL` or `SUPABASE_URL` is present; Qdrant and Neo4j remain optional advanced adapters.

### PD032: Add Official D.C. Source Registry and Ingestion Contract

**Problem**: RAG currently depends on hard-coded seeded chunks rather than registered official/curated D.C. source records.

**Required Change**: Define a source registry and ingestion contract for D.C. sources already listed in the spec. Required metadata: source ID, title, source type, authority type, jurisdiction, citation label, official locator, URL/file anchor, last checked, verification status, and refresh cadence. Move seeded chunks behind `local_demo` source registration.

**Acceptance**: Retrieval chunks derive from registered source records. Production-like retrieval requires registered sources. Every chunk keeps citation provenance and verification status.

### PD033: Raise RAGAS-Style Eval Quality to Release Threshold

**Problem**: Current eval quality is too low for release confidence: `overall=0.6843`, `pass_rate=0.1667`, and 20 of 24 rows fail.

**Required Change**: Improve retrieval ranking and dataset/source alignment before changing thresholds. Add grouped failure diagnostics for missing expected context, missing sources, missing citations, low answer relevancy, and low context precision.

**Acceptance**: Current 24-row dataset reaches `overall >= 0.72` and `pass_rate >= 0.80`. Remaining failures are explicit warnings with row-level reasons; fabricated authority remains a hard fail.

### PD034: Normalize CI and Smoke Verification

**Problem**: Current verification is split across explicit Python modules and separate web/add-in commands; root `unittest discover` may find zero tests.

**Required Change**: Document and/or script one canonical smoke sequence covering Python legal core tests, compile checks, RAGAS eval, web typecheck/lint/build, add-in lint/build/manifest validation, dashboard no-mutation check, auth guard checks, and RAG backend fallback checks.

**Acceptance**: A single documented sequence catches regressions in PD028-PD033 and is referenced by `tasks.md` as the brownfield hardening verification path.
