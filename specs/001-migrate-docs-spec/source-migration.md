<!--
Purpose: Central Source of Truth mapping document for Spec Kit tasks T008 and
T009, plus every future documentation migration task in feature
001-migrate-docs-spec.

Contents: Governing artifact map, source-document migration matrix, governing
section map, pivot status, and task implementation ledger. This file should be
updated whenever a task changes how old documentation maps to the active Spec Kit
artifacts.

Bigger picture: Mercy now treats specs/001-migrate-docs-spec/spec.md,
specs/001-migrate-docs-spec/plan.md, and .specify/memory/constitution.md as the
planning authority. This mapping prevents legacy docs from silently becoming a
competing source of truth.
-->

# Source Migration: Mercy Documentation Corpus

**Feature**: `001-migrate-docs-spec`  
**Task coverage**: T001, T004, T005, T006, T008, T009  
**Current source-of-truth rule**: The active product baseline lives in
[spec.md](./spec.md), the active architecture baseline lives in [plan.md](./plan.md),
and governance lives in [../../.specify/memory/constitution.md](../../.specify/memory/constitution.md).

## Governing Artifact Map

| Artifact | Governs | Use When | Related Task IDs |
|----------|---------|----------|------------------|
| [../../.specify/memory/constitution.md](../../.specify/memory/constitution.md) | Mandatory Mercy principles, legal-safety gates, architecture rules, and governance. | A feature affects legal output, data handling, architecture, quality gates, or source-grounding obligations. | Constitution baseline |
| [spec.md](./spec.md) | Product vision, D.C. small-firm goals, user stories, functional requirements, entities, Legal AI safety, product architecture, and success criteria. | A planner needs to decide what Mercy must or should do next. | T008, T009, pivot clarification |
| [plan.md](./plan.md) | Current architecture, components, data flow, constraints, and modernization opportunities. | A planner needs to decide where an implementation belongs. | T001, T008, T014-T017 |
| [data-model.md](./data-model.md) | Entities, relationships, validation rules, and state transitions. | A feature changes matters, documents, source anchors, drafts, guardrails, billing, tiers, or audit trails. | T009 |
| [contracts/](./contracts/) | Core API, CLI, UI workflow, and Word add-in behavior contracts. | A feature changes request/response behavior or surface integration. | T009, T022, T031, T032 |
| [quickstart.md](./quickstart.md) | Manual architecture verification and package validation commands. | A reviewer needs to validate local/demo architecture behavior. | T048, T051, T058, T059 |
| [tasks.md](./tasks.md) | Kanban task backlog and dependency rules. | A contributor chooses or completes implementation work. | T001-T060 |
| [kanban-board.md](./kanban-board.md) | Current five-column working board and WIP status. | A contributor needs the current pull order and visible board status. | T001, T004, T008 |
| [structure-audit.md](./structure-audit.md) | Repository inventory and top-level ownership notes. | A contributor needs to locate files, surfaces, and cleanup responsibilities. | T001 |
| [cleanup-register.md](./cleanup-register.md) | Cleanup safety inventory, local artifact notes, cleanup decision fields, and project-structure cleanup principles. | A contributor considers moving, archiving, deleting, ignoring, or retaining files. | T004, T005, T006 |

## Pivot Status

The documentation migration has served its purpose. The useful artifacts created
so far remain available, but the remaining documentation-heavy backlog is parked.
New work should prioritize Mercy product delivery for D.C. small firms:

- MoE legal task routing.
- Matter-centered client intake.
- D.C.-focused legal research with source anchors or verification placeholders.
- Attorney-ready drafting.
- Compliance signals for confidentiality, verification, fee reasonableness, and
  attorney supervision.

## Source Document Migration Matrix

T008 created the initial matrix rows. T009 maps each row to governing artifacts
and sections. Detailed source-by-source quotation-level traceability remains
reserved for T014-T016.

| Source Path | Source Type | Current Role | Governing Artifact(s) | Migration Status | Follow-up Task | Notes |
|-------------|-------------|--------------|-----------------------|------------------|----------------|-------|
| `README.md` | Markdown | Root overview and local setup entrypoint. | [spec.md](./spec.md), [plan.md](./plan.md), [quickstart.md](./quickstart.md) | Mapped to governing artifacts; detailed traceability pending. | T011, T014, T057 | Needs explicit source-of-truth pointer for future planning. |
| `MERCY_BUILD_DOCUMENTATION.md` | Markdown | Legacy build, architecture, and implementation notes. | [plan.md](./plan.md), [quickstart.md](./quickstart.md), [cleanup-register.md](./cleanup-register.md) | Mapped to governing artifacts; detailed traceability pending. | T012, T014, T057 | Architecture updates should point to `plan.md`; cleanup posture should point to `cleanup-register.md`. |
| `DEPLOYMENT.md` | Markdown | Legacy deployment and production-readiness notes. | [plan.md](./plan.md), [quickstart.md](./quickstart.md), [cleanup-register.md](./cleanup-register.md) | Mapped to governing artifacts; detailed traceability pending. | T014, T050, T057 | Deployment posture remains local/demo until hardening gates are satisfied. |
| `PRODUCT_BLUEPRINT_ALIGNMENT.md` | Markdown | Legacy product alignment and scope notes. | [spec.md](./spec.md), [data-model.md](./data-model.md) | Mapped to governing artifacts; detailed traceability pending. | T013, T014, T057 | Product-scope updates should point to `spec.md`; entity/tier changes should point to `data-model.md`. |
| `Mercy_architecture.md.docx` | Word document | Legacy architecture source. | [plan.md](./plan.md), [contracts/](./contracts/), [structure-audit.md](./structure-audit.md) | Mapped to governing artifacts; detailed traceability pending. | T015 | Keep until superseded-vs-active guidance is complete. |
| `MERCY_SYSTEM_DESIGN.md.docx` | Word document | Legacy system design source. | [plan.md](./plan.md), [data-model.md](./data-model.md), [contracts/](./contracts/) | Mapped to governing artifacts; detailed traceability pending. | T015 | Keep until detailed mapping confirms migrated content. |
| `Site1.md.docx` | Word document | Legacy site/product source. | [spec.md](./spec.md), [contracts/ui-workflows.md](./contracts/ui-workflows.md), [quickstart.md](./quickstart.md) | Mapped to governing artifacts; detailed traceability pending. | T016 | Keep until site/source guidance is classified. |
| `Site2.md.docx` | Word document | Legacy site/product source. | [spec.md](./spec.md), [contracts/ui-workflows.md](./contracts/ui-workflows.md), [quickstart.md](./quickstart.md) | Mapped to governing artifacts; detailed traceability pending. | T016 | Keep until site/source guidance is classified. |
| `Site3.md.docx` | Word document | Legacy site/product source. | [spec.md](./spec.md), [contracts/ui-workflows.md](./contracts/ui-workflows.md), [quickstart.md](./quickstart.md) | Mapped to governing artifacts; detailed traceability pending. | T016 | Keep until site/source guidance is classified. |

## Governing Section Map

T009 adds this section-level map so contributors know which active artifact owns
each source's requirements before T014-T016 perform detailed traceability.

| Source Path | Product / Scope Owner | Architecture Owner | Data Model Owner | Contract Owner | Verification Owner |
|-------------|-----------------------|--------------------|------------------|----------------|--------------------|
| `README.md` | [spec.md](./spec.md) -> User Stories 1, 2, 3, 4; Requirements FR-001 through FR-006, FR-038 through FR-040 | [plan.md](./plan.md) -> Summary, Technical Context, Current Architecture | [data-model.md](./data-model.md) -> Attorney User, Matter, Document | [contracts/core-api.md](./contracts/core-api.md), [contracts/ui-workflows.md](./contracts/ui-workflows.md), [contracts/word-addin.md](./contracts/word-addin.md) | [quickstart.md](./quickstart.md) -> sections 1-5 |
| `MERCY_BUILD_DOCUMENTATION.md` | [spec.md](./spec.md) -> User Story 3, User Story 6, FR-003 through FR-006, FR-028, FR-029, FR-038 | [plan.md](./plan.md) -> Project Structure, Component Responsibilities, Data Flow, Modernization Opportunities | [data-model.md](./data-model.md) -> Matter, Draft Output, Guardrail Result, Billing Event | [contracts/core-api.md](./contracts/core-api.md), [contracts/cli.md](./contracts/cli.md) | [quickstart.md](./quickstart.md) -> sections 2-8 |
| `DEPLOYMENT.md` | [spec.md](./spec.md) -> User Story 4, User Story 6, FR-021, FR-022, FR-028, FR-029 | [plan.md](./plan.md) -> Technical Context, Constitution Check, Modernization Opportunities | [data-model.md](./data-model.md) -> Attorney User, Audit Trail, Product Plan / Tier | [contracts/core-api.md](./contracts/core-api.md), [contracts/word-addin.md](./contracts/word-addin.md) | [quickstart.md](./quickstart.md) -> sections 6-8 |
| `PRODUCT_BLUEPRINT_ALIGNMENT.md` | [spec.md](./spec.md) -> User Stories 1-6, FR-001 through FR-040, Success Criteria SC-001 through SC-008 | [plan.md](./plan.md) -> Summary and Modernization Opportunities | [data-model.md](./data-model.md) -> Product Plan / Tier, Billing Event, Billing Report, Audit Trail | [contracts/ui-workflows.md](./contracts/ui-workflows.md), [contracts/core-api.md](./contracts/core-api.md) | [quickstart.md](./quickstart.md) -> section 8 |
| `Mercy_architecture.md.docx` | [spec.md](./spec.md) -> User Story 3, FR-003 through FR-006 | [plan.md](./plan.md) -> Project Structure, Current Architecture, Data Flow | [data-model.md](./data-model.md) -> Matter, Document, Extracted Facts, Draft Output | [contracts/core-api.md](./contracts/core-api.md), [contracts/cli.md](./contracts/cli.md), [contracts/word-addin.md](./contracts/word-addin.md) | [quickstart.md](./quickstart.md) -> sections 1-5 |
| `MERCY_SYSTEM_DESIGN.md.docx` | [spec.md](./spec.md) -> User Stories 2, 3, 4; FR-007 through FR-023, FR-030 through FR-037 | [plan.md](./plan.md) -> Component Responsibilities, Data Flow, Modernization Opportunities | [data-model.md](./data-model.md) -> all entities, especially Source Anchor, Guardrail Result, Audit Trail | [contracts/](./contracts/) -> all current contracts | [quickstart.md](./quickstart.md) -> sections 2-8 |
| `Site1.md.docx` | [spec.md](./spec.md) -> User Story 1, User Story 5, User Story 6; FR-024 through FR-029 | [plan.md](./plan.md) -> Mercy Legal Web and production-readiness notes | [data-model.md](./data-model.md) -> Product Plan / Tier, Attorney User | [contracts/ui-workflows.md](./contracts/ui-workflows.md) | [quickstart.md](./quickstart.md) -> sections 6 and 8 |
| `Site2.md.docx` | [spec.md](./spec.md) -> User Story 2, User Story 3; FR-008 through FR-018, FR-030 through FR-035 | [plan.md](./plan.md) -> Standalone Platform, Legal Discovery Package, Shared Intelligence Core | [data-model.md](./data-model.md) -> Document, Extracted Facts, Draft Output, Source Anchor | [contracts/core-api.md](./contracts/core-api.md), [contracts/ui-workflows.md](./contracts/ui-workflows.md) | [quickstart.md](./quickstart.md) -> sections 2-5 |
| `Site3.md.docx` | [spec.md](./spec.md) -> User Story 3, User Story 5; FR-005, FR-023 through FR-027, FR-030 through FR-036 | [plan.md](./plan.md) -> Word Plugin, Mercy Legal Plugin, Modernization Opportunities | [data-model.md](./data-model.md) -> Draft Output, Billing Event, Billing Report, Product Plan / Tier | [contracts/word-addin.md](./contracts/word-addin.md), [contracts/ui-workflows.md](./contracts/ui-workflows.md) | [quickstart.md](./quickstart.md) -> sections 5-8 |

## Task Implementation Ledger

| Task ID | Status | Updated Artifact(s) | Summary |
|---------|--------|---------------------|---------|
| T001 | Done | [structure-audit.md](./structure-audit.md), this file | Created the root repository inventory and registered the audit as a governing support artifact. |
| T004 | Done | [cleanup-register.md](./cleanup-register.md), this file | Recorded generated/cache/dependency/upload/runtime paths and registered cleanup safety as a source-of-truth support artifact. |
| T008 | Done | This file | Created the initial source-document migration matrix for README.md, MERCY_BUILD_DOCUMENTATION.md, DEPLOYMENT.md, PRODUCT_BLUEPRINT_ALIGNMENT.md, and five `.docx` sources. |
| T005 | Done | [cleanup-register.md](./cleanup-register.md), this file | Added the cleanup decision log fields used to record keep, move, archive, delete, approval-required, and rationale decisions. |
| T006 | Done | [cleanup-register.md](./cleanup-register.md), this file | Added cleanup principles derived from `plan.md`, including source-of-truth-first, non-destructive, privacy-first, and Shared Intelligence Core preservation rules. |
| T009 | Done | This file | Mapped every listed source document to governing spec, plan, data model, contract, and quickstart sections. |
| Pivot | Done | [spec.md](./spec.md), [tasks.md](./tasks.md), [kanban-board.md](./kanban-board.md), this file | Reframed the active source of truth around Mercy product development and parked remaining documentation-heavy tasks. |
| Product spec consolidation | Done | [spec.md](./spec.md), [checklists/requirements.md](./checklists/requirements.md), this file | Merged existing Mercy product vision, D.C. legal workflow, compliance, guardrail, architecture, web, Word add-in, discovery, and monetization materials into the active product specification. |

## T008 Completion Summary

T008 created this central source migration document and added an initial matrix
row for every source document named in the task. Detailed source-to-section
mapping remains intentionally pending for T009 and T014-T016.

## T009 Completion Summary

T009 added the Governing Section Map and updated each source row to show that it
has been mapped to active governing artifacts. T014-T016 still own deeper
source-by-source traceability and supersession detail.
