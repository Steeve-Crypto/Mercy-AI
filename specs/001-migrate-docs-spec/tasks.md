---
description: "Brownfield Kanban task list for integrating the existing Mercy Legal AI codebase"
---

<!--
Purpose: This is the active brownfield implementation backlog for Mercy. It
assumes the Standalone Platform, Office/Word Add-in, Shared Intelligence Core,
and Legal Discovery AI already exist. Tasks should integrate, harden, and align
the current code rather than recreate built surfaces.

Product vision: specs/001-migrate-docs-spec/spec.md
Brownfield architecture: specs/001-migrate-docs-spec/plan.md
Board view: specs/001-migrate-docs-spec/kanban-board.md
-->

# Tasks: Mercy Legal AI Brownfield Integration

**Feature Branch**: `001-migrate-docs-spec`
**Primary Source Of Truth**: [spec.md](./spec.md) for product vision;
[plan.md](./plan.md) for current implementation reality.
**Current Priority**: Wire the already-built Standalone Platform and
Office/Word Add-in to the live Shared Intelligence Core with consistent routing,
matter context, guardrails, source status, and fallback behavior.

## Kanban Policy

**Columns**: Backlog | To Do | In Progress | Review | Done

| Column | WIP Limit | Policy |
|--------|-----------|--------|
| Backlog | No cap | Ordered by product value, integration readiness, and safety. |
| To Do | 6 tasks | Highest priority ready tasks only. |
| In Progress | 4 tasks | Prefer 2-3 active tasks. |
| Review | 3 tasks | Validate live behavior, guardrails, and brownfield fit. |
| Done | No cap | DoD met and board/tasks updated. |

**Definition Of Done For Brownfield Product Tasks**

- The task modifies existing implementation paths instead of creating duplicate
  product surfaces.
- The Standalone Platform or Office Add-in behavior is connected to the live
  Shared Intelligence Core where the task requires it.
- Route, matter, guardrail, source/verification, fallback, and human-review
  metadata are preserved when relevant.
- Local/demo behavior remains safe when model keys, Word APIs, or the backend are
  unavailable.
- Any production data handling remains blocked until auth, tenant isolation,
  encrypted persistence, retention, deletion, and audit controls are implemented.

## Done

### Foundational Documentation Completed

- [X] T001 Create a repository inventory table in [structure-audit.md](./structure-audit.md).
- [X] T004 Record generated, cache, dependency, upload, and local-runtime directories in [cleanup-register.md](./cleanup-register.md).
- [X] T005 Add cleanup decision log fields in [cleanup-register.md](./cleanup-register.md).
- [X] T006 Define project-structure cleanup principles in [cleanup-register.md](./cleanup-register.md).
- [X] T008 Create source-document migration matrix in [source-migration.md](./source-migration.md).
- [X] T009 Map source documents to governing spec, plan, data-model, contract, and quickstart sections in [source-migration.md](./source-migration.md).

### Product Code Already Present Before This Backlog

- [X] BR001 [Core] FastAPI Shared Intelligence Core exists in `main.py`.
- [X] BR002 [Core] Discovery/drafting bridge exists in `bridge.py`.
- [X] BR003 [Core] In-memory matter and billing context exists in `mercy_context.py`.
- [X] BR004 [Compliance] D.C. guardrail middleware exists in `dc_guardrails.py`.
- [X] BR005 [Compliance] Clerk OS prompt and rule schema exist in `system_prompts.py`.
- [X] BR006 [Standalone Platform] FastAPI-served local dashboard exists in `standalone_platform/`.
- [X] BR007 [Standalone Platform] Substantial Next.js dashboard/product app exists in `mercy-legal-web/`.
- [X] BR008 [Office Add-in] Lightweight local Word taskpane exists in `word_plugin/`.
- [X] BR009 [Office Add-in] Production-oriented Vite/React Word add-in exists in `mercy-legal-plugin/`.
- [X] BR010 [Legal Discovery AI] CrewAI discovery engine and Streamlit UI exist in `legal_discovery_ai/`.
- [X] BR011 [Tooling] Local CLI exists in `tools/mercy_cli.py`.

### Product Integration Completed

- [X] PD001 [Standalone Platform] Add a typed FastAPI core client to `mercy-legal-web`.
  - **Completed Paths**: `mercy-legal-web/src/lib/core-client.ts`, `mercy-legal-web/src/app/dashboard/page.tsx`, `mercy-legal-web/src/components/dashboard/matter-management.tsx`, `mercy-legal-web/eslint.config.mjs`.
  - **Result**: The Next.js dashboard can call `/health`, `/v1/product/capabilities`, `/v1/matters`, and `/v1/matters/{id}` through one typed client with local/demo fallback.

- [X] PD002 [Office Add-in] Replace mocked add-in AI service with configurable core API calls.
  - **Completed Paths**: `mercy-legal-plugin/src/services/api.ts`, `mercy-legal-plugin/src/types/index.ts`, `mercy-legal-plugin/.eslintignore`.
  - **Result**: The production-oriented Word add-in now calls the Shared Intelligence Core for document analysis, clause explanation, and revision through `/v1/workspace/draft`, with preview fallback if the core is unavailable.

- [X] PD014 [Core MoE] Add route inspection endpoint.
  - **Completed Paths**: `legal_task_router.py`, `main.py`, `mercy_context.py`, `dc_guardrails.py`, `tests/test_legal_task_router.py`.
  - **Result**: The core now exposes `/v1/router/inspect`, returns a typed MoE router envelope with expert, confidence, guardrail status, citations, fallback, and missing-input metadata, and records route history on matters when a matter ID is supplied.

- [X] PD003 [Core Contract] Add brownfield route and response metadata envelope to existing core outputs.
  - **Completed Paths**: `response_envelope.py`, `main.py`, `bridge.py`, `legal_task_router.py`, `tests/test_response_envelope.py`, `mercy-legal-web/src/lib/core-client.ts`, `mercy-legal-web/src/components/dashboard/ai-assistant-panel.tsx`, `mercy-legal-plugin/src/types/index.ts`, `mercy-legal-plugin/src/services/api.ts`, `mercy-legal-plugin/src/components/risk/RiskSummary.tsx`, `mercy-legal-plugin/src/components/chat/AssistantChat.tsx`, `mercy-legal-plugin/src/components/document/DocumentActions.tsx`.
  - **Result**: Router, draft, discovery, upload, billing, and Clerk OS legal outputs now expose `response_envelope` with route/expert, confidence, normalized `pass | warn | block` guardrail status, citation provenance, D.C. ethics metadata, matter context snapshot, and audit timestamp while preserving brownfield payload fields.

- [X] PD005 [Office Add-in] Display guardrail, route, and verification status in the Word add-in.
  - **Completed Paths**: `mercy-legal-plugin/src/types/index.ts`, `mercy-legal-plugin/src/services/api.ts`, `mercy-legal-plugin/src/components/risk/RiskSummary.tsx`, `mercy-legal-plugin/src/components/chat/AssistantChat.tsx`, `mercy-legal-plugin/src/components/document/DocumentActions.tsx`.
  - **Result**: The Word add-in consumes the canonical `response_envelope` and displays route confidence, guardrail status, citation status, D.C. ethics metadata, matter snapshot hash, and audit timestamp in review, chat, and generated reports.

- [X] PD006 [Core Matter/Intake] Extend matter context for structured intake.
  - **Completed Paths**: `mercy_context.py`, `main.py`, `legal_task_router.py`, `tests/test_matter_context.py`, `mercy-legal-web/src/lib/core-client.ts`, `mercy-legal-web/src/app/dashboard/page.tsx`, `mercy-legal-web/src/components/dashboard/ai-assistant-panel.tsx`, `mercy-legal-web/src/components/dashboard/matter-management.tsx`, `mercy-legal-plugin/src/types/index.ts`, `mercy-legal-plugin/src/services/api.ts`, `mercy-legal-plugin/src/components/risk/RiskSummary.tsx`, `mercy-legal-plugin/src/components/chat/AssistantChat.tsx`, `mercy-legal-plugin/src/components/document/DocumentActions.tsx`.
  - **Result**: The core now supports structured matter intake through `/v1/matter/intake`, stores client/matter identity, key facts, documents, history, deadlines, sensitivity flags, and missing information in the in-memory context service, hydrates MoE router decisions by `matter_id`, and displays the active matter context in both the Next.js dashboard and Word add-in.

- [X] PD015 [Core Research] Add D.C. legal research response endpoint or skill.
  - **Completed Paths**: `dc_knowledge_rag.py`, `main.py`, `legal_task_router.py`, `mercy_context.py`, `tests/test_dc_knowledge_rag.py`.
  - **Result**: The core now exposes `/v1/rag/retrieve`, returns hybrid vector + graph D.C. knowledge results wrapped in the standard `response_envelope`, carries provenance/citation metadata on every chunk, applies an agentic verification loop with router/compliance signals, and automatically injects relevant D.C. knowledge into MoE research and drafting routes.

- [X] PD023 [Core Evaluation] Add RAGAS evaluation pipeline and initial D.C. golden dataset.
  - **Completed Paths**: `ragas_eval.py`, `datasets/dc_golden_dataset.jsonl`, `reports/ragas_eval_report.json`, `main.py`, `mercy_context.py`, `tests/test_ragas_eval.py`.
  - **Result**: The core now has a local CI-runnable RAGAS-style evaluation pipeline with faithfulness, answer relevancy, context precision, context recall, and answer correctness metrics; `/v1/rag/evaluate` returns an enveloped report; and the initial 24-row D.C. golden dataset exercises ethics, confidentiality, supervision, D.C. Circuit, and administrative-record retrieval.

- [X] PD024 [Observability] Add LangSmith config and observability dashboard outline.
  - **Completed Paths**: `observability.py`, `main.py`, `legal_task_router.py`, `dc_knowledge_rag.py`, `mercy_context.py`, `.env.example`, `config/langsmith_project.json`, `tests/test_observability.py`.
  - **Result**: The FastAPI core now records local traces and optional LangSmith runs for matter context, router, RAG, RAGAS, discovery, and drafting flows; `/v1/observability/trace` exposes router decisions, RAG retrieval quality, guardrail violations, surface latency, and LangSmith UI setup metadata; and LangSmith environment/project config is documented for local use.

- [X] PD025 [Core Intake] Add full client intake flow and prompt library.
  - **Completed Paths**: `client_intake_flow.py`, `prompts/intake.py`, `main.py`, `legal_task_router.py`, `mercy_context.py`, `tests/test_client_intake_flow.py`, `mercy-legal-web/src/lib/core-client.ts`, `mercy-legal-web/src/app/dashboard/page.tsx`, `mercy-legal-web/src/components/dashboard/ai-assistant-panel.tsx`, `mercy-legal-web/src/components/dashboard/matter-management.tsx`, `mercy-legal-plugin/src/types/index.ts`, `mercy-legal-plugin/src/services/api.ts`, `mercy-legal-plugin/src/components/risk/RiskSummary.tsx`, `mercy-legal-plugin/src/components/chat/AssistantChat.tsx`, `mercy-legal-plugin/src/components/document/DocumentActions.tsx`.
  - **Result**: The core now exposes `/v1/matter/intake/full` for multi-step D.C. client intake, normalizes client, matter, fact, conflict, scope, document, deadline, and confidentiality inputs into `MatterContext`, returns the standard `response_envelope` with an intake summary, and both the Next.js dashboard and Word add-in consume and display conflict/scope/matter summary metadata.

- [X] PD026 [Core Agents] Add LangGraph-compatible agent network and MCP skill layer.
  - **Completed Paths**: `agent_network.py`, `agents/__init__.py`, `main.py`, `legal_task_router.py`, `mercy_context.py`, `tests/test_agent_network.py`.
  - **Result**: The core now exposes `/v1/agent/skills` for MCP-compatible skill discovery and `/v1/agent/execute` for MoE-routed agent execution, with Research, Drafting, Compliance, Intake, and Citation Verifier agents, reusable MCP skill schemas for citation verification, D.C. ethics checks, matter-context updates, and Word export payloads, plus LangSmith traces, strict grounding metadata, RAGAS hooks, MatterContext hydration, and standard `response_envelope` wrapping.

- [X] PD027 [Office Add-in] Power Word taskpane and ribbon actions from the agent network.
  - **Completed Paths**: `mercy-legal-plugin/src/services/api.ts`, `mercy-legal-plugin/src/types/index.ts`, `mercy-legal-plugin/src/App.tsx`, `mercy-legal-plugin/src/commands.ts`, `mercy-legal-plugin/manifest.xml`, `mercy-legal-plugin/src/components/metadata/ReliabilitySignals.tsx`, `mercy-legal-plugin/src/components/metadata/ReliabilitySignals.css`, `mercy-legal-plugin/src/components/skills/McpSkillPanel.tsx`, `mercy-legal-plugin/src/components/skills/McpSkillPanel.css`, `mercy-legal-plugin/src/components/risk/RiskSummary.tsx`, `mercy-legal-plugin/src/components/chat/AssistantChat.tsx`, `mercy-legal-plugin/src/components/document/DocumentActions.tsx`, `main.py`.
  - **Result**: The Word add-in now routes analysis, clause explanation, drafting/revision, citation checks, ethics checks, matter updates, and Word export actions through `/v1/agent/execute`; discovers MCP skills from `/v1/agent/skills`; displays route, expert, confidence, guardrail, grounding, RAGAS, citation, matter, offline cache, and LangSmith trace metadata; includes ribbon buttons for key MCP skills; and queues/caches agent requests when offline for later sync.

## To Do

Pull these first in priority order. They are integration tasks for existing code.

1. [ ] PD004 [Standalone Platform] Replace mock matter/dashboard data with live core data.
   - **Target Paths**: `mercy-legal-web/src/lib/data.ts`, `mercy-legal-web/src/components/dashboard/matter-management.tsx`, `document-vault.tsx`, `activity-feed.tsx`, `app-store.ts`.
   - **Definition of Done**: Dashboard displays live matter/capability state from the core where available and marks mock/demo-only sections clearly when live data is absent.
   - **Dependencies**: PD001.
   - **Parallel**: Can run with PD005 after PD001 client exists.

2. [ ] PD007 [Standalone Platform] Wire document vault uploads to discovery upload endpoint.
   - **Definition of Done**: `mercy-legal-web` can submit legal PDFs to
     `/v1/workspace/discovery/upload`, display progress/failure, and show returned
     facts, risks, guardrails, and source placeholders.
   - **Dependencies**: PD001, PD003.

3. [ ] PD008 [Standalone Platform] Connect AI assistant panel to core routing/drafting/research.
   - **Definition of Done**: Assistant prompts include matter context and display
     route, missing-input, fallback, guardrail, and verification metadata.
   - **Dependencies**: PD001, PD003, PD006.

## Backlog

### Standalone Platform

9. [ ] PD009 [Standalone Platform] Connect contract analyzer to live document review.
   - **Definition of Done**: Contract analyzer uses core/discovery output rather
     than `analysisBreakdown` mocks for live documents, with demo fallback retained.
   - **Dependencies**: PD001, PD003, PD007.

10. [ ] PD010 [Standalone Platform] Connect Stripe/demo checkout to capability metadata.
    - **Definition of Done**: Plans from checkout and product capabilities map to
      entry, paid, premium, production-gated, and future-expansion labels.
    - **Dependencies**: PD003.

### Office / Word Add-In

11. [ ] PD011 [Office Add-in] Route selected text through clause explanation.
    - **Definition of Done**: Selected Word text is sent to the core with
      `surface_context=word_addin` and returns D.C. risk, explanation, and
      verification metadata.
    - **Dependencies**: PD002, PD003.

12. [ ] PD012 [Office Add-in] Route report generation through core-backed analysis.
    - **Definition of Done**: Risk report generation uses live analysis results
      and includes guardrail/source status before insertion.
    - **Dependencies**: PD002, PD005.

13. [ ] PD013 [Office Add-in] Finalize production manifest readiness checklist.
    - **Definition of Done**: Manifest generation, HTTPS URL, icon assets,
      support URL, privacy/terms placeholders, validation command, and sideload
      instructions are documented and checked.
    - **Dependencies**: Existing `manifest.xml` and production manifest script.

### Shared Intelligence Core / MoE

15. [ ] PD016 [Core Source Anchors] Normalize source-anchor fields.
    - **Definition of Done**: Discovery, research, and drafting outputs can carry
      authority, page, Bates/chunk, document, URL, status, and verification flags.
    - **Dependencies**: PD003, PD007.

16. [ ] PD017 [Core Guardrails] Promote existing guardrail middleware into reusable compliance envelope.
    - **Definition of Done**: Core responses consistently expose confidentiality,
      privilege, human-review, citation-verification, record-verification, fee,
      retention, and unsupported-request signals.
    - **Dependencies**: PD003.

### Legal Discovery AI

18. [ ] PD018 [Legal Discovery AI] Normalize CrewAI output in `bridge.py`.
    - **Definition of Done**: Crew outputs are mapped to facts, parties, timeline,
      issues, risks, missing elements, next actions, quality warnings, source
      placeholders, and guardrails in one stable shape.
    - **Dependencies**: PD003, existing `legal_discovery_ai` crew.

19. [ ] PD019 [Legal Discovery AI] Connect discovery exports to product surfaces.
    - **Definition of Done**: Markdown/PDF/DOCX/JSON report concepts from
      Streamlit are represented in web/add-in report actions or explicitly parked.
    - **Dependencies**: PD007, PD012, PD018.

### Production Readiness

20. [ ] PD020 [Security] Define auth and tenant isolation boundary for `mercy-legal-web`.
    - **Definition of Done**: Auth shell placeholders are mapped to a real provider
      plan and core access-control requirements before external client-data use.
    - **Dependencies**: PD001, PD006.

21. [ ] PD021 [Persistence] Design encrypted production matter storage.
    - **Definition of Done**: Production storage is specified with encryption,
      tenant isolation, retention, deletion, export, audit, and local/demo
      migration rules.
    - **Dependencies**: PD006, PD020.

22. [ ] PD022 [Verification] Add brownfield smoke-test checklist.
    - **Definition of Done**: Checks cover FastAPI health/matters/draft/discovery,
      Next dashboard core integration, Vite add-in preview/live fallback, Word
      insertion, guardrail display, and discovery output normalization.
    - **Dependencies**: PD001-PD005.

## Parked Documentation Backlog

The old migration/cleanup task range remains parked:

- T002, T003, T007, T010-T060

Promote one only when it directly supports live product integration, legal
safety, privacy, source-of-truth integrity, build verification, or release
readiness.
