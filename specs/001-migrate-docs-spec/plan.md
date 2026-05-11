# Implementation Plan: Mercy Source-of-Truth Architecture Plan

**Branch**: `001-migrate-docs-spec` | **Date**: 2026-05-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-migrate-docs-spec/spec.md`

**Note**: This plan documents the current implementation architecture and the
technical modernization path implied by the migrated source-of-truth spec. It does
not implement new production features.

## Summary

Mercy is currently a multi-surface legal AI workspace centered on a Python FastAPI
Shared Intelligence Core. The core serves `/v1/*` product, matter, discovery, and
drafting APIs; attaches D.C. guardrail metadata; hosts a static dashboard and a
lightweight Word taskpane; and bridges into the existing `legal_discovery_ai`
CrewAI discovery package. A separate Next.js product/dashboard app and a separate
React/Vite production-oriented Word add-in exist as parallel product surfaces.

The plan preserves the current "One Brain, Two Windows" architecture while
documenting the technical debt and modernization sequence required to move from
local/demo readiness to production readiness: typed shared contracts, persistent
encrypted matter storage, authentication and tenant isolation, source anchoring,
official citation verification, premium gating, audit logging, and unified
cross-surface integration with the Shared Intelligence Core.

## Technical Context

**Language/Version**: Python 3.10-3.13 supported by `legal_discovery_ai`; Python 3.11/3.12 preferred on Windows; TypeScript 5.6+ and 5.7+ across web/add-in packages; JavaScript for static dashboard and lightweight taskpane.  
**Primary Dependencies**: FastAPI, Uvicorn, Pydantic, python-multipart, CrewAI, crewai-tools, python-dotenv, Streamlit, reportlab, python-docx, Next.js 15, React 19, React 18, Vite 5, Office.js typings/tools, Fluent UI, Radix primitives, Tailwind CSS 4, Stripe SDK.  
**Storage**: Current core uses in-memory matter state and local uploaded PDF files under `legal_discovery_ai/data/uploads`; discovery RAG reads `legal_discovery_ai/data/past_cases`; no production database is active. Future persistent storage must be encrypted and tenant-isolated.  
**Testing**: Current package scripts expose Next.js build/typecheck/lint and Vite build/lint/manifest validation. No centralized Python test suite is present. Manual verification covers FastAPI local run, dashboard flow, Word taskpane flow, CLI commands, and Office manifest validation.  
**Target Platform**: Local Windows development, local browser dashboard, Microsoft Word add-in sideloading, Dockerized FastAPI service, future HTTPS-hosted web and Office add-in deployment.  
**Project Type**: Multi-surface legal AI workspace: web service, static browser workspace, Word add-in, Next.js product/dashboard, Vite Word add-in, CrewAI package, and CLI utilities.  
**Performance Goals**: Local health and matter actions should feel immediate; legal discovery/drafting may be long-running but must provide user-visible progress or recoverable status; future document indexing should support large administrative records without blocking the drafting surface.  
**Constraints**: D.C.-native legal scope, mandatory attorney review, no invented authority, zero-retention local posture, no external client-data deployment without auth/tenant isolation/encryption/retention controls, HTTPS required for production Word add-in, official citation verification required before final reliance.  
**Scale/Scope**: Current scope is local/demo and source-of-truth planning. Target product scope is solo and boutique D.C. firms first, expanding toward premium case projects and small-firm/team workflows after hardening.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Scope gate**: PASS. The plan documents D.C. appellate, administrative,
  contract, discovery, and small-firm workflows from the source spec. No
  jurisdictional expansion is introduced.
- **Supervision gate**: PASS. Existing `system_prompts.py`, `bridge.py`, and
  `dc_guardrails.py` preserve attorney review, verification placeholders, D.C.
  Rule 28/32 checks, and Ethics Opinion 388 review metadata. Modernization items
  retain human review and citation/source verification as required gates.
- **Privacy gate**: PASS. Current storage is in-memory matter state plus local
  uploaded files for processing. The plan blocks production persistence until
  authentication, tenant isolation, encryption, retention, deletion, and audit-log
  boundaries are designed.
- **Architecture gate**: PASS. The Shared Intelligence Core remains authoritative.
  Standalone dashboard, Word taskpane, Next.js product/dashboard, Vite Word add-in,
  CrewAI discovery package, and CLI are documented as surfaces around the core.
- **Grounding gate**: PASS. Existing structured facts, D.C. guardrail results,
  fallback verification placeholders, and billing hooks are documented. Future
  source anchoring, Bates references, and official citation verification are called
  out as modernization requirements.
- **Quality gate**: PASS. Planning artifacts define validation through local API
  smoke checks, CLI checks, web/add-in builds and linting, Office manifest
  validation, and manual workflow verification. Python automated tests are
  identified as a gap.

## Project Structure

### Documentation (this feature)

```text
specs/001-migrate-docs-spec/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- core-api.md
|   |-- cli.md
|   |-- ui-workflows.md
|   `-- word-addin.md
|-- checklists/
|   `-- requirements.md
`-- spec.md
```

### Source Code (repository root)

```text
.
|-- main.py                         # FastAPI Shared Intelligence Core
|-- bridge.py                       # Adapter into legal_discovery_ai and Clerk OS drafting
|-- dc_guardrails.py                # D.C. Rule 28/32 and Ethics 388 middleware
|-- mercy_context.py                # In-memory matter store and billing reports
|-- system_prompts.py               # D.C. Clerk OS prompt and guardrail schema
|-- tools/
|   `-- mercy_cli.py                # Local CLI for health, matters, drafting, billing
|-- standalone_platform/
|   |-- index.html
|   |-- app.js                      # Static browser workspace against core API
|   `-- styles.css
|-- word_plugin/
|   |-- manifest.xml
|   |-- taskpane.html
|   `-- taskpane.js                 # Lightweight Word taskpane against core API
|-- legal_discovery_ai/
|   |-- pyproject.toml
|   |-- requirements.txt
|   |-- data/
|   |   |-- past_cases/
|   |   `-- uploads/
|   `-- src/legal_discovery_ai/
|       |-- app.py                  # Streamlit discovery UI
|       `-- crew.py                 # CrewAI parser/risk/brief workflow
|-- mercy-legal-web/
|   |-- package.json
|   `-- src/
|       |-- app/
|       |-- components/
|       |-- lib/
|       `-- store/
|-- mercy-legal-plugin/
|   |-- package.json
|   |-- manifest.xml
|   |-- scripts/
|   `-- src/
|       |-- components/
|       |-- services/
|       |-- styles/
|       |-- types/
|       `-- utils/
`-- .specify/
```

**Structure Decision**: Keep the current multi-surface repository while treating
`main.py` and supporting root modules as the canonical Shared Intelligence Core.
Future implementation plans should avoid adding another product surface unless the
plan justifies why the existing platform, Word add-in, Next dashboard, discovery
package, or CLI cannot own the workflow.

## Current Architecture

### Component Responsibilities

- **Shared Intelligence Core (`main.py`)**: Defines the FastAPI app, CORS policy,
  static mounting, matter endpoints, product capabilities, Clerk OS inspection,
  discovery endpoints, upload handling, drafting endpoint, and billing report
  endpoint.
- **Discovery/Drafting Bridge (`bridge.py`)**: Adds the discovery package to
  `sys.path`, configures CrewAI local runtime directories and telemetry flags,
  normalizes discovery output, adds premium billing hooks, builds fallback drafts,
  and calls the configured LLM when credentials are present.
- **D.C. Guardrails (`dc_guardrails.py`)**: Intercepts JSON responses under
  `/v1/*`, evaluates Rule 28/32 and Ethics 388 signals, attaches `dc_guardrails`,
  and defaults `human_review_required` to true.
- **Matter Context (`mercy_context.py`)**: Maintains local in-memory matters with
  facts, drafts, and billing events; generates fee caution billing reports; exposes
  product tier and zero-retention posture.
- **Clerk OS Prompts (`system_prompts.py`)**: Encodes senior D.C. appellate clerk
  behavior, no-fabrication rules, verification placeholders, confidentiality, and
  guardrail schema.
- **Legal Discovery Package (`legal_discovery_ai`)**: Runs a sequential CrewAI
  workflow with document parsing, risk scanning, and case brief writing. Uses
  provider fallback order and optional RAG tools when OpenAI credentials are
  present.
- **Standalone Platform (`standalone_platform`)**: Static browser UI for matter
  creation, discovery by file/path, drafting, guardrail display, billing reports,
  and copy-to-Word workflows against the core API.
- **Lightweight Word Plugin (`word_plugin`)**: Office taskpane scaffold that calls
  the core drafting endpoint and inserts text into Word or copies fallback text.
- **Mercy Legal Web (`mercy-legal-web`)**: Next.js product/marketing/dashboard app
  with dashboard modules, pricing, demo checkout fallback, and future auth/payment
  environment variables.
- **Mercy Legal Plugin (`mercy-legal-plugin`)**: React/Vite Word add-in with
  Fluent UI, local mock legal analysis services, Office integration helpers, and
  production manifest generation/validation scripts.
- **CLI (`tools/mercy_cli.py`)**: Local HTTP client for health, capabilities,
  matter creation/listing, drafting, and billing reports.

### Data Flow

```text
Attorney
  |-- Browser dashboard -> FastAPI core -> In-memory matter store
  |                         |-- discovery request -> bridge -> legal_discovery_ai crew
  |                         |-- draft request -> bridge -> Clerk OS prompt/LLM or fallback
  |                         `-- JSON response -> D.C. guardrail middleware -> UI
  |
  |-- Word taskpane -> FastAPI core -> draft response -> Word insertion/copy fallback
  |
  |-- CLI -> FastAPI core -> JSON/table output
  |
  `-- Next/Vite product surfaces -> currently demo or mock flows; future core integration
```

Uploaded PDFs are written to `legal_discovery_ai/data/uploads` for processing.
Matter facts, drafts, and billing events are held in process memory and are lost on
restart. RAG over `legal_discovery_ai/data/past_cases` is available only when the
required provider credentials and tools are usable.

### Modernization Opportunities

1. **Shared Contract Layer**: Move request/response models and guardrail schemas
   into reusable contracts consumed by FastAPI, CLI, dashboard, and add-ins.
2. **Persistence Boundary**: Introduce encrypted, tenant-scoped persistence only
   after retention/deletion/audit policies are specified.
3. **Authentication and Tenant Isolation**: Gate all external matter/document
   workflows before production deployment.
4. **Source Anchoring**: Add document chunk IDs, Bates/record references, page
   ranges, and official-source links to discovery and drafting outputs.
5. **Citation Verification**: Separate advisory placeholder checks from true
   authority verification against official D.C./federal sources.
6. **Async Job Model**: Convert long discovery/indexing work into tracked jobs
   with progress, cancellation, and retry semantics.
7. **Unified Word Add-in Strategy**: Decide whether `word_plugin/` remains a
   local scaffold only and `mercy-legal-plugin/` becomes the production add-in, or
   merge them behind shared services.
8. **Core Integration for Product Apps**: Replace mock analysis services in
   `mercy-legal-plugin/` and demo-only dashboard surfaces with authenticated core
   API calls.
9. **Centralized Testing**: Add Python endpoint/guardrail tests, contract tests,
   and browser/Office workflow checks in addition to existing TS build/lint gates.
10. **Configuration Hygiene**: Consolidate environment documentation and enforce
    explicit local/demo/production modes.

## Complexity Tracking

No constitution violations are introduced by this planning feature. Existing
complexity is documented rather than expanded.

