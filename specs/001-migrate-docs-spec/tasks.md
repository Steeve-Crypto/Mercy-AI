---

description: "Kanban task list for documenting and cleaning up the Mercy project structure"
---

# Tasks: Mercy Source-of-Truth Product Specification

**Input**: Design documents from `/specs/001-migrate-docs-spec/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md  
**Flow Model**: Pure Kanban. Pull one ready task at a time, respect WIP limits, and avoid batching work into phases or sprints.

## Kanban Board Policy

**Columns**

1. **Backlog**: Ordered tasks not ready to start yet.
2. **To Do**: Ready tasks with no unresolved dependency.
3. **Doing**: Work actively in progress.
4. **Review**: Completed work awaiting link, consistency, or owner review.
5. **Blocked**: Work waiting on approval, missing context, failed tooling, or sensitive-data decision.
6. **Done**: Accepted work with required documentation updates committed or ready to commit.

**WIP Limits**

- **Doing**: Maximum 3 tasks total.
- **Review**: Maximum 2 tasks total.
- **Blocked**: No hard cap, but every blocked task must name the blocker in `specs/001-migrate-docs-spec/cleanup-register.md`.
- **Per person/agent**: Pull 1 task at a time unless the next task is read-only and marked `[P]`.

**Pull Rules**

- Pull from the highest priority ready item first.
- Do not pull cleanup or movement tasks until `specs/001-migrate-docs-spec/cleanup-register.md` marks the action safe or approval-required.
- Prefer finishing an item in Review before starting a new item.
- Parallel `[P]` tasks may be pulled by different workers only when they touch different files or different sections of the same inventory file.

**Definition of Ready**

- Task has an exact file path.
- Dependencies listed in this file are complete or not applicable.
- Sensitive-data risk is understood for any task touching uploads, past cases, runtime state, or generated files.

**Definition of Done**

- Target file is updated.
- Links and paths added by the task are valid.
- No contradictory source-of-truth language remains.
- Any skipped command, blocker, or approval need is recorded in `specs/001-migrate-docs-spec/cleanup-register.md`.

## Initial To Do Column Priorities

Pull these first, in order:

1. T001
2. T004
3. T005
4. T006
5. T007
6. T008
7. T009
8. T010
9. T011
10. T014

This initial queue creates the structure audit, cleanup register, source migration matrix, and source-of-truth pointer needed before deeper cleanup.

## Ordered Kanban Backlog

### P0 - Board Setup and Safety Baseline

- [ ] T001 Create a repository inventory table in specs/001-migrate-docs-spec/structure-audit.md covering root files and top-level directories
- [ ] T002 [P] Record the current Spec Kit feature artifact map in specs/001-migrate-docs-spec/structure-audit.md
- [ ] T003 [P] Record active package and runtime entrypoints in specs/001-migrate-docs-spec/structure-audit.md
- [ ] T004 [P] Record generated, cache, dependency, upload, and local-runtime directories in specs/001-migrate-docs-spec/cleanup-register.md
- [ ] T005 Add a cleanup decision log section to specs/001-migrate-docs-spec/cleanup-register.md for keep/move/archive/delete recommendations
- [ ] T006 Define project-structure cleanup principles in specs/001-migrate-docs-spec/cleanup-register.md based on specs/001-migrate-docs-spec/plan.md
- [ ] T007 Document non-destructive cleanup rules for .venv, node_modules, uploads, runtime caches, and user-created docs in specs/001-migrate-docs-spec/cleanup-register.md
- [ ] T008 [P] Create a source-document migration matrix in specs/001-migrate-docs-spec/source-migration.md for README.md, MERCY_BUILD_DOCUMENTATION.md, DEPLOYMENT.md, PRODUCT_BLUEPRINT_ALIGNMENT.md, and the five .docx files
- [ ] T009 [P] Map each source document in specs/001-migrate-docs-spec/source-migration.md to the governing spec, plan, data model, contract, or quickstart section
- [ ] T010 Add an unresolved-cleanup-risk section to specs/001-migrate-docs-spec/cleanup-register.md for items requiring owner approval before deletion or movement

### P1 - Source of Truth and Governance

**Kanban goal**: Make Spec Kit artifacts the planning baseline before any restructure.

**Independent test**: A reviewer can open `specs/001-migrate-docs-spec/spec.md`, `specs/001-migrate-docs-spec/plan.md`, and `specs/001-migrate-docs-spec/source-migration.md` and trace every major old document into a governed artifact.

- [ ] T011 [P] [US1] Add a source-of-truth note to README.md pointing planning work to specs/001-migrate-docs-spec/spec.md and specs/001-migrate-docs-spec/plan.md
- [ ] T012 [P] [US1] Add a source-of-truth note to MERCY_BUILD_DOCUMENTATION.md pointing architecture updates to specs/001-migrate-docs-spec/plan.md
- [ ] T013 [P] [US1] Add a source-of-truth note to PRODUCT_BLUEPRINT_ALIGNMENT.md pointing product-scope updates to specs/001-migrate-docs-spec/spec.md
- [ ] T014 [US1] Complete source traceability rows in specs/001-migrate-docs-spec/source-migration.md for README.md, MERCY_BUILD_DOCUMENTATION.md, DEPLOYMENT.md, and PRODUCT_BLUEPRINT_ALIGNMENT.md
- [ ] T015 [US1] Complete source traceability rows in specs/001-migrate-docs-spec/source-migration.md for Mercy_architecture.md.docx and MERCY_SYSTEM_DESIGN.md.docx
- [ ] T016 [US1] Complete source traceability rows in specs/001-migrate-docs-spec/source-migration.md for Site1.md.docx, Site2.md.docx, and Site3.md.docx
- [ ] T017 [US1] Add superseded-vs-active guidance in specs/001-migrate-docs-spec/source-migration.md for old blueprint documents
- [ ] T018 [US1] Verify source-of-truth pointers in AGENTS.md, README.md, and .specify/feature.json and record results in specs/001-migrate-docs-spec/source-migration.md

### P1 - D.C. Workflow Ownership

**Kanban goal**: Document where D.C.-native legal behavior lives.

**Independent test**: A reviewer can identify which files own D.C. prompts, guardrails, discovery, drafting, and legal workflow UI without reading every source file.

- [ ] T019 [P] [US2] Document D.C. legal workflow owners in specs/001-migrate-docs-spec/structure-audit.md for system_prompts.py, dc_guardrails.py, bridge.py, and legal_discovery_ai/src/legal_discovery_ai/crew.py
- [ ] T020 [P] [US2] Document discovery UI ownership in specs/001-migrate-docs-spec/structure-audit.md for standalone_platform/ and legal_discovery_ai/src/legal_discovery_ai/app.py
- [ ] T021 [P] [US2] Document contract and clause workflow ownership in specs/001-migrate-docs-spec/structure-audit.md for mercy-legal-web/src/components/dashboard/ and mercy-legal-plugin/src/
- [ ] T022 [US2] Add D.C. workflow coverage notes to specs/001-migrate-docs-spec/contracts/core-api.md for discovery, drafting, guardrails, and billing-report responses
- [ ] T023 [US2] Add a modernization gap note to specs/001-migrate-docs-spec/plan.md for official-source verification versus current advisory guardrails
- [ ] T024 [US2] Verify all D.C. workflow documentation references attorney review and verification placeholders in specs/001-migrate-docs-spec/spec.md and record results in specs/001-migrate-docs-spec/structure-audit.md

### P1 - Cross-Surface Architecture

**Kanban goal**: Clarify the current "One Brain, Two Windows" implementation and duplicate surface risks.

**Independent test**: A reviewer can explain how the FastAPI core, standalone dashboard, lightweight Word taskpane, Next app, Vite Word add-in, and CLI relate to each other.

- [ ] T025 [P] [US3] Document the current FastAPI-to-dashboard data flow in specs/001-migrate-docs-spec/structure-audit.md using main.py and standalone_platform/app.js
- [ ] T026 [P] [US3] Document the current FastAPI-to-Word-taskpane data flow in specs/001-migrate-docs-spec/structure-audit.md using main.py and word_plugin/taskpane.js
- [ ] T027 [P] [US3] Document the current CLI-to-core data flow in specs/001-migrate-docs-spec/structure-audit.md using tools/mercy_cli.py
- [ ] T028 [P] [US3] Document the current demo/mock product-surface gap in specs/001-migrate-docs-spec/structure-audit.md for mercy-legal-web/src/ and mercy-legal-plugin/src/services/api.ts
- [ ] T029 [US3] Add a Word add-in consolidation recommendation to specs/001-migrate-docs-spec/cleanup-register.md for word_plugin/ and mercy-legal-plugin/
- [ ] T030 [US3] Add a core-integration recommendation to specs/001-migrate-docs-spec/cleanup-register.md for mercy-legal-web/ and mercy-legal-plugin/
- [ ] T031 [US3] Update specs/001-migrate-docs-spec/contracts/word-addin.md with cleanup status for local scaffold versus production-oriented add-in
- [ ] T032 [US3] Update specs/001-migrate-docs-spec/contracts/ui-workflows.md with cleanup status for local dashboard versus Next dashboard

### P1 - Confidentiality and Cleanup Safety

**Kanban goal**: Make sensitive paths and cleanup safety explicit before any physical cleanup.

**Independent test**: A reviewer can identify which directories may contain client data or local runtime state and which require approval before deletion, archival, or production use.

- [ ] T033 [P] [US4] Inventory local upload paths in specs/001-migrate-docs-spec/cleanup-register.md for legal_discovery_ai/data/uploads/
- [ ] T034 [P] [US4] Inventory local RAG/source paths in specs/001-migrate-docs-spec/cleanup-register.md for legal_discovery_ai/data/past_cases/
- [ ] T035 [P] [US4] Inventory runtime/cache paths in specs/001-migrate-docs-spec/cleanup-register.md for .districtdraft_runtime/, __pycache__/, .next/, dist/, build/, and Microsoft/
- [ ] T036 [P] [US4] Inventory dependency directories in specs/001-migrate-docs-spec/cleanup-register.md for legal_discovery_ai/.venv/ and node_modules/
- [ ] T037 [US4] Add retention-risk labels to specs/001-migrate-docs-spec/cleanup-register.md for uploads, past cases, generated reports, runtime caches, and dependency folders
- [ ] T038 [US4] Add .gitignore review recommendations to specs/001-migrate-docs-spec/cleanup-register.md for runtime, upload, cache, build, and dependency artifacts
- [ ] T039 [US4] Verify specs/001-migrate-docs-spec/quickstart.md warns that upload storage is local processing state, not a production document vault, and record result in specs/001-migrate-docs-spec/cleanup-register.md

### P2 - Commercial Tier Cleanup

**Kanban goal**: Document product-tier ownership without implementing payment enforcement.

**Independent test**: A product reviewer can find where free, premium, checkout, and billing-report concepts live and what still needs cleanup before premium enforcement.

- [ ] T040 [P] [US5] Document current tier metadata ownership in specs/001-migrate-docs-spec/structure-audit.md for mercy_context.py and specs/001-migrate-docs-spec/data-model.md
- [ ] T041 [P] [US5] Document current checkout/demo-mode ownership in specs/001-migrate-docs-spec/structure-audit.md for mercy-legal-web/src/app/api/checkout/route.ts and mercy-legal-web/.env.example
- [ ] T042 [P] [US5] Document current billing-report ownership in specs/001-migrate-docs-spec/structure-audit.md for bridge.py, mercy_context.py, and contracts/core-api.md
- [ ] T043 [US5] Add premium-gating cleanup recommendations to specs/001-migrate-docs-spec/cleanup-register.md for billing reports, administrative records, audit trails, and source verification
- [ ] T044 [US5] Add plan/tier traceability notes to specs/001-migrate-docs-spec/source-migration.md from legacy monetization docs to spec requirements FR-023 through FR-027
- [ ] T045 [US5] Verify specs/001-migrate-docs-spec/contracts/core-api.md identifies entitlement metadata as a future contract requirement and record result in specs/001-migrate-docs-spec/structure-audit.md

### P2 - Production Readiness Cleanup

**Kanban goal**: Make local/demo versus production-ready status explicit.

**Independent test**: A release reviewer can determine whether the repo is local/demo-only or ready for external deployment and Word add-in distribution.

- [ ] T046 [P] [US6] Document production hardening gaps in specs/001-migrate-docs-spec/cleanup-register.md from README.md, DEPLOYMENT.md, and MERCY_BUILD_DOCUMENTATION.md
- [ ] T047 [P] [US6] Document Word add-in distribution checklist ownership in specs/001-migrate-docs-spec/structure-audit.md for mercy-legal-plugin/DEPLOYMENT.md and mercy-legal-plugin/scripts/generate-production-manifest.mjs
- [ ] T048 [P] [US6] Document package validation commands in specs/001-migrate-docs-spec/quickstart.md for mercy-legal-web/package.json, mercy-legal-plugin/package.json, and word_plugin/package.json
- [ ] T049 [US6] Add production-readiness labels to specs/001-migrate-docs-spec/cleanup-register.md for local-only, demo-only, production-candidate, and blocked-until-hardening components
- [ ] T050 [US6] Update DEPLOYMENT.md with a short pointer to specs/001-migrate-docs-spec/quickstart.md for architecture verification
- [ ] T051 [US6] Verify the release-readiness checklist in specs/001-migrate-docs-spec/quickstart.md covers auth, tenant isolation, encrypted persistence, HTTPS Word hosting, payment enforcement, citation verification, and audit controls

### P3 - Continuous Review and Done Criteria

**Kanban goal**: Keep completed work shippable and prevent drift.

- [ ] T052 [P] Check all new markdown links in specs/001-migrate-docs-spec/source-migration.md and record results in specs/001-migrate-docs-spec/cleanup-register.md
- [ ] T053 [P] Check all new markdown links in specs/001-migrate-docs-spec/structure-audit.md and record results in specs/001-migrate-docs-spec/cleanup-register.md
- [ ] T054 [P] Check all new markdown links in specs/001-migrate-docs-spec/cleanup-register.md and record results in specs/001-migrate-docs-spec/cleanup-register.md
- [ ] T055 Run a placeholder scan for NEEDS CLARIFICATION and template markers in specs/001-migrate-docs-spec/ and record results in specs/001-migrate-docs-spec/cleanup-register.md
- [ ] T056 Verify every cleanup recommendation in specs/001-migrate-docs-spec/cleanup-register.md is non-destructive or explicitly marked approval-required
- [ ] T057 Verify README.md, DEPLOYMENT.md, MERCY_BUILD_DOCUMENTATION.md, PRODUCT_BLUEPRINT_ALIGNMENT.md, and AGENTS.md all point to active Spec Kit artifacts and record results in specs/001-migrate-docs-spec/source-migration.md
- [ ] T058 Run quickstart artifact checks from specs/001-migrate-docs-spec/quickstart.md and record results in specs/001-migrate-docs-spec/cleanup-register.md
- [ ] T059 Run package build/typecheck checklist from specs/001-migrate-docs-spec/quickstart.md where dependencies are installed and record skipped commands in specs/001-migrate-docs-spec/cleanup-register.md
- [ ] T060 Review git status and list only intended documentation changes in specs/001-migrate-docs-spec/cleanup-register.md before any commit

## Dependency and Pull Order

**Hard dependencies**

- T001 must be done before T002, T003, T019-T028, T040-T042, and T047.
- T004 and T005 must be done before T006, T007, T010, T029, T030, T033-T039, T043, T046, T049, and T052-T060.
- T008 must be done before T009 and T014-T017.
- T006 and T007 must be done before any cleanup recommendation is marked safe.
- T010 must be done before any task is moved to Blocked for owner approval.
- T011-T018 should be pulled before lower-priority P2 work because they establish source-of-truth governance.
- T033-T039 should be complete before any physical file cleanup is planned.

**Continuous pull recommendation**

1. Pull from P0 until T001, T004, T005, T006, T007, T008, T009, and T010 are done.
2. Pull P1 work in this order: US1, then US4, then US3, then US2.
3. Pull P2 work after P1 has enough documentation to prevent duplicate cleanup decisions.
4. Keep P3 review tasks flowing continuously whenever work enters Review.

## Parallel Work Lanes

**Lane A: Source of Truth**

- T011, T012, and T013 can run in parallel.
- T015 and T016 can run in parallel after T008.

**Lane B: Architecture Inventory**

- T019, T020, and T021 can run in parallel.
- T025, T026, T027, and T028 can run in parallel.
- T040, T041, and T042 can run in parallel.

**Lane C: Cleanup Safety**

- T033, T034, T035, and T036 can run in parallel after T004.
- T037 and T038 should be pulled only after those inventory tasks are reviewed.

**Lane D: Release Readiness**

- T046, T047, and T048 can run in parallel after T005.
- T049 should be pulled after T046 and T047 are reviewed.

**Lane E: Review**

- T052, T053, and T054 can run in parallel when their target files exist.
- T055-T060 should be pulled near the end or whenever a coherent slice is ready for review.

## Kanban Review Findings

- The old phased format made T001-T010 look like a batch gate. In Kanban, they are now the first ready queue with explicit hard dependencies.
- The first To Do column should contain T001, T004, T005, T006, T007, T008, T009, T010, T011, and T014.
- The safest first parallel work is T002/T003/T004 after T001 starts, then T008/T009 alongside cleanup-rule work.
- Do not pull physical cleanup or deletion work yet; this backlog is intentionally documentation-first and approval-driven.
- P1 work can flow continuously once P0 safety rules exist; P2 should wait until source-of-truth and cleanup-safety documentation are stable.

