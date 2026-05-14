---
description: "Active Kanban backlog for specs/002-legal-ai-integration"
---

# Tasks: Mercy Legal AI Integration

**Feature Branch**: `002-legal-ai-integration`
**Primary Source Of Truth**: [spec.md](./spec.md) and [plan.md](./plan.md)
**Current Priority**: Keep Spec Kit aligned with the real brownfield codebase and continue hardening the existing core, Standalone Platform, and Office add-in without creating duplicate surfaces.

## Kanban Policy

**Columns**: Done | To Do | Backlog | Parked

**Definition Of Done**

- Existing brownfield paths are integrated or documented; no duplicate product surface is created.
- Legal outputs preserve `response_envelope`, route, matter, guardrail, citation/provenance, fallback, and attorney-review metadata where relevant.
- Client-sensitive text is not persisted outside explicitly approved storage.
- Local/demo fallback stays labeled and bounded.
- Tests or build/typecheck/lint/manual verification are recorded for the affected surface.

## Done

- [X] PD001 [Standalone Platform] Add typed FastAPI core client to `mercy-legal-web`.
  - **Completed Paths**: `mercy-legal-web/src/lib/core-client.ts`, dashboard integration components.
  - **Result**: Next.js dashboard can call core health, capabilities, matters, router, and intake endpoints with fallback.

- [X] PD002 [Office Add-in] Replace mocked add-in AI service with configurable core API calls.
  - **Completed Paths**: `mercy-legal-plugin/src/services/api.ts`, `mercy-legal-plugin/src/types/index.ts`.
  - **Result**: Word add-in legal actions route through the FastAPI core with preview fallback.

- [X] PD003 [Core Contract] Add standardized compliance response envelope.
  - **Completed Paths**: `response_envelope.py`, `main.py`, `bridge.py`, `legal_task_router.py`, web/add-in metadata consumers.
  - **Result**: Legal outputs expose route/expert, confidence, `pass | warn | block` guardrail status, citations, D.C. ethics metadata, matter snapshot, and audit timestamp.

- [X] PD005 [Office Add-in] Display guardrail, route, and verification status.
  - **Completed Paths**: Word add-in risk/chat/document metadata components.
  - **Result**: Add-in surfaces route confidence, guardrails, citation status, matter summary, and attorney-review warnings.

- [X] PD006 [Core Matter/Intake] Extend matter context for structured intake.
  - **Completed Paths**: `mercy_context.py`, `main.py`, `legal_task_router.py`, web/add-in matter display.
  - **Result**: Core supports structured `MatterContext` and hydrates router decisions by matter ID.

- [X] PD014 [Core MoE] Add route inspection endpoint.
  - **Completed Paths**: `legal_task_router.py`, `main.py`, `tests/test_legal_task_router.py`.
  - **Result**: `/v1/router/inspect` returns MoE legal route decisions with confidence, expert, guardrails, citations, and missing inputs.

- [X] PD015 [Core Research] Add D.C. knowledge RAG retrieval endpoint.
  - **Completed Paths**: `dc_knowledge_rag.py`, `main.py`, `legal_task_router.py`, `tests/test_dc_knowledge_rag.py`.
  - **Result**: `/v1/rag/retrieve` returns local hybrid vector/graph-style retrieval with citation provenance and response envelope wrapping.

- [X] PD023 [Core Evaluation] Add RAGAS-style evaluation pipeline and initial D.C. golden dataset.
  - **Completed Paths**: `ragas_eval.py`, `datasets/dc_golden_dataset.jsonl`, `reports/ragas_eval_report.json`, `tests/test_ragas_eval.py`.
  - **Result**: `/v1/rag/evaluate` and local CLI-style pipeline produce repeatable D.C. retrieval quality reports.

- [X] PD024 [Observability] Add LangSmith config and observability dashboard outline.
  - **Completed Paths**: `observability.py`, `main.py`, `config/langsmith_project.json`, `.env.example`, `tests/test_observability.py`.
  - **Result**: Core records local traces and optional LangSmith runs; `/v1/observability/trace` exposes router, RAG, guardrail, and latency summaries.

- [X] PD025 [Core Intake] Add full client intake flow and prompt library.
  - **Completed Paths**: `client_intake_flow.py`, `prompts/intake.py`, `main.py`, web/add-in intake consumers.
  - **Result**: `/v1/matter/intake/full` normalizes client, matter, fact, conflict, scope, document, deadline, and confidentiality inputs into matter context.

- [X] PD026 [Core Agents] Add LangGraph-compatible agent network and MCP skill layer.
  - **Completed Paths**: `agent_network.py`, `agents/__init__.py`, `main.py`, `tests/test_agent_network.py`.
  - **Result**: `/v1/agent/skills` and `/v1/agent/execute` support Research, Drafting, Compliance, Intake, and Citation Verifier agent flows with MCP-compatible skill schemas.

- [X] PD027 [Office Add-in] Power Word taskpane and ribbon actions from agent network.
  - **Completed Paths**: `mercy-legal-plugin/src/services/api.ts`, `src/App.tsx`, `src/commands.ts`, `manifest.xml`, metadata and skill components.
  - **Result**: Word add-in routes analysis, drafting, citation, ethics, matter-update, and export actions through the agent network and displays reliability metadata.

**Current hardening note**: Office add-in offline localStorage redaction has been applied in `mercy-legal-plugin/src/services/api.ts` as PD027 security hardening. Cache keys no longer contain legal text; queued requests and cached responses persist only redacted metadata, and legacy unsafe cache entries are purged.

## To Do

Pull these in priority order. These are logical next steps from the existing backlog, not new scope.

1. [X] PD028 [Standalone Platform Security] Stop dashboard server-render mutation of shared demo matter.
   - **Target Paths**: `mercy-legal-web/src/lib/core-client.ts`, `mercy-legal-web/src/app/dashboard/page.tsx`, dashboard matter/intake consumers.
   - **Definition of Done**: Loading `/dashboard` performs only read-only core calls; no intake/update/route POST is made during server render, no shared demo matter is mutated, and demo context is local UI fallback only.
   - **Result**: `getCoreSnapshot()` now calls only `/health`, `/v1/product/capabilities`, and `/v1/matters`; the Shaw sample context is local demo-only data labeled in the assistant and matter panels.
   - **Dependencies**: PD001, PD006, PD025.

2. [X] PD029 [Core Security] Add auth and tenant isolation guard for legal endpoints.
   - **Target Paths**: `main.py`, `mercy_context.py`, `.env.example`, tests for protected endpoints.
   - **Definition of Done**: Non-local legal endpoints reject unauthenticated requests; same-tenant matter access succeeds; cross-tenant matter access fails; local dev bypass requires explicit `MERCY_ENV=local` and `MERCY_AUTH_MODE=dev`.
   - **Result**: Added `get_current_tenant_user`, protected core `/v1/*` legal endpoints, threaded tenant/user context into matter context, router, RAG, and agent execution, and added cross-tenant denial audit traces.
   - **Dependencies**: PD003, PD006, PD028.

3. [X] PD030 [Core Agents] Activate real LangGraph runtime with local-only fallback.
   - **Target Paths**: `requirements.txt`, `agent_network.py`, `tests/test_agent_network.py`, `.env.example`.
   - **Definition of Done**: `langgraph` is an installed core dependency, native `StateGraph` execution is used when available, non-local startup fails closed if LangGraph is unavailable, and tests cover native and local fallback modes.
   - **Result**: Added LangGraph dependencies, installed them in the core venv, compiled a native `StateGraph` when available, blocked non-local startup without LangGraph, kept fallback local/dev only, and exposed runtime/version metadata through `/v1/agent/skills`.
   - **Dependencies**: PD026.

4. [X] PD031 [Core RAG] Connect configured vector and graph backend adapters.
   - **Target Paths**: `dc_knowledge_rag.py`, `.env.example`, `tests/test_dc_knowledge_rag.py`.
   - **Definition of Done**: Qdrant and Neo4j configured modes invoke adapter boundaries with mocked clients in tests; backend status reports connected/fallback/blocked truthfully; production-like mode does not silently use seeded demo data.
   - **Result**: Added Qdrant/pgvector/Neo4j adapter boundaries, protected seeded local corpus behind local/dev mode, added tenant-aware metadata filters and LangSmith traces, exposed `/v1/rag/status`, and surfaced RAG backend status in agent skills.
   - **Dependencies**: PD015, PD030.

5. [X] PD032 [Core RAG] Add official D.C. source ingestion and registry contract.
   - **Target Paths**: `dc_knowledge_rag.py`, `datasets/` or `config/` source registry files, `tests/test_dc_knowledge_rag.py`.
   - **Definition of Done**: Source records define authority type, jurisdiction, citation label, official locator, URL/file anchor, last checked, verification status, and refresh cadence; chunks derive from registered sources; seeded chunks are marked `local_demo`.
   - **Result**: Added official D.C. source and chunk ingestion contract, local-demo source registry isolation, `/v1/rag/ingest`, ingestion tracing, production source validation, and status reporting for active official sources and contract fields.
   - **Dependencies**: PD015, PD031.

6. [X] PD033 [Core Evaluation] Improve RAGAS-style eval pass rate to release threshold.
   - **Target Paths**: `ragas_eval.py`, `datasets/dc_golden_dataset.jsonl`, `reports/ragas_eval_report.json`, `tests/test_ragas_eval.py`.
   - **Definition of Done**: Expanded D.C. golden dataset reaches `overall >= 0.72` and `pass_rate >= 0.80`; report groups missing expected context, missing sources, citation failures, hallucinations, and jurisdiction mismatches.
   - **Result**: Expanded the dataset to 45 D.C.-specific cases, added official-source eval fixtures, improved DC/authority/date metadata filtering and ranking, added per-case LangSmith trace links, and generated a passing report with `overall=0.9213` and `pass_rate=1.0`.
   - **Dependencies**: PD031, PD032.

7. [X] PD034 [Verification] Normalize smoke and CI checks for hardening.
   - **Target Paths**: `tests/`, `specs/002-legal-ai-integration/quickstart.md` if created, package scripts where appropriate.
   - **Definition of Done**: One documented verification sequence covers Python legal core tests, compile checks, RAGAS eval, web typecheck/lint/build, add-in lint/build/manifest, dashboard no-mutation, auth guards, and RAG backend fallback checks.
   - **Result**: Added `scripts/verify.py`, `scripts/core_smoke.py`, `scripts/ragas_quick_check.py`, `pyrightconfig.json`, and `make verify`; README now documents the canonical `.\legal_discovery_ai\.venv\Scripts\python.exe scripts\verify.py` health check. End-to-end verification passed with all components green.
   - **Dependencies**: PD028-PD033.

8. [X] PD035 [Persistence] Add PostgreSQL + pgvector persistent storage for matters and D.C. RAG.
   - **Target Paths**: `mercy_storage.py`, `mercy_context.py`, `dc_knowledge_rag.py`, `agent_network.py`, `scripts/core_smoke.py`, `scripts/verify.py`, `.env.example`, `requirements.txt`, `tests/test_persistent_storage.py`.
   - **Definition of Done**: Matters and RAG chunks persist through a SQLAlchemy-backed store when `POSTGRES_URL` or `SUPABASE_URL` is configured; all matter and RAG records are tenant-scoped; local in-memory fallback is allowed only for `MERCY_ENV=local`; Qdrant and Neo4j adapters remain optional; storage operations emit LangSmith-compatible traces.
   - **Result**: Added SQLAlchemy models for matters, official D.C. source records, RAG chunks, and LangGraph checkpoints; replaced the global matter repository with a DB-backed store; persisted PD032 source/chunk ingestion; made pgvector the primary persistent RAG vector backend when a database URL is present; preserved Qdrant/Neo4j optional adapters; updated smoke verification to use temporary DB-backed storage.
   - **Verification**: `unittest discover` passed 35 tests, `pyright` passed, `ruff` passed, `core_smoke.py` passed with DB-backed storage, quick RAGAS passed with `overall=0.9208` and `pass_rate=1.0`.
   - **Dependencies**: PD029, PD030, PD031, PD032, PD034.

9. [X] PD036 [Final Polish] Improve drafting quality, reliability messaging, and UX smoothness across web and Office add-in.
   - **Target Paths**: `agent_network.py`, `tests/test_agent_network.py`, `mercy-legal-web/src/components/dashboard/reliability-panel.tsx`, `mercy-legal-web/src/components/dashboard/ai-assistant-panel.tsx`, `mercy-legal-web/src/components/dashboard/dashboard-workspace.tsx`, `mercy-legal-web/src/lib/core-client.ts`, `mercy-legal-plugin/src/App.tsx`, `mercy-legal-plugin/src/services/api.ts`, `mercy-legal-plugin/src/components/metadata/ReliabilitySignals.tsx`, `mercy-legal-plugin/src/components/metadata/ReliabilitySignals.css`, `mercy-legal-plugin/src/components/skills/McpSkillPanel.tsx`, `mercy-legal-plugin/src/styles/global.css`.
   - **Definition of Done**: Drafting output includes attorney-review disclaimer, D.C.-specific IRAC-style structure, and source verification checklist; Standalone and Office surfaces consistently display MoE route/expert, confidence, guardrail/RAGAS/grounding status, official D.C. source signals, tenant isolation, citations, matter context, LangSmith trace links, loading/error states, and retry/offline messaging.
   - **Result**: Upgraded shared drafting output, added actionable reliability summaries to both UIs, added professional network/auth/core error messages, added retry/error feedback in the dashboard assistant and add-in skill panel, improved add-in offline fallback wording, and surfaced tenant isolation plus official D.C. grounding without new product surfaces.
   - **Verification**: `unittest discover` passed 36 tests, web `typecheck`, `lint`, and `build` passed, add-in `lint`, `build`, and `validate:manifest` passed, `pyright` and targeted `ruff` passed.
   - **Dependencies**: PD003, PD008, PD011-PD013, PD026-PD035.

10. [X] PD037 [Core LLM] Add real LiteLLM provider integration for routing, RAG, drafting, and agents.
   - **Target Paths**: `llm_providers.py`, `legal_task_router.py`, `dc_knowledge_rag.py`, `agent_network.py`, `main.py`, `bridge.py`, `mercy_context.py`, `.env.example`, `requirements.txt`, `tests/test_llm_providers.py`.
   - **Definition of Done**: When OpenAI, Anthropic, Groq, Gemini, or compatible provider keys are configured, MoE routing, RAG answer generation, workspace drafting, and agent drafting/research use LiteLLM calls with provider/model metadata, cost estimates, LangSmith-compatible traces, and safe structured fallback when no provider is configured.
   - **Result**: Added the `llm_providers.py` abstraction, smart fast/reasoning model selection, provider env/model overrides, LLM call envelopes, basic cost estimation, trace metadata, RAG/drafting generation hooks, `/v1/product/capabilities` and `/v1/agent/skills` provider reporting, and tests for no-key fallback plus mocked real-call behavior.
   - **Verification**: `unittest discover -s tests` passed 39 tests, `pyright` passed, `ruff check .` passed, and capability/skill manifests report `mercy-llm-providers-litellm-1.0`.
   - **Dependencies**: PD026, PD030, PD032, PD035, PD036.

11. [X] PD004 [Standalone Platform] Replace remaining mock matter/dashboard data with live core data.
   - **Target Paths**: `mercy-legal-web/src/lib/data.ts`, dashboard components, `src/store/app-store.ts`.
   - **Definition of Done**: Live matter/capability state is used where available; demo-only panels are clearly labeled.
   - **Result**: Removed dashboard mock data and the Zustand demo store, replaced dashboard stats/activity/documents/clause/analyzer panels with live session state from the FastAPI core, and kept marketing-only static data isolated from dashboard workflows.
   - **Dependencies**: PD001, PD003, PD006, PD028, PD029.

12. [X] PD007 [Standalone Platform] Wire document vault uploads to discovery upload endpoint.
   - **Target Paths**: `mercy-legal-web/src/components/dashboard/document-vault.tsx`, upload components, `src/lib/core-client.ts`.
   - **Definition of Done**: Dashboard can submit legal PDFs to `/v1/workspace/discovery/upload` and render facts, risks, guardrails, and source placeholders.
   - **Result**: Document Vault now uploads selected PDFs to `/v1/workspace/discovery/upload`, passes selected matter IDs, renders discovered facts, and displays response-envelope citations/guardrails.
   - **Dependencies**: PD001, PD003, PD029.

13. [X] PD008 [Standalone Platform] Connect AI assistant panel to core routing/drafting/research.
   - **Target Paths**: `mercy-legal-web/src/components/dashboard/ai-assistant-panel.tsx`, `src/lib/core-client.ts`.
   - **Definition of Done**: Assistant prompts include matter context and display route, missing-input, fallback, guardrail, and verification metadata.
   - **Result**: Assistant panel now calls `/v1/rag/retrieve` for D.C. research and `/v1/agent/execute` for drafting/analysis with selected matter context, then displays MoE route, confidence, guardrail/grounding status, citations, matter snapshot, attorney-review warnings, and LangSmith trace links when present.
   - **Dependencies**: PD001, PD003, PD006, PD015, PD028, PD029.

14. [ ] PD016 [Core Source Anchors] Normalize source-anchor fields across discovery, RAG, and drafting.
   - **Target Paths**: `bridge.py`, `dc_knowledge_rag.py`, `response_envelope.py`, `main.py`.
   - **Definition of Done**: Outputs consistently carry authority, page/Bates/chunk, document, URL, verification status, and provenance.
   - **Dependencies**: PD003, PD015, PD032.

15. [ ] PD020 [Security] Define auth and tenant isolation boundary for production client-data use.
   - **Target Paths**: `mercy-legal-web/`, `main.py`, deployment/config docs.
   - **Definition of Done**: Auth provider, API access control, tenant identity, and client-data boundary are documented before persistent production use.
   - **Dependencies**: PD001, PD006, PD029.

16. [ ] PD022 [Verification] Add brownfield smoke-test checklist/runner.
   - **Target Paths**: `tests/`, `specs/002-legal-ai-integration/quickstart.md` if later created, package scripts where appropriate.
   - **Definition of Done**: Checks cover FastAPI endpoints, web build/typecheck/lint, add-in build/lint/manifest, and critical legal metadata flows.
   - **Dependencies**: PD001-PD034.

## Backlog

### Standalone Platform

- [X] PD009 [Standalone Platform] Connect contract analyzer to live document review.
  - **Result**: Contract analyzer no longer uses fake risk rows; it reflects the latest live agent or discovery response, guardrail status, review flags, and reliability metadata.
- [ ] PD010 [Standalone Platform] Connect Stripe/demo checkout to capability metadata.

### Office / Word Add-in

- [X] PD011 [Office Add-in] Route selected text through dedicated clause explanation UI flow.
  - **Result**: Clause explanation remains routed through `/v1/agent/execute`; the taskpane and ribbon now expose selected-clause explanation with rich route, guardrail, citation, grounding, tenant, and attorney-review metadata.
- [X] PD012 [Office Add-in] Route report generation through core-backed analysis.
  - **Result**: Document analysis and risk report generation now rely on agent-network responses and preserve MoE route, confidence, citations, MCP skills, RAGAS hook status, LangSmith trace, matter context, and D.C. ethics metadata in inserted reports.
- [X] PD013 [Office Add-in] Finalize production manifest readiness checklist.
  - **Result**: Manifest now adds intuitive ribbon actions for analyzing the active document, explaining selection, drafting revisions, citation verification, ethics checks, matter updates, and Word export; command functions are wired and manifest validation passes.

### Shared Intelligence Core

- [ ] PD017 [Core Guardrails] Separate missing-input blocks from true ethics/compliance blocks in envelope semantics.
- [ ] PD018 [Legal Discovery AI] Normalize CrewAI output in `bridge.py`.
- [ ] PD019 [Legal Discovery AI] Connect discovery exports to product surfaces.

### Production Readiness

- [ ] PD021 [Persistence] Design encrypted production matter storage with retention, deletion, export, audit, and tenant isolation.

## Parked

- Real MCP server/transport exposure beyond MCP-compatible discovery metadata.
- Advanced pgvector similarity tuning beyond the current tenant-scoped persistent retrieval path.
- LlamaIndex property graph adapter if Neo4j is selected and validated first.
- Full citation finalization workflow beyond provenance and verification flags.

These remain parked until the existing core/web/add-in integration and security backlog items above are stable.
