<!--
Purpose: Brownfield Kanban board for Mercy Legal AI. This board reflects the
actual existing implementation and the current integration status after PD001
and PD002 connected the primary UI surfaces to the live FastAPI core.

Product vision: specs/001-migrate-docs-spec/spec.md
Brownfield plan: specs/001-migrate-docs-spec/plan.md
Task source: specs/001-migrate-docs-spec/tasks.md
-->

# Kanban Board Summary: Mercy Brownfield Integration

**Columns**: **Backlog | To Do | In Progress | Review | Done**
**Operating Decision**: Mercy is a brownfield project. The immediate work is to
connect and harden existing product surfaces, especially `mercy-legal-web/` and
`mercy-legal-plugin/`, around the live Shared Intelligence Core.

## WIP Limits

| Backlog | To Do | In Progress | Review | Done |
|---------|-------|-------------|--------|------|
| No cap; ordered by integration value and safety. | 6 ready tasks maximum. | 4 active tasks maximum; prefer 2-3. | 3 tasks maximum. | No cap; DoD must be met. |

## Current Board

| Backlog | To Do | In Progress | Review | Done |
|---------|-------|-------------|--------|------|
| 9. PD009 [Standalone Platform] Connect contract analyzer to live document review. | 1. PD003 [Core Contract] Add brownfield route and response metadata envelope. | Empty | Empty | PD001 Typed FastAPI core client added to `mercy-legal-web`. |
| 10. PD010 [Standalone Platform] Connect Stripe/demo checkout to capability metadata. | 2. PD004 [Standalone Platform] Replace mock matter/dashboard data with live core data. | Empty | Empty | PD002 Mocked add-in AI service replaced with configurable core calls. |
| 11. PD011 [Office Add-in] Route selected text through clause explanation. | 3. PD005 [Office Add-in] Display guardrail, route, and verification status in Word add-in. | Empty | Empty | T001 Repository inventory table. |
| 12. PD012 [Office Add-in] Route report generation through core-backed analysis. | 4. PD006 [Core Matter/Intake] Extend matter context for structured intake. | Empty | Empty | T004 Cleanup artifact inventory. |
| 13. PD013 [Office Add-in] Finalize production manifest readiness checklist. | 5. PD007 [Standalone Platform] Wire document vault uploads to discovery upload endpoint. | Empty | Empty | T005 Cleanup decision log. |
| 14. PD014 [Core MoE] Add route inspection endpoint. | 6. PD008 [Standalone Platform] Connect AI assistant panel to core routing/drafting/research. | Empty | Empty | T006 Cleanup principles. |
| 15. PD015 [Core Research] Add D.C. legal research response endpoint or skill. |  | Empty | Empty | T008 Source migration matrix. |
| 16. PD016 [Core Source Anchors] Normalize source-anchor fields. |  | Empty | Empty | T009 Source governing-section map. |
| 17. PD017 [Core Guardrails] Promote guardrails into reusable compliance envelope. |  | Empty | Empty | BR001 FastAPI core exists in `main.py`. |
| 18. PD018 [Legal Discovery AI] Normalize CrewAI output in `bridge.py`. |  | Empty | Empty | BR002 Discovery/drafting bridge exists in `bridge.py`. |
| 19. PD019 [Legal Discovery AI] Connect discovery exports to product surfaces. |  | Empty | Empty | BR003 In-memory matter/billing context exists in `mercy_context.py`. |
| 20. PD020 [Security] Define auth and tenant isolation boundary for `mercy-legal-web`. |  | Empty | Empty | BR004 D.C. guardrail middleware exists in `dc_guardrails.py`. |
| 21. PD021 [Persistence] Design encrypted production matter storage. |  | Empty | Empty | BR005 Clerk OS prompt/schema exists in `system_prompts.py`. |
| 22. PD022 [Verification] Add brownfield smoke-test checklist. |  | Empty | Empty | BR006 Local static dashboard exists in `standalone_platform/`. |
| PARKED T002/T003/T007/T010-T060 old documentation cleanup tasks. |  | Empty | Empty | BR007 Next.js Standalone Platform exists in `mercy-legal-web/`. |
|  |  | Empty | Empty | BR008 Lightweight local Word taskpane exists in `word_plugin/`. |
|  |  | Empty | Empty | BR009 Production-oriented Vite/React Office Add-in exists in `mercy-legal-plugin/`. |
|  |  | Empty | Empty | BR010 CrewAI/Streamlit Legal Discovery AI exists in `legal_discovery_ai/`. |
|  |  | Empty | Empty | BR011 Local CLI exists in `tools/mercy_cli.py`. |
|  |  | Empty | Empty | PD025 Full client intake flow and prompt library live in core, dashboard, and Word add-in. |
|  |  | Empty | Empty | PD026 LangGraph-compatible agent network and MCP skill layer live in the core. |
|  |  | Empty | Empty | PD027 Word add-in taskpane and ribbon actions powered by the live agent network. |

## Swimlanes

| Swimlane | Current Reality | Priority |
|----------|-----------------|----------|
| Standalone Platform | `mercy-legal-web/` now has a typed FastAPI core client and dashboard status/matter fallback wiring; deeper dashboard modules still need live data. | Highest |
| Office Add-in | `mercy-legal-plugin/` now calls the FastAPI core for analysis/explanation/revision with preview fallback; UI still needs richer metadata display. | Highest |
| Shared Intelligence Core | FastAPI, matter store, discovery/drafting bridge, billing hooks, and D.C. guardrails exist; route envelope remains next. | Highest |
| Legal Discovery AI | CrewAI engine and Streamlit UI exist; output needs normalization for product surfaces. | High |
| Compliance & Source Status | Guardrails exist in middleware; cross-surface display and official verification are incomplete. | High |
| Production Readiness | Auth, tenant isolation, encrypted persistence, HTTPS deployment, and audit controls remain gates. | Medium |
| Parked Documentation | Old migration/cleanup tasks. | Low unless unblocking |

## Recommended Next Pull

Pull **PD004** next to continue replacing remaining dashboard mock data with
live core data. PD001-PD003, PD005-PD006, PD014-PD015, and PD023-PD027 are now
implemented in the active brownfield Kanban.
