<!--
Purpose: Cleanup-safety register for Spec Kit tasks T004, T005, and T006. This
file records local generated artifacts, caches, dependency folders, upload
locations, runtime state, cleanup decision fields, and project-structure cleanup
principles before any cleanup or restructuring is attempted.

Contents: Non-destructive inventory tables, git/Docker ignore observations,
cleanup decision log structure, cleanup principles, and task-level summaries. No
deletion, movement, or archival action is authorized by this file until later
cleanup decision tasks mark an item safe or approval-required.

Bigger picture: The register protects Mercy's confidentiality and zero-retention
posture from specs/001-migrate-docs-spec/spec.md and .specify/memory/constitution.md.
It should be updated by every future cleanup, review, or validation task.
-->

# Cleanup Register: Mercy Project Structure

**Feature**: `001-migrate-docs-spec`  
**Task coverage**: T004, T005, T006  
**Safety posture**: Documentation-only. No file movement or deletion approved.  
**Related docs**: [structure-audit.md](./structure-audit.md),
[source-migration.md](./source-migration.md), [kanban-board.md](./kanban-board.md)

## Cleanup Safety Rule for T004

T004 only recorded generated, cache, dependency, upload, and local-runtime paths.
T005 adds the decision log structure. T006 adds cleanup principles based on
[plan.md](./plan.md). Cleanup decisions remain documentation-only until later
tasks apply these rules to specific paths.

- T007 documents non-destructive cleanup rules.
- T010 records unresolved cleanup risks that require owner approval.
- T033-T039 deepen sensitive data, cache, dependency, and `.gitignore` review.

## Project-Structure Cleanup Principles

These principles are derived from [plan.md](./plan.md), the Mercy constitution,
and the current local/demo architecture. Use them before making any keep, move,
archive, or delete recommendation.

| Principle | Rule | Applies To | Rationale | Related Tasks |
|-----------|------|------------|-----------|---------------|
| Source of truth first | Do not remove or demote a legacy document until [source-migration.md](./source-migration.md) identifies the active governing artifact and any needed pointer updates. | README.md, legacy Markdown docs, `.docx` files, `AGENTS.md` | Prevents old docs from silently competing with the Spec Kit baseline. | T009, T011-T018 |
| Non-destructive by default | Inventory and classify before moving, archiving, or deleting. Use approval-required status when contents may include client, matter, account, certificate, or owner-created material. | Uploads, past cases, Microsoft runtime state, legacy docs, generated reports | Protects confidentiality, attorney-supervision evidence, and owner context. | T007, T010, T033-T039 |
| Preserve the Shared Intelligence Core | Keep `main.py`, `bridge.py`, `dc_guardrails.py`, `mercy_context.py`, and `system_prompts.py` as active core files unless a future plan replaces them with an explicit migration path. | Root Python service files | The plan treats the FastAPI core as the current authoritative backend. | T019, T025-T027 |
| Keep working product surfaces until ownership is decided | Do not delete `standalone_platform/`, `word_plugin/`, `mercy-legal-web/`, or `mercy-legal-plugin/` solely because there are overlapping surfaces. | Browser dashboard, local Word scaffold, Next dashboard, Vite add-in | The plan documents separate maturity levels and future consolidation work. | T020, T021, T028-T032 |
| Separate rebuildable artifacts from sensitive local state | Dependency folders and build outputs may be rebuildable, but uploads, past cases, analysis history, runtime state, and Microsoft state need risk review first. | `.venv/`, `node_modules/`, `.next/`, `dist/`, uploads, past cases, runtime folders | Rebuildability does not equal safe deletion when legal data may be present. | T033-T039 |
| No production-data assumptions | Treat local uploads and in-memory matter state as local/demo processing, not approved production storage. | `legal_discovery_ai/data/uploads/`, `mercy_context.py`, future storage work | Production persistence requires auth, tenant isolation, encryption, retention, deletion, and audit boundaries. | T037, T046-T051 |
| Validate ignore coverage before cleanup | Ensure `.gitignore`, `.dockerignore`, and package-level ignore/config files exclude generated and sensitive local artifacts before recommending cleanup. | Git, Docker, Node, Python, Office tooling | Prevents accidental publication or build-context inclusion of local artifacts. | T038, T060 |

## Cleanup Decision Log

T005 establishes this decision log structure. Later tasks should add or update
rows rather than creating separate cleanup notes elsewhere.

| Decision ID | Path / Scope | Keep | Move | Archive | Delete | Approval Required | Rationale | Status | Source Task |
|-------------|--------------|------|------|---------|--------|-------------------|-----------|--------|-------------|
| CD-001 | Active Spec Kit artifacts under `specs/001-migrate-docs-spec/` | Yes | No | No | No | No | These files are the current planning source of truth for this feature. | Decided: keep | T005 |
| CD-002 | Active core source files: `main.py`, `bridge.py`, `dc_guardrails.py`, `mercy_context.py`, `system_prompts.py` | Yes | No | No | No | No | The implementation plan identifies these as the current Shared Intelligence Core and legal-safety support modules. | Decided: keep | T005, T006 |
| CD-003 | Local uploads, past cases, analysis history, runtime state, and Microsoft-local state | No | No | No | No | Yes | These paths may contain client, matter, tool-runtime, or account-adjacent data and need deeper risk review before action. | Pending risk review | T004, T006 |
| CD-004 | Rebuildable dependencies and generated build output: `.venv/`, `node_modules/`, `.next/`, `dist/`, `build/`, `__pycache__/` | No | No | No | No | Conditional | These are usually rebuildable but should not be removed while documentation tasks are running or before package-specific rebuild costs are understood. | Pending cleanup rules | T004, T006 |
| CD-005 | Legacy documentation sources listed in [source-migration.md](./source-migration.md) | Yes | No | No | No | Yes | Keep until source-of-truth pointers, detailed traceability, and superseded-vs-active guidance are complete. | Pending migration detail | T005, T009 |

## Generated, Cache, Dependency, Upload, and Runtime Inventory

| Path | Artifact Type | Present in Checkout | Why It Exists | Data / Sensitivity Risk | Ignore Coverage | Cleanup Status | Follow-up Task |
|------|---------------|--------------------|---------------|-------------------------|-----------------|----------------|----------------|
| `.districtdraft_runtime/` | Local runtime state | Yes | CrewAI/local drafting runtime state. | Possible transient prompts, tool traces, or local run state. | Covered by `.gitignore` and `.dockerignore`. | Do not delete until cleanup principles and owner approval rules exist. | T035, T056 |
| `__pycache__/` | Python cache | Yes | Generated bytecode from local Python execution. | Low, but still generated local state. | Covered by `.gitignore` and `.dockerignore`. | Safe-candidate only after T006/T007. | T035 |
| `legal_discovery_ai/.venv/` | Python dependency environment | Yes | Local virtual environment for discovery/core execution. | Low client-data risk; high rebuild cost if removed unexpectedly. | Covered by `.gitignore` and `.dockerignore` through `.venv/`. | Do not delete without owner confirmation. | T036 |
| `legal_discovery_ai/data/uploads/` | Local upload processing storage | Yes | PDF upload target for discovery processing. | High. May contain client or matter documents. | Covered by `.gitignore` and `.dockerignore`. | Approval-required; not a production vault. | T033, T037 |
| `legal_discovery_ai/data/past_cases/` | Local RAG/source corpus | Yes | Past-case/reference path used by discovery/RAG tooling. | Medium to high depending on contents. | Not specifically covered by current ignore rules. | Inventory before cleanup; do not remove or publish blindly. | T034, T037, T038 |
| `legal_discovery_ai/data/analysis_history.json` | Generated analysis history | Yes | Local discovery history generated by tooling. | Medium. May contain derived client/matter analysis. | Covered by `.gitignore` and `.dockerignore`. | Approval-required before deletion or retention. | T037 |
| `mercy-legal-web/node_modules/` | Node dependency directory | Yes | Installed dependencies for Next.js product/dashboard package. | Low client-data risk; large generated dependency tree. | Covered by `.gitignore` and `.dockerignore`. | Rebuildable, but do not remove during documentation tasks. | T036 |
| `mercy-legal-web/.next/` | Next.js build/cache output | Yes | Generated build output and cache. | Low to medium; may include build-time environment effects. | Covered by `.gitignore` and `.dockerignore`. | Safe-candidate only after T006/T007. | T035 |
| `mercy-legal-web/tsconfig.tsbuildinfo` | TypeScript build cache | Yes | Incremental TypeScript build metadata. | Low. | Covered by `.gitignore` and `.dockerignore`. | Safe-candidate only after T006/T007. | T035 |
| `mercy-legal-plugin/node_modules/` | Node dependency directory | Yes | Installed dependencies for React/Vite Word add-in package. | Low client-data risk; large generated dependency tree. | Covered by `.gitignore` and `.dockerignore`. | Rebuildable, but do not remove during documentation tasks. | T036 |
| `mercy-legal-plugin/dist/` | Vite build output | Yes | Generated add-in bundle output. | Low to medium; production artifacts may need review. | Covered by `.gitignore` and `.dockerignore`. | Review before deletion if used for local Office testing. | T035, T047 |
| `word_plugin/node_modules/` | Node dependency directory | Yes | Installed dependencies for lightweight Word taskpane scaffold. | Low client-data risk; generated dependency tree. | Covered by `.gitignore` and `.dockerignore`. | Rebuildable, but do not remove during documentation tasks. | T036 |
| `word_plugin/dist/` | Vite build output | Yes | Generated local Word taskpane bundle output. | Low to medium; may be useful for local sideload tests. | Covered by `.gitignore` and `.dockerignore`. | Review before deletion if used for local Office testing. | T035 |
| `Microsoft/` | Local Microsoft/Office runtime state | Yes | Local Office or Microsoft tooling state in the checkout. | Unknown until inspected; may contain local certificates, cache, or account-adjacent files. | Not specifically covered by current ignore rules. | Approval-required classification needed before any action. | T035, T038 |

## Ignore Coverage Notes

| File | Status | Notes |
|------|--------|-------|
| `.gitignore` | Present | Covers `.env*`, Python caches, virtual environments, Node dependencies, frontend build output, `.districtdraft_runtime/`, upload storage, analysis history, logs, and editor/OS state. |
| `.dockerignore` | Added during implementation setup verification | Mirrors critical `.gitignore` coverage so Docker contexts do not include local dependencies, caches, uploads, runtime state, or environment files. |
| `.eslintignore` | Not added by T004 | ESLint configuration is package-local and should be reviewed during package validation tasks rather than this cleanup inventory task. |

## T004 Completion Summary

T004 recorded the generated, cache, dependency, upload, and local-runtime paths
visible in the current checkout. The register explicitly marks this work as
documentation-only and defers all deletion, movement, archival, and approval
decisions to later cleanup tasks.

## T005 Completion Summary

T005 added the cleanup decision log with explicit keep, move, archive, delete,
approval-required, rationale, status, and source-task fields. Initial rows cover
Spec Kit artifacts, active core files, sensitive local state, rebuildable
artifacts, and legacy documentation sources.

## T006 Completion Summary

T006 added project-structure cleanup principles based on [plan.md](./plan.md),
the Mercy constitution, and the current local/demo architecture. These principles
preserve source-of-truth discipline, confidentiality, the Shared Intelligence
Core, working product surfaces, and validation-first cleanup.
