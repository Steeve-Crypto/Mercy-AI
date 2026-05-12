<!--
Purpose: Repository inventory and architecture-orientation document for Spec Kit
task T001. This file lets future readers understand the top-level Mercy project
structure without relying on a large chat context.

Contents: Root files and top-level directories, their current role, source-of-
truth relationship, and cleanup/audit notes.

Bigger picture: This audit supports the Mercy "One Brain, Two Windows" plan in
specs/001-migrate-docs-spec/plan.md and feeds cleanup decisions tracked in
specs/001-migrate-docs-spec/cleanup-register.md.
-->

# Structure Audit: Mercy Repository

**Feature**: `001-migrate-docs-spec`  
**Task coverage**: T001  
**Primary source of truth**: [plan.md](./plan.md) and [spec.md](./spec.md)  
**Companion docs**: [cleanup-register.md](./cleanup-register.md),
[source-migration.md](./source-migration.md), [kanban-board.md](./kanban-board.md)

## How to Use This Audit

Use this file when deciding where a feature, cleanup task, or documentation update
belongs. The table below is intentionally top-level only for T001. Later inventory
tasks add deeper ownership notes for Spec Kit artifacts, runtime entrypoints, D.C.
legal workflows, product surfaces, and package-specific commands.

## Repository Inventory

| Path | Type | Current Role | Source-of-Truth Relationship | Cleanup / Audit Notes | Follow-up Task |
|------|------|--------------|------------------------------|-----------------------|----------------|
| `.agents/` | Directory | Local Codex/Spec Kit skill support for this workspace. | Operational support; not a product source of truth. | Keep unless agent tooling is intentionally reset. | T060 |
| `.districtdraft_runtime/` | Directory | Local CrewAI/runtime state generated during discovery or drafting runs. | Runtime artifact; product posture governed by [plan.md](./plan.md#technical-context). | Treat as local runtime state. Cleanup safety tracked in [cleanup-register.md](./cleanup-register.md). | T004, T035 |
| `.env.example` | File | Root environment-variable example for local setup. | Setup reference; should align with [quickstart.md](./quickstart.md). | Keep as non-secret template. | T048 |
| `.git/` | Directory | Git repository metadata. | Version-control infrastructure. | Never edit manually as part of cleanup tasks. | T060 |
| `.gitignore` | File | Tracks ignored local secrets, dependencies, caches, uploads, and build output. | Cleanup-safety support file; recommendations tracked in [cleanup-register.md](./cleanup-register.md). | Existing coverage includes Python, Node, uploads, runtime state, logs, and editor state. | T038 |
| `.dockerignore` | File | Docker build-context ignore rules added during implementation setup verification. | Supports Dockerized FastAPI service described in [plan.md](./plan.md#technical-context). | Keep aligned with `.gitignore`; excludes local dependencies, caches, uploads, and environment files. | T060 |
| `.specify/` | Directory | Spec Kit configuration, templates, memory, and feature metadata. | Governs Spec Kit workflow and constitution. | Keep; update only through Spec Kit tasks. | T002 |
| `__pycache__/` | Directory | Generated Python bytecode cache. | Runtime cache, not source. | Ignored by `.gitignore`; no cleanup until safety rules exist. | T004, T035 |
| `AGENTS.md` | File | Agent guidance that points readers to current Spec Kit plan context. | Runtime guidance aligned with [plan.md](./plan.md). | Keep synchronized with current feature guidance. | T018, T057 |
| `bridge.py` | File | Adapter from the FastAPI core to `legal_discovery_ai`, fallback drafting, and billing hooks. | Active Shared Intelligence Core support module. | Active source file; deeper workflow ownership later. | T019, T042 |
| `dc_guardrails.py` | File | D.C. Rule 28/32 and Ethics Opinion 388 guardrail middleware. | Active legal-safety component governed by [constitution.md](../../.specify/memory/constitution.md). | Active source file; preserve attorney-review semantics. | T019, T024 |
| `DEPLOYMENT.md` | File | Legacy deployment guidance for local and production-oriented setup. | Migrated documentation source; current governing details move to [quickstart.md](./quickstart.md) and [plan.md](./plan.md). | Keep until source migration and source-of-truth pointers are complete. | T014, T050 |
| `Dockerfile` | File | Container build definition for the root FastAPI service. | Supports target platform described in [plan.md](./plan.md#technical-context). | Keep; `.dockerignore` now excludes local artifacts from build context. | T046 |
| `legal_discovery_ai/` | Directory | CrewAI discovery package, Streamlit app, requirements, uploads, and past-case data paths. | Active discovery engine integrated through `bridge.py`. | Contains sensitive/local data paths; cleanup requires explicit safety rules. | T019, T020, T033-T036 |
| `main.py` | File | FastAPI Shared Intelligence Core with `/v1/*` routes, static dashboard hosting, discovery, drafting, and billing endpoints. | Canonical active backend per [plan.md](./plan.md#current-architecture). | Active source file; avoid adding competing cores. | T025, T026, T027 |
| `Mercy_architecture.md.docx` | File | Legacy architecture source document. | Migrated source; initial tracking begins in [source-migration.md](./source-migration.md). | Keep until migration status and supersession guidance are complete. | T015 |
| `MERCY_BUILD_DOCUMENTATION.md` | File | Legacy build and architecture documentation. | Migrated source; current architecture authority is [plan.md](./plan.md). | Add source-of-truth pointer before relying on it for planning. | T012, T014 |
| `mercy_context.py` | File | In-memory matter state, product tier metadata, and billing report scaffolding. | Active Shared Intelligence Core state module. | Active source file; persistence changes require privacy gates. | T040, T042 |
| `Mercy_Folder/` | Directory | Existing project folder requiring later owner/context review. | Not yet classified as active product source. | Do not move or delete without owner approval and cleanup principles. | T010, T056 |
| `MERCY_SYSTEM_DESIGN.md.docx` | File | Legacy system design source document. | Migrated source; initial tracking begins in [source-migration.md](./source-migration.md). | Keep until migration status and supersession guidance are complete. | T015 |
| `mercy-legal-plugin/` | Directory | React/Vite production-oriented Microsoft Word add-in package. | Product surface described in [plan.md](./plan.md#current-architecture). | Contains `node_modules/` and `dist/`; production distribution requires readiness checks. | T021, T026, T031, T047 |
| `mercy-legal-web/` | Directory | Next.js product, pricing, checkout, and dashboard package. | Product/dashboard surface described in [plan.md](./plan.md#current-architecture). | Contains `.next/` and `node_modules/`; core integration remains a modernization item. | T021, T028, T030, T041 |
| `Microsoft/` | Directory | Local Microsoft/Office-related runtime or generated state in this checkout. | Not a product source of truth. | Needs cleanup-risk classification before any action. | T004, T035, T038 |
| `package-lock.json` | File | Root npm lockfile with no root `package.json` present in the top-level listing. | Not currently identified as an active package owner. | Review before removal; package owners live in subdirectories. | T010, T060 |
| `PRODUCT_BLUEPRINT_ALIGNMENT.md` | File | Legacy product-scope alignment note. | Migrated source; current product authority is [spec.md](./spec.md). | Add source-of-truth pointer before relying on it for planning. | T013, T014 |
| `README.md` | File | Public root overview and local setup entrypoint. | Should point to active Spec Kit source-of-truth artifacts. | Add explicit planning pointer in T011. | T011, T057 |
| `requirements.txt` | File | Root Python dependency list for FastAPI/local core execution. | Setup support for [quickstart.md](./quickstart.md). | Keep aligned with documented Python setup. | T048 |
| `Site1.md.docx` | File | Legacy site/product document source. | Migrated source; initial tracking begins in [source-migration.md](./source-migration.md). | Keep until migration status and supersession guidance are complete. | T016 |
| `Site2.md.docx` | File | Legacy site/product document source. | Migrated source; initial tracking begins in [source-migration.md](./source-migration.md). | Keep until migration status and supersession guidance are complete. | T016 |
| `Site3.md.docx` | File | Legacy site/product document source. | Migrated source; initial tracking begins in [source-migration.md](./source-migration.md). | Keep until migration status and supersession guidance are complete. | T016 |
| `specs/` | Directory | Spec Kit feature artifacts, plans, tasks, checklists, and contracts. | Active planning source of truth for this feature. | Keep; this task writes documentation under `specs/001-migrate-docs-spec/`. | T002 |
| `standalone_platform/` | Directory | Static browser dashboard served by the FastAPI core. | Heavy-work workspace in "One Brain, Two Windows" architecture. | Active product surface; deeper ownership later. | T020, T025, T032 |
| `system_prompts.py` | File | D.C. Clerk OS prompts and legal guardrail schema. | Active legal-output behavior governed by the constitution. | Active source file; preserve no-fabrication and attorney-review rules. | T019, T024 |
| `tools/` | Directory | Local CLI utilities, including `tools/mercy_cli.py`. | CLI contract documented in [contracts/cli.md](./contracts/cli.md). | Active operational tooling. | T027 |
| `word_plugin/` | Directory | Lightweight local Word taskpane scaffold served by FastAPI. | Drafting sidekick scaffold in current architecture. | Contains `node_modules/` and `dist/`; consolidation decision comes later. | T026, T029, T031 |

## T001 Completion Summary

T001 created this repository inventory table covering root files and top-level
directories. It documents each item's current role, source-of-truth relationship,
cleanup/audit notes, and follow-up task IDs so future work can proceed without
large external context.
