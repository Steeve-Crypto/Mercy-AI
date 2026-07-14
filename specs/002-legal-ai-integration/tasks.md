---
description: "Active Kanban backlog for specs/002-legal-ai-integration"
---

# Tasks: Mercy Legal AI Integration

**Feature Branch**: `002-legal-ai-integration`
**Primary Source Of Truth**: [spec.md](./spec.md) and [plan.md](./plan.md)
**Current Priority**: Hosted beta activation plus long-horizon legal intelligence. Shared FastAPI core, MoE, agents, RAG, web productization, and Office surfaces remain the foundation. **Mercy LARS / ALTS-MoE** (`lars/`, `/v1/lars/*`, web `/lars`) adds durable assignment compilation, adaptive legal tree search, MoE-backed node execution, attorney gates, and tenant-isolated job state without replacing existing routers or agents.

## Current State Snapshot

Mercy now has a strong backend and integration layer:

- **Shared Intelligence Core**: FastAPI endpoints for health, capabilities, auth-protected matters, intake, router inspection, RAG retrieval/status/ingest/evaluation, observability, Agent X execution, templates, beta, monitoring, security, discovery, and drafting.
- **Agent X**: `agent_network.py` and `hermes_intelligence.py` provide LangGraph-compatible ReACT agents, Hermes reflection/memory hooks, MCP-compatible skill manifests, sandboxed skill execution, and deterministic local fallback.
- **D.C. Knowledge Base**: seeded official D.C. source records and chunks exist, with PostgreSQL/pgvector support and local fallback.
- **RAGAS/Regression**: deterministic reports show the current seeded corpus passing local thresholds, including the 200-case advanced regression report.
- **Office Add-ins**: `mercy-legal-plugin/` uses one host-aware Word/Outlook task pane, request-scoped read-only matter context, Agent X execution, shared reliability metadata, redacted offline state, and explicit approval before document or draft changes. Outlook has no send capability. Live Microsoft 365 host validation remains open.
- **Standalone Web**: `mercy-legal-web/` has a typed core client and live product surfaces. **LARS is globally integrated** (no `/lars` page, no Assignments landing/sidebar): job detail at `/assignments/{jobId}` or `/matters/{matterId}/assignments/{jobId}`, Matter LARS tab, Chat LARS mode, Research Continue-as-LARS + ALTS panel, Vault source scope, History/Dashboard summaries, shared composer/status, full ALTS Research Map in the detail workspace.
- **Mercy LARS / ALTS-MoE**: Durable jobs (`lars/`, `/v1/lars/*`, `mercy_lars_jobs` migration), ALTS Research Map on assignment workspace, phase-aware attorney gates, leased background workers + SSE events, source usage tracing, Office Word `LarsPanel` for gates/inserts/start, depth budget modes (focused/standard/deep/custom).

Legacy root docs may still describe older in-memory/basic behavior. This task file and `plan.md` are the active implementation status source of truth.

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

Pull these in priority order. These are logical next steps from the existing backlog, not new scope. PD001-PD045c are largely backend/integration milestones and are marked Done where current code and reports support that status. PD046+ are the current productization priorities.

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

11. [X] PD038 [Core RAG] Add D.C. knowledge base seeding pipeline.
   - **Target Paths**: `scripts/seed_dc_knowledge.py`, `dc_knowledge_rag.py`, `.env.example`, `.gitignore`, `tests/test_seed_dc_knowledge.py`, `specs/002-legal-ai-integration/plan.md`, `specs/002-legal-ai-integration/tasks.md`.
   - **Definition of Done**: `python -m scripts.seed_dc_knowledge --source=all --refresh` ingests only official D.C. source records through the PD032 contract, creates at least 500 tenant-safe chunks, persists through the PD035 repository, records LangSmith-compatible seed traces and reports, supports incremental refresh, and updates `/v1/rag/status` with seeded source count, last successful seed date, practice-area coverage, and health.
   - **Result**: Added the seeding CLI, official D.C. source catalog for D.C. Code titles, Superior Court rules, DCMR titles, D.C. Court of Appeals opinion locators, and D.C. court forms/templates; added legal-aware locator chunking with headings, citations, official locators, practice areas, difficulty, relevance-to-solos, and last-updated metadata; added optional LiteLLM enrichment; fixed persistent public RAG chunks so tenant-scoped retrieval can see public official knowledge; and added seed health reporting to `rag_backend_status()`.
   - **Verification**: `python -m scripts.seed_dc_knowledge --source=all --refresh` passed against a persistent SQLAlchemy DB with 74 official source records, 1,145 chunks, 0 validation failures, and healthy status. `unittest discover -s tests` passed 41 tests, `pyright` passed, and `ruff check .` passed.
   - **Dependencies**: PD032, PD035, PD037.

12. [X] PD039 [Core Prompts] Add D.C.-specific prompt templates and few-shot library.
   - **Target Paths**: `prompts/dc_legal_prompts.py`, `prompts/registry.py`, `prompts/fewshot/dc_examples.jsonl`, `llm_providers.py`, `agent_network.py`, `mercy_context.py`, `scripts/test_prompts.py`, `tests/test_prompt_registry.py`.
   - **Definition of Done**: At least 12 versioned D.C.-specific prompt templates and matching few-shot examples are centrally registered; prompts enforce official D.C. source grounding, attorney-review disclaimers, structured output, and seeded-knowledge usage; MoE routing, LangGraph agents, LLM drafting/research, MCP citation/ethics skills, `/v1/agent/skills`, and `/v1/product/capabilities` surface prompt metadata; prompt selection/rendering is LangSmith-traced.
   - **Result**: Added 13 D.C.-optimized prompt templates covering intake, official-source research, Superior Court motion/pleading drafting, contracts/retainers/redlines, family law, zoning, administrative appeals, small-business compliance, ethics/RPC checks, citation verification, and landlord-tenant motion practice. Added 12 JSONL few-shot examples, a dynamic `PromptRegistry`, CLI prompt preview/validation, expert-aware template selection, LLM provider integration, agent skill prompt metadata, and capability/manifest reporting.
   - **Verification**: `python -m scripts.test_prompts --task=motion_drafting --count=5` passed with `motion_drafting_superior_court`, 13 templates, and 12 few-shot examples. `unittest discover -s tests -p "test_*.py"` passed 47 tests, `pyright` passed, and `ruff check .` passed.
   - **Dependencies**: PD032, PD035, PD037, PD038.

13. [X] PD040 [Templates + Onboarding] Add D.C. template gallery and beta onboarding flow.
   - **Target Paths**: `template_gallery.py`, `main.py`, `mercy_context.py`, `tests/test_template_gallery.py`, `mercy-legal-web/src/lib/core-client.ts`, `mercy-legal-web/src/components/dashboard/template-gallery.tsx`, `mercy-legal-web/src/components/dashboard/beta-onboarding.tsx`, `mercy-legal-web/src/components/dashboard/dashboard-workspace.tsx`, `mercy-legal-plugin/src/services/api.ts`, `mercy-legal-plugin/src/types/index.ts`, `mercy-legal-plugin/src/App.tsx`, `mercy-legal-plugin/src/components/templates/`.
   - **Definition of Done**: `/v1/templates/gallery` returns a tenant-aware, filterable catalog with at least 25 D.C.-specific templates; Standalone Platform and Office add-in expose a clean gallery with one-click generation through `/v1/agent/execute`; first-use onboarding explains matter setup, guardrails, citations, attorney review, and D.C. ethics; template usage is traced; generated outputs carry prompt, source-grounding, tenant, and attorney-review metadata.
   - **Result**: Added 26 production D.C. templates across retainers, Superior Court civil/family/criminal motions and pleadings, zoning, administrative appeals, small-business formation/compliance, client intake, demand letters, settlement agreements, discovery requests, and citation verification. Added gallery status to product capabilities, LangSmith-compatible template view/usage traces, Standalone beta onboarding and quick matter creation, dashboard one-click generation, and Office add-in template tab with live generation from the active Word document.
   - **Verification**: `unittest discover -s tests -p "test_*.py"` passed 51 tests, `pyright` passed, targeted `ruff` passed, web `typecheck`, `lint`, and `build` passed, Office add-in `lint`, `build`, and `validate:manifest` passed.
   - **Dependencies**: PD032, PD038, PD039.

14. [X] PD041 [Beta Launch] Add limited beta launch package.
   - **Target Paths**: `beta_launch.py`, `main.py`, `mercy_context.py`, `tests/test_beta_launch.py`, `mercy-legal-web/src/lib/core-client.ts`, `mercy-legal-web/src/components/dashboard/beta-launch-panel.tsx`, `mercy-legal-web/src/components/dashboard/beta-feedback.tsx`, `mercy-legal-web/src/components/dashboard/dashboard-workspace.tsx`, `mercy-legal-plugin/src/services/api.ts`, `mercy-legal-plugin/src/types/index.ts`, `mercy-legal-plugin/src/App.tsx`, `mercy-legal-plugin/src/components/beta/`.
   - **Definition of Done**: Core supports invite-only beta status, waitlist, invite acceptance, downloadable D.C.-appropriate DPA and beta terms, monthly strong-model quotas with fast-model allowance, welcome sequence metadata, feedback collection with tracing, and lightweight analytics. Standalone and Office surfaces show beta branding, quota/welcome elements, legal docs, feedback prompts, and analytics where appropriate.
   - **Result**: Added `mercy-limited-beta-1.0` with `/v1/beta/status`, `/v1/beta/waitlist`, `/v1/beta/invites`, `/v1/beta/invites/accept`, `/v1/beta/legal/{dpa|terms}`, `/v1/beta/feedback`, and `/v1/beta/analytics`; added strong-model quota enforcement for routed agent research/drafting, local/dev beta activation, feedback and usage LangSmith-compatible traces, D.C. attorney responsibility language in beta documents, dashboard beta launch/analytics panel, web feedback widgets, and Office add-in beta quota/welcome/feedback panel.
   - **Verification**: `unittest discover -s tests -p "test_*.py"` passed 57 tests, `pyright` passed, targeted `ruff` passed, web `typecheck`, `lint`, and `build` passed, Office add-in `lint`, `build`, and `validate:manifest` passed.
   - **Dependencies**: PD029, PD037, PD040.

15. [X] PD042 [Security] SOC 2 Type 1 preparation and security hardening.
   - **Target Paths**: `security_controls.py`, `mercy_storage.py`, `mercy_context.py`, `dc_knowledge_rag.py`, `llm_providers.py`, `main.py`, `scripts/check_security_compliance.py`, `docs/compliance/`, `tests/test_security_compliance.py`, `mercy-legal-web/src/components/dashboard/beta-launch-panel.tsx`, `mercy-legal-plugin/src/components/beta/`.
   - **Definition of Done**: SOC 2 Type 1 readiness checklist and customer-facing security/privacy docs exist; sensitive actions are audited through LangSmith-compatible traces and DB audit logs; `/v1/*` endpoints have security headers, CORS hardening, rate limiting, and optional HTTPS enforcement; LLM/RAG flows sanitize/redact PII; users can delete tenant data with soft-delete retention semantics; automated compliance checks are runnable; web and Office surfaces show trust signals.
   - **Result**: Added `mercy-security-controls-1.0`, DB audit log records, matter soft-delete fields, `DELETE /v1/account/data`, `/v1/security/compliance`, `/v1/*` rate limiting and security headers, PII redaction hooks in LLM/RAG/API flows, compliance docs, CLI compliance report with Bandit/npm audit hooks, and security trust cards in the Standalone beta panel plus Office add-in beta panel.
   - **Verification**: Added targeted `tests/test_security_compliance.py` and `python -m scripts.check_security_compliance` coverage for required docs, security headers, sanitization, compliance status, and delete-all-data behavior.
   - **Dependencies**: PD029, PD035, PD037, PD041.

16. [X] PD043 [Monitoring] Production monitoring, alerting, and cost tracking.
   - **Target Paths**: `monitoring.py`, `main.py`, `llm_providers.py`, `legal_task_router.py`, `mercy_context.py`, `scripts/monitoring.py`, `.env.example`, `tests/test_monitoring.py`, `pyrightconfig.json`.
   - **Definition of Done**: Admin-only monitoring endpoints expose beta user/tenant counts, daily/weekly usage, token/template usage, per-user/tenant/model/provider costs, RAGAS/grounding health, guardrail triggers, error rates, quota warnings, and configurable dry-run or live alerts. LiteLLM calls record cost events, the MoE router applies tenant daily cost caps, the CLI reports status, and monitoring payloads minimize PII.
   - **Result**: Added `mercy-monitoring-ops-1.0` with `/v1/monitoring/dashboard`, `/v1/monitoring/metrics`, `/v1/monitoring/cost/breakdown`, `python -m scripts.monitoring status --days=7`, in-memory cost event tracking from LiteLLM metadata, admin/ops role enforcement outside local dev, Slack/email alert dispatch configuration, quota/cost/guardrail/error alert evaluation, and route-level cost cap metadata.
   - **Verification**: Added `tests/test_monitoring.py`; targeted monitoring tests, CLI JSON status, and Python compile checks passed.
   - **Dependencies**: PD024, PD037, PD041, PD042.

17. [X] PD044 [Evaluation] Advanced RAGAS regression suite on the full seeded D.C. corpus.
   - **Target Paths**: `evals/ragas_harness.py`, `evals/run_regression.py`, `evals/regression_status.py`, `evals/datasets/dc_regression_golden.jsonl`, `evals/reports/`, `dc_knowledge_rag.py`, `monitoring.py`, `tests/test_advanced_ragas_regression.py`, `pyrightconfig.json`.
   - **Definition of Done**: `python -m evals.run_regression --corpus=full` evaluates the PD038 seeded corpus of 1,145+ official D.C. chunks against a validated 200+ case D.C. golden set; report includes faithfulness, context precision, answer relevancy, citation accuracy, D.C. grounding score, per-case failure analysis with LangSmith trace links, practice-area breakdown, pass/fail thresholds, and regression deltas; latest health surfaces in `/v1/rag/status` and `/v1/monitoring/metrics`.
   - **Result**: Added `advanced-dc-ragas-regression-1.0`, deterministic full-corpus rebuild from the PD038 seeding contract, 200-case generated golden dataset, latest regression report status reader, CLI runner, LangSmith-compatible summary/case traces, custom legal failure taxonomy, latest report at `evals/reports/latest_regression_report.json`, and status integration for RAG and monitoring.
   - **Verification**: `python -m evals.run_regression --corpus=full --json` passed with 74 sources, 1,145 chunks, 200 cases, `overall_score=0.9731`, `pass_rate=1.0`, `faithfulness=1.0`, `context_precision=1.0`, `citation_accuracy=0.9476`, and `dc_grounding_score=1.0`.
   - **Dependencies**: PD032, PD033, PD038, PD043.

18. [X] PD045a [Fine-Tuning] LoRA/QLoRA fine-tune pipeline skeleton.
   - **Target Paths**: `finetune/lora_setup.py`, `finetune/dataset_builder.py`, `finetune/status.py`, `finetune/data/`, `scripts/prepare_lora_dataset.py`, `scripts/train_lora.py`, `monitoring.py`, `dc_knowledge_rag.py`, `tests/test_finetune_pipeline.py`, `pyrightconfig.json`.
   - **Definition of Done**: The pipeline prepares LoRA/QLoRA-ready training JSONL from the PD044 200+ case D.C. golden set plus high-quality LangSmith regression traces; records include PD039 system prompts, instruction/response pairs, structured JSON assistant outputs, practice-area/difficulty/source metadata, and attorney-review/official-D.C.-grounding controls. Training launch supports PEFT, bitsandbytes, Hugging Face Trainer, QLoRA 4-bit defaults, and a post-tune PD044 regression validation path.
   - **Result**: Added `dc-lora-qlora-dataset-1.0`, dataset preparation CLI, safe QLoRA launch CLI, generated 180 train / 20 validation records under `finetune/data/`, launch-plan artifacts under `finetune/runs/`, dependency-aware `plan_only` fallback when optional ML packages are absent, and fine-tuning readiness status in `/v1/rag/status` and `/v1/monitoring/metrics`.
   - **Verification**: `python -m scripts.prepare_lora_dataset --golden=dc_regression_golden --output=finetune/data/` produced 200 records with 200 LangSmith trace references; `python -m scripts.train_lora --base-model=meta-llama/Meta-Llama-3.1-8B-Instruct --epochs=3` produced a QLoRA launch plan; targeted fine-tune/monitoring/RAGAS tests, Ruff, and Pyright passed.
   - **Dependencies**: PD038, PD039, PD044.

19. [X] PD045b [Core Agents] Add ReACT loops and secure MCP sandbox layer.
   - **Target Paths**: `agent_network.py`, `scripts/test_agent_react.py`, `tests/test_agent_network.py`, `specs/002-legal-ai-integration/plan.md`, `specs/002-legal-ai-integration/tasks.md`.
   - **Definition of Done**: Research, Drafting, Compliance, Intake, and Citation Verifier agents execute stateful ReACT cycles (`Reason -> Act -> Observe -> Repeat`) through LangGraph when available and deterministic local fallback otherwise; every MCP skill runs through a restricted sandbox with input/output validation, sanitization, no arbitrary code execution, tenant-aware context, user-safe blocked failure responses, and LangSmith-compatible traces. `/v1/agent/skills` reports `react_enabled` and `sandbox_status` for each skill, and the full PD044 regression remains at or above `overall_score >= 0.97`.
   - **Result**: Replaced the single-node agent graph with explicit `reason`, `act`, and `observe` graph nodes plus conditional cycles; added ReACT metadata to agents/results/checkpoints; added `mcp-secure-sandbox-1.0` for allowlisted skill execution; added sandbox metadata to skill manifests; and added `python -m scripts.test_agent_react --agent=ResearchAgent --cycles=3`.
   - **Verification**: `python -m scripts.test_agent_react --agent=ResearchAgent --cycles=3` completed 3 cycles with sandboxed `cite_and_verify`; all specialized agents passed CLI smoke checks; targeted agent tests, Ruff, and Pyright passed; full PD044 regression passed with 200 cases and `overall_score=0.9731`.
   - **Dependencies**: PD026, PD029, PD030, PD032, PD038, PD044.

20. [X] PD045c [Core Agents] Add Hermes intelligence layer inside expert agents.
   - **Target Paths**: `hermes_intelligence.py`, `agent_network.py`, `llm_providers.py`, `legal_task_router.py`, `scripts/test_hermes.py`, `tests/test_agent_network.py`, `tests/test_legal_task_router.py`, `pyrightconfig.json`, `specs/002-legal-ai-integration/plan.md`, `specs/002-legal-ai-integration/tasks.md`.
   - **Definition of Done**: Research, Drafting, Compliance, Intake, and Citation Verifier agents use Hermes as the internal intelligence layer across ReACT cycles; Hermes keeps tenant-scoped memory, recommends MCP skill reuse, learns from PD038 seeded D.C. knowledge and PD044 golden/regression metadata, reflects over ReACT observations and LangSmith/local trace summaries, uses Hermes-class LiteLLM models when configured, and falls back gracefully without provider keys. The MoE router marks complex legal tasks for Hermes-powered expert delegation while keeping simple routes on fast paths.
   - **Result**: Added `hermes-agent-intelligence-1.0`, Hermes reasoning/reflection hooks in every agent `reason` and `observe` phase, tenant/matter-scoped in-process memory, domain learning snapshots from seeded knowledge and regression health, workflow improvement summaries, OpenRouter/NouseResearch Hermes model preference through LiteLLM, `/v1/agent/skills` Hermes status, router `hermes_delegation` metadata, and `python -m scripts.test_hermes --agent=DraftingAgent --cycles=3`.
   - **Verification**: Hermes CLI passed for Drafting, Research, Compliance, Citation Verifier, and Intake agents; targeted agent/router tests, Ruff, and Pyright passed; full PD044 regression passed with 200 cases and `overall_score=0.9731`.
   - **Dependencies**: PD029, PD038, PD044, PD045b.

21. [X] PD004 [Standalone Platform] Replace remaining mock matter/dashboard data with live core data.
   - **Target Paths**: `mercy-legal-web/src/lib/data.ts`, dashboard components, `src/store/app-store.ts`.
   - **Definition of Done**: Live matter/capability state is used where available; demo-only panels are clearly labeled.
   - **Result**: Removed dashboard mock data and the Zustand demo store, replaced dashboard stats/activity/documents/clause/analyzer panels with live session state from the FastAPI core, and kept marketing-only static data isolated from dashboard workflows.
   - **Dependencies**: PD001, PD003, PD006, PD028, PD029.

22. [X] PD007 [Standalone Platform] Wire document vault uploads to discovery upload endpoint.
   - **Target Paths**: `mercy-legal-web/src/components/dashboard/document-vault.tsx`, upload components, `src/lib/core-client.ts`.
   - **Definition of Done**: Dashboard can submit legal PDFs to `/v1/workspace/discovery/upload` and render facts, risks, guardrails, and source placeholders.
   - **Result**: Document Vault now uploads selected PDFs to `/v1/workspace/discovery/upload`, passes selected matter IDs, renders discovered facts, and displays response-envelope citations/guardrails.
   - **Dependencies**: PD001, PD003, PD029.

23. [X] PD008 [Standalone Platform] Connect AI assistant panel to core routing/drafting/research.
   - **Target Paths**: `mercy-legal-web/src/components/dashboard/ai-assistant-panel.tsx`, `src/lib/core-client.ts`.
   - **Definition of Done**: Assistant prompts include matter context and display route, missing-input, fallback, guardrail, and verification metadata.
   - **Result**: Assistant panel now calls `/v1/rag/retrieve` for D.C. research and `/v1/agent/execute` for drafting/analysis with selected matter context, then displays MoE route, confidence, guardrail/grounding status, citations, matter snapshot, attorney-review warnings, and LangSmith trace links when present.
   - **Dependencies**: PD001, PD003, PD006, PD015, PD028, PD029.

24. [ ] PD046 [Frontend Architecture] Restructure `mercy-legal-web` around clean App Router product boundaries.
   - **Target Paths**: `mercy-legal-web/src/app/`, `mercy-legal-web/src/components/`, `mercy-legal-web/src/lib/core-client.ts`, `docs/product/web-app-architecture.md`.
   - **Definition of Done**: Marketing remains under `(marketing)`; auth routes are separate; authenticated app routes live under an `(app)` group; admin/beta/monitoring routes are isolated; dashboard code no longer mixes public marketing concerns with matter-workspace concerns.
   - **Progress (2026-07-14)**: Route groups already separate marketing/app/admin. Unified design tokens, shared surface primitives, role-aware workspace chrome, marketing shell polish, platform-admin visual separation, light/dark theme, and mobile navigation landed. Residual work: deeper matter-detail command layout density and screenshot QA pack.
   - **Dependencies**: PD001, PD004, PD028, PD041.

25. [ ] PD047 [Frontend Auth] Add production-ready web auth and tenant/session propagation.
   - **Target Paths**: `mercy-legal-web/src/app/`, `mercy-legal-web/src/middleware.ts`, `mercy-legal-web/src/lib/core-client.ts`, auth components, deployment docs.
   - **Definition of Done**: Protected app routes require a real session outside local dev; tenant ID, user ID, roles, and API auth are passed to the core without relying on localStorage defaults in production; sign-in/sign-up pages are no longer placeholders.
   - **Progress (2026-07-13)**: Removed authorization trust from user-editable Supabase `user_metadata` across middleware, server/browser sessions, Core JWT parsing, billing, and profile role editing. Canonical `app_metadata` is now the only production source for tenant, firm, allowlisted roles, account type, subscription/active state, and Stripe customer identity; missing or malformed claims fail closed. The Core proxy requires an active trusted workspace, post-auth redirects are internal-only, rate limits ignore tenant-header rotation, and targeted Python plus Playwright spoof regressions pass.
   - **Progress (2026-07-14)**: Added shared canonical claim builders and membership-backed backfill decisions in `authorization-claims.ts`; server sessions refresh stale access tokens when verified user claims diverge from JWT claims before Core proxying; operator dry-run/apply backfill script and hosted activation runbook are in-repo. Remaining open work is hosted-only: apply backfill with live service-role credentials, complete Supabase Auth activation in the hosted project, and run live session smoke.
   - **Dependencies**: PD029, PD046.

26. [ ] PD048 [Frontend Matter Workflow] Replace the dashboard-shell feel with a coherent attorney matter workspace.
   - **Target Paths**: `mercy-legal-web/src/app/(app)/matters/`, dashboard components, matter/intake/document/research/drafting components.
   - **Definition of Done**: A beta attorney can create/select a matter, complete intake, upload or attach documents, run D.C. research, draft/analyze, inspect reliability metadata, and review activity in one clear workflow.
   - **Dependencies**: PD006, PD025, PD040, PD046, PD047.

27. [ ] PD049 [Frontend Documents] Make document review and source-anchor UX attorney-ready.
   - **Target Paths**: `mercy-legal-web/src/components/dashboard/document-vault.tsx`, `contract-analyzer.tsx`, source/citation display components, `core-client.ts`.
   - **Definition of Done**: Upload status, document metadata, extracted facts, risks, source placeholders, citations, guardrails, retry states, and data-posture warnings are visible without implying an approved production document vault before retention/storage controls are finalized.
   - **Dependencies**: PD007, PD016, PD021, PD048.

28. [ ] PD050 [Frontend Reliability UX] Standardize route/source/guardrail display across all web workflows.
   - **Target Paths**: `mercy-legal-web/src/components/dashboard/reliability-panel.tsx`, assistant, templates, clauses, document review, activity feed.
   - **Definition of Done**: Research, drafting, templates, clause review, document review, and intake all show consistent route mode, confidence, expert, citations, source status, attorney-review requirement, RAGAS/regression signal where applicable, trace ID, fallback state, and tenant/data posture.
   - **Dependencies**: PD003, PD036, PD048.

29. [ ] PD051 [Office Release] Prepare the shared Word and Outlook production add-in release package.
   - **Target Paths**: `mercy-legal-plugin/manifest.xml`, `mercy-legal-plugin/manifest.outlook.xml`, `mercy-legal-plugin/src/services/office.ts`, `mercy-legal-plugin/src/components/office/`, `mercy-legal-plugin/scripts/`, `mercy-legal-plugin/DEPLOYMENT.md`, `docs/product/office-addin-release-runbook.md`.
   - **Definition of Done**: HTTPS hosting plan, production Word/Outlook manifest generation, sideload instructions, privacy/support URLs, icon/screenshot checklist, shared auth/tenant/matter handoff, AppSource/test-account notes, explicit Word/Outlook change approval, no-send enforcement, and live Word/Outlook host checks are documented and validated.
   - **Progress (2026-07-13)**: Added Outlook summary, triage, reply-preview, citation/ethics, and selected-matter capture workflows; normalized permitted message metadata/context; added shared preview/approval UI; removed background Outlook mutation paths from ribbon shortcuts; and added static no-send and approval smoke gates. Approved Word and Outlook matter capture is now live-only and non-replayable, requires an existing matter, verifies the core-confirmed host-specific history event before success, persists sanitized content with firm/tenant/actor/approval provenance, and passes in-memory, persistent-reload, same-tenant readback, cross-tenant denial, unknown-matter no-create, and unapproved-write denial tests. Word `Update Matter` no longer inserts status text or changes the document. TypeScript, ESLint, production build, Microsoft validation for both manifests, `npm run smoke:office`, and web typecheck pass. Live Word/Outlook sideload, enterprise SSO, hosted tenant persistence, responsive screenshot QA, and production hosting/support URLs remain required, so PD051 stays open.
   - **Dependencies**: PD027, PD041, PD042.

30. [ ] PD052 [Entitlements] Connect Stripe/beta quotas to real tenant capability gates.
   - **Target Paths**: `mercy-legal-web/src/app/api/checkout/route.ts`, backend beta/monitoring/cost modules, web pricing/auth flows.
   - **Definition of Done**: Plan state, beta access, strong-model quota, template generation, premium workflows, and checkout success state map to tenant-visible capability metadata. Fee-reasonableness and engagement-term warnings remain visible for billing/saved-time outputs.
   - **Progress (2026-07-14)**: Canonical subscription→workspace access mapping is centralized; Stripe webhook sync writes `workspace_active`/`account_status` into server-owned `app_metadata`; pure entitlement validator and live config checker ship as `scripts/validate-stripe-entitlements.mjs`. Beta strong-model quotas already surface from Core. Remaining open work is hosted live checkout, cancel/past_due denial, billing portal, and firm multi-seat smoke.
   - **Dependencies**: PD041, PD043, PD047.

31. [ ] PD053 [Source Verification] Move D.C. source grounding from seeded metadata toward attorney-trustworthy verification.
   - **Target Paths**: `dc_knowledge_rag.py`, `scripts/seed_dc_knowledge.py`, `response_envelope.py`, web reliability/source displays, evals.
   - **Definition of Done**: Official body-text extraction, refresh dates, pinpoint anchors, citation currentness status, and attorney verification labels are represented consistently. UI distinguishes candidate source metadata from verified official source text.
   - **Dependencies**: PD016, PD032, PD038, PD044, PD050.

32. [ ] PD054 [Beta Verification] Add end-to-end beta workflow tests.
   - **Target Paths**: `scripts/verify.py`, web test setup, add-in smoke scripts, docs/beta-readiness-checklist.md.
   - **Definition of Done**: Automated or documented checks cover auth, matter creation, intake, document upload, research, drafting, citation/reliability display, Office add-in core connectivity, and beta feedback.
   - **Dependencies**: PD046-PD053.

33. [ ] PD016 [Core Source Anchors] Normalize source-anchor fields across discovery, RAG, and drafting.
   - **Target Paths**: `bridge.py`, `dc_knowledge_rag.py`, `response_envelope.py`, `main.py`.
   - **Definition of Done**: Outputs consistently carry authority, page/Bates/chunk, document, URL, verification status, and provenance.
   - **Dependencies**: PD003, PD015, PD032.

34. [ ] PD020 [Security] Define auth and tenant isolation boundary for production client-data use.
   - **Target Paths**: `mercy-legal-web/`, `main.py`, deployment/config docs.
   - **Definition of Done**: Auth provider, API access control, tenant identity, and client-data boundary are documented before persistent production use.
   - **Dependencies**: PD001, PD006, PD029.

35. [ ] PD022 [Verification] Add brownfield smoke-test checklist/runner.
   - **Target Paths**: `tests/`, `specs/002-legal-ai-integration/quickstart.md` if later created, package scripts where appropriate.
   - **Definition of Done**: Checks cover FastAPI endpoints, web build/typecheck/lint, add-in build/lint/manifest, and critical legal metadata flows.
   - **Dependencies**: PD001-PD034.

## Backlog

### Standalone Platform

- [X] PD009 [Standalone Platform] Connect contract analyzer to live document review.
  - **Result**: Contract analyzer no longer uses fake risk rows; it reflects the latest live agent or discovery response, guardrail status, review flags, and reliability metadata.
- [ ] PD010 [Standalone Platform] Connect Stripe/demo checkout to capability metadata.

### Office / Word and Outlook Add-ins

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
