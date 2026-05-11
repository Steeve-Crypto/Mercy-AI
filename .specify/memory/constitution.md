<!--
Sync Impact Report
Version change: template -> 1.0.0
Modified principles:
- Template principle 1 -> I. D.C.-Native Legal Scope
- Template principle 2 -> II. Attorney Supervision and Verification
- Template principle 3 -> III. Privacy, Retention, and Tenant Boundaries
- Template principle 4 -> IV. One Brain, Two Windows Architecture
- Template principle 5 -> V. Source-Grounded, Testable Output
Added sections:
- Product and Architecture Standards
- Development Workflow and Quality Gates
Removed sections:
- Placeholder section headers and example comments from the template
Templates requiring updates:
- .specify/templates/plan-template.md: updated
- .specify/templates/spec-template.md: updated
- .specify/templates/tasks-template.md: updated
- .specify/templates/commands/*.md: not present
Runtime guidance requiring updates:
- README.md: updated
- AGENTS.md: updated
Follow-up TODOs:
- None
-->
# Mercy Constitution

## Core Principles

### I. D.C.-Native Legal Scope
Mercy MUST remain focused on D.C. appellate, administrative, and small-firm legal
work unless a feature explicitly documents why a broader jurisdiction is required.
Core drafting and review behavior MUST prioritize D.C. Circuit practice, D.C. Court
of Appeals practice, D.C. local rules, Federal Rules of Appellate Procedure, D.C.
Code, D.C. Municipal Regulations, and D.C. Bar ethics duties over generic legal
assistant behavior.

Rationale: Mercy's value is the local specialist position. Broad legal AI behavior
weakens product differentiation and increases legal accuracy risk.

### II. Attorney Supervision and Verification
Every AI-generated legal output MUST make attorney review non-optional. Drafting,
analysis, risk scoring, billing notes, and citation guidance MUST preserve clear
human-review requirements and MUST NOT present unverified facts, authority,
quotations, record cites, or standards of review as final. Missing authority or
record support MUST be marked with explicit verification placeholders such as
`[VERIFY CITE]` or bracketed record-review instructions.

Rationale: D.C. Bar Ethics Opinion 388 requires competent supervision,
confidentiality safeguards, citation verification, candor, and reasonable fee
treatment. The system supports lawyers; it does not replace legal judgment.

### III. Privacy, Retention, and Tenant Boundaries
Local development MUST keep the zero-retention posture: matter state is in-memory
unless a feature explicitly introduces encrypted persistence with documented
retention controls. Client documents, prompts, and matter facts MUST NOT be used for
model training by Mercy. Any production feature that stores client data MUST define
authentication, tenant isolation, encryption, retention, deletion, and audit-log
boundaries before implementation starts.

Rationale: Legal users are highly sensitive to confidentiality and privilege. Data
handling must be designed before persistence, collaboration, or analytics expand.

### IV. One Brain, Two Windows Architecture
The Mercy Shared Intelligence Core is the authoritative backend for discovery,
drafting, guardrails, matter context, and billing-report logic. The standalone
platform is the heavy-lifting workspace for intake, administrative records, matter
management, and reports. The Word add-in is the drafting sidekick for document-local
review, insertion, and attorney workflow. New capabilities MUST either extend this
model or document a complexity justification in the implementation plan.

Rationale: A shared core prevents inconsistent legal behavior across surfaces while
letting each UI serve its strongest workflow.

### V. Source-Grounded, Testable Output
Features that analyze legal documents MUST preserve structured facts, source or
record anchors when available, D.C. guardrail results, and machine-readable API
responses. New endpoints MUST use explicit request/response models and predictable
error behavior. Features that change legal output, guardrails, billing notes, data
handling, or cross-surface contracts MUST include focused tests or documented manual
verification covering the affected workflow.

Rationale: Legal AI quality depends on traceability, repeatability, and the ability
to inspect why an output requires review.

## Product and Architecture Standards

Mercy is an AI-native legal workspace built from these active project areas:

- `main.py`: FastAPI Shared Intelligence Core and `/v1/*` API surface.
- `bridge.py`: integration layer into `legal_discovery_ai` without rewriting that
  package.
- `dc_guardrails.py`: D.C. Rule 28, Rule 32, and Ethics Opinion 388 response checks.
- `mercy_context.py`: local in-memory matter state and billing-report scaffolding.
- `system_prompts.py`: D.C. Clerk Operating System and guardrail schemas.
- `standalone_platform/`: browser dashboard served by the FastAPI core.
- `word_plugin/`: lightweight Word taskpane scaffold served by the FastAPI core.
- `mercy-legal-web/`: Next.js product and dashboard app.
- `mercy-legal-plugin/`: React/Vite production-oriented Word add-in.
- `legal_discovery_ai/`: CrewAI discovery engine package.
- `tools/`: local CLI utilities.

Python service code MUST remain compatible with the documented Python support range
for CrewAI dependencies, currently Python 3.10 through 3.13 with Python 3.11 or 3.12
preferred on Windows. TypeScript surfaces MUST keep typechecking and build scripts
working for their package. Production-facing Word add-ins MUST use HTTPS hosting and
validated Office manifests before external distribution.

Features that introduce premium behavior MUST preserve the free/premium distinction:
single-document drafting and basic guardrails may remain entry-level, while
multi-document administrative record indexing, audit trails, citation verification,
case context sync, and client billing reports belong behind explicit premium gating.

## Development Workflow and Quality Gates

Every implementation plan MUST pass these constitution gates before design work is
accepted:

- Scope gate: identify the D.C. legal workflow and state any jurisdictional
  expansion.
- Supervision gate: define attorney-review, citation-verification, and record-review
  behavior for any legal output.
- Privacy gate: state whether the feature touches client data, persistence, uploads,
  audit logs, billing events, or tenant boundaries.
- Architecture gate: identify which Mercy surface owns the feature and how it uses
  the Shared Intelligence Core.
- Grounding gate: define source anchors, structured outputs, guardrail effects, and
  verification evidence.
- Quality gate: list build, typecheck, lint, tests, or manual workflow checks that
  must pass for the changed surface.

Plans that violate a gate MUST document the violation, the reason it is necessary,
and the simpler alternative that was rejected. Tasks MUST remain independently
testable by user story and MUST include exact file paths. Documentation MUST be
updated whenever commands, setup, deployment posture, environment variables, or
production hardening assumptions change.

## Governance

This constitution supersedes conflicting local practices, templates, and feature
plans. Amendments MUST be made through `.specify/memory/constitution.md`, include a
Sync Impact Report, and update dependent templates or runtime guidance in the same
change when the amendment affects planning, specification, tasks, or development
workflow.

Versioning follows semantic versioning:

- MAJOR: removes or redefines a core principle, changes governance authority, or
  permits behavior previously prohibited by a principle.
- MINOR: adds a principle, adds a governed section, or materially expands required
  gates or quality expectations.
- PATCH: clarifies wording, fixes documentation drift, or updates examples without
  changing obligations.

Compliance review is required for every feature plan, code review, and release
candidate. Reviewers MUST verify that legal output remains attorney-supervised, data
handling matches the documented retention posture, architecture changes preserve the
Shared Intelligence Core contract, and verification evidence is sufficient for the
affected legal workflow.

**Version**: 1.0.0 | **Ratified**: 2026-05-11 | **Last Amended**: 2026-05-11
