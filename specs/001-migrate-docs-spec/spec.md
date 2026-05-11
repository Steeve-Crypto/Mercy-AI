# Feature Specification: Mercy Source-of-Truth Product Specification

**Feature Branch**: `001-migrate-docs-spec`  
**Created**: 2026-05-11  
**Status**: Draft  
**Input**: User description: "Migrate all my previous documentation into this Spec Kit specification. Read README.md, docs/ folder, and any other requirement files. Produce a comprehensive, well-structured spec that serves as the new source of truth."

## Documentation Sources Migrated

This specification consolidates the active product requirements and strategic
direction from:

- `README.md`
- `MERCY_BUILD_DOCUMENTATION.md`
- `DEPLOYMENT.md`
- `PRODUCT_BLUEPRINT_ALIGNMENT.md`
- `legal_discovery_ai/README.md`
- `mercy-legal-web/PROJECT_STRUCTURE.md`
- `mercy-legal-plugin/DEPLOYMENT.md`
- `mercy-legal-plugin/assets/README.md`
- `mercy-legal-web/public/downloads/mercy-plugin-preview.txt`
- `.env.example` and product environment examples
- `Mercy_architecture.md.docx`
- `MERCY_SYSTEM_DESIGN.md.docx`
- `Site1.md.docx`
- `Site2.md.docx`
- `Site3.md.docx`
- `.specify/memory/constitution.md`

No `docs/` directory exists in this checkout as of 2026-05-11.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Govern Product Scope From One Spec (Priority: P1)

As the founder, I want all prior Mercy product, architecture, compliance, and
monetization documentation consolidated into one Spec Kit specification so future
planning uses a single source of truth instead of scattered notes.

**Why this priority**: The team needs one authoritative baseline before planning
authentication, persistence, citation verification, premium gating, or production
Word add-in distribution.

**Independent Test**: A reviewer can read this specification alone and identify
Mercy's market, core users, product surfaces, mandatory legal safeguards,
current capabilities, future gaps, and success criteria without opening the old
source documents.

**Acceptance Scenarios**:

1. **Given** a planner starts a new Mercy feature, **When** they open this spec,
   **Then** they can determine whether the feature belongs in the shared core,
   standalone platform, Word add-in, product dashboard, discovery engine, or
   operational tooling.
2. **Given** a requirement conflicts with older notes, **When** this spec and the
   constitution state the current rule, **Then** this spec and the constitution
   govern the product decision.
3. **Given** a reviewer checks previous documentation, **When** they compare the
   source inventory to this spec, **Then** the core product requirements are
   represented in testable form.

---

### User Story 2 - Deliver D.C.-Native Legal Workflows (Priority: P1)

As a D.C. solo or boutique attorney, I want Mercy to help me process legal
documents, understand D.C.-specific risks, and draft attorney-ready work product
so I can compete with larger firms without relying on generic legal AI.

**Why this priority**: D.C.-native legal specialization is the product's main
market wedge and must be preserved across every surface.

**Independent Test**: A D.C. attorney can start from a matter, submit a legal
document or facts, receive structured analysis or drafting output, and see clear
attorney-review and verification prompts before using the work product.

**Acceptance Scenarios**:

1. **Given** an attorney has a single legal document, **When** they request
   analysis, **Then** Mercy returns a structured case or contract summary with
   parties, timeline or obligations, risks, missing elements, and next actions.
2. **Given** an attorney requests drafting, **When** the available facts do not
   include a legal authority or record citation, **Then** Mercy marks the missing
   support with verification placeholders rather than inventing support.
3. **Given** output is produced for appellate or administrative work, **When**
   the attorney reviews it, **Then** D.C. local-rule, form, citation, and ethics
   review signals are visible.

---

### User Story 3 - Use One Brain Across Two Work Windows (Priority: P1)

As an attorney, I want the standalone platform and Word add-in to share the same
matter context and legal intelligence so I can perform heavy document work in one
place and draft in Word without losing context.

**Why this priority**: The "One Brain, Two Windows" model is the central product
architecture and monetization strategy.

**Independent Test**: A matter created or analyzed in the standalone workspace can
be referenced from the drafting sidekick so generated text reflects the same
case context and guardrail posture.

**Acceptance Scenarios**:

1. **Given** an attorney creates a matter in the platform, **When** they run
   discovery or document analysis, **Then** the resulting facts can be reused for
   drafting assistance.
2. **Given** an attorney is drafting in Word, **When** they provide the active
   matter context, **Then** Mercy can generate or insert Word-ready text tied to
   that matter.
3. **Given** the Word context is unavailable, **When** an attorney generates
   drafting output, **Then** Mercy still provides a copyable fallback.

---

### User Story 4 - Preserve Confidentiality and Supervision (Priority: P1)

As a supervising attorney, I want Mercy to protect client confidentiality,
minimize retention, and require human verification so the tool supports D.C.
ethics duties instead of creating hidden professional-responsibility risk.

**Why this priority**: Legal trust, confidentiality, and human supervision are
mandatory for adoption and external deployment.

**Independent Test**: A reviewer can inspect any legal output or data-handling
workflow and find explicit human-review requirements, citation or record
verification obligations, and clear storage or retention expectations.

**Acceptance Scenarios**:

1. **Given** Mercy processes client facts locally, **When** no production storage
   feature has been approved, **Then** matter context remains non-persistent.
2. **Given** a feature proposes persistent storage, **When** it is specified,
   **Then** authentication, tenant isolation, encryption, retention, deletion, and
   audit boundaries are defined before implementation.
3. **Given** Mercy suggests billing-related value, **When** it produces a report
   or saved-time estimate, **Then** the output includes attorney review and fee
   reasonableness warnings.

---

### User Story 5 - Convert Product Strategy Into Commercial Tiers (Priority: P2)

As the founder, I want Mercy's free, paid, and premium capabilities clearly
separated so the product can earn trust with low-friction entry while reserving
high-value workflows for paid plans.

**Why this priority**: The older documentation repeatedly identifies monetization
through solo subscriptions, pay-per-case pricing, and premium administrative-record
workflows.

**Independent Test**: A product reviewer can classify each major capability as
entry-level, paid, or premium and explain what extra value causes a user to upgrade.

**Acceptance Scenarios**:

1. **Given** an attorney only needs basic drafting or single-document analysis,
   **When** they use Mercy, **Then** the product can deliver limited value without
   requiring a full firm rollout.
2. **Given** an attorney needs multi-document administrative record review,
   source-linked audit trails, or billing reports, **When** they request those
   capabilities, **Then** Mercy treats them as premium workflows.
3. **Given** a firm wants broader adoption, **When** it evaluates Mercy, **Then**
   plans can scale from solo use to small-firm and practice-level use.

---

### User Story 6 - Prepare for Production Distribution (Priority: P2)

As an operator, I want a clear readiness baseline for public deployment and Word
add-in distribution so Mercy does not ship externally before security, billing,
hosting, and support obligations are met.

**Why this priority**: Current documentation marks the product as locally runnable
but not yet production-hardened.

**Independent Test**: A release reviewer can use this spec to decide whether the
product is still local/demo-only or ready for external users.

**Acceptance Scenarios**:

1. **Given** Mercy is deployed outside local development, **When** users can
   access client-data workflows, **Then** authentication and tenant isolation are
   active.
2. **Given** the Word add-in is distributed officially, **When** it is submitted
   for marketplace review, **Then** public HTTPS hosting, production manifest,
   support, privacy, terms, icons, screenshots, descriptions, and test
   credentials are ready.
3. **Given** premium actions are enabled, **When** users subscribe or pay, **Then**
   payment enforcement and plan gating are active.

---

### Edge Cases

- No live model key is configured: Mercy must return structured fallback drafting
  or analysis with attorney verification placeholders instead of failing silently.
- A document or request lacks authority, record cites, quotations, procedural
  facts, or standards of review: Mercy must mark missing support for attorney
  verification and must not invent it.
- Uploaded files are not suitable legal documents or are too noisy to parse:
  Mercy must return quality warnings and next actions rather than overconfident
  legal conclusions.
- A user requests non-D.C. legal analysis: Mercy must either stay within its D.C.
  scope or clearly label the request as outside the product's governed specialty.
- A matter cannot be found, has expired, or is not available in the active
  surface: Mercy must provide a recoverable path to recreate, select, or paste
  context.
- Word insertion is unavailable: Mercy must provide a copyable draft fallback.
- A premium workflow is requested from a non-premium context: Mercy must explain
  the limitation and avoid performing gated work without authorization.
- A billing report would imply client pass-through costs: Mercy must include fee
  reasonableness and engagement-review warnings.
- A production deployment stores client data: Mercy must require retention,
  deletion, encryption, audit, and tenant-boundary rules before launch.
- A source or citation verifier cannot confirm an authority: Mercy must preserve
  the item as unverified and require attorney review.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Mercy MUST serve D.C. appellate, administrative, and small-firm
  legal workflows as its primary product scope.
- **FR-002**: Mercy MUST position itself as an affordable, D.C.-native alternative
  to enterprise legal AI for solo and boutique firms.
- **FR-003**: Mercy MUST maintain a shared intelligence core that provides common
  discovery, drafting, guardrail, matter-context, and billing-report behavior to
  all user-facing surfaces.
- **FR-004**: Mercy MUST provide a standalone platform for heavy document intake,
  matter setup, record review, discovery analysis, draft preparation, billing
  reports, and operational review.
- **FR-005**: Mercy MUST provide a Word drafting sidekick for document-local
  drafting, explanation, review, insertion, risk reporting, and active matter
  assistance.
- **FR-006**: Mercy SHOULD provide a public product and dashboard experience that
  communicates the offering, supports user onboarding, exposes pricing, and
  presents the main workspace for authenticated users.
- **FR-007**: Mercy MUST allow attorneys to create or select a matter context
  before attaching facts, drafts, billing events, or premium reports.
- **FR-008**: Mercy MUST support single-document legal analysis for uploaded or
  referenced PDFs and legal text.
- **FR-009**: Mercy MUST extract or present structured facts, including summaries,
  parties or entities, timelines, key issues, critical risks, missing elements,
  and recommended next actions when available.
- **FR-010**: Mercy MUST identify legal and compliance risks relevant to D.C.
  practice, including PII, privilege, fraud indicators, D.C. Code or regulatory
  issues, contract ambiguity, missing protections, and enforceability concerns.
- **FR-011**: Mercy MUST support D.C.-focused drafting assistance for appellate,
  administrative, contract, clause, memo, summary, and risk-report workflows.
- **FR-012**: Mercy MUST use a senior D.C. appellate clerk posture for appellate
  and administrative drafting, including D.C. Circuit rules, relevant D.C. court
  practice, local rules, and controlling authority.
- **FR-013**: Mercy MUST apply advisory guardrails for brief structure, form,
  citation placeholders, record placeholders, human review, confidentiality,
  citation verification, supervising attorney review, and fee reasonableness.
- **FR-014**: Mercy MUST mark every missing or unverified citation, authority,
  quotation, record cite, procedural fact, or standard of review for attorney
  verification.
- **FR-015**: Mercy MUST NOT present unverified legal authority, record support,
  quotations, standards of review, or facts as final.
- **FR-016**: Mercy MUST produce Word-ready drafting text without unnecessary
  conversational framing when a user requests legal drafting output.
- **FR-017**: Mercy MUST provide a copy or insertion path for generated text so an
  attorney can use it in a document workflow.
- **FR-018**: Mercy MUST preserve human review as mandatory for all AI-generated
  legal work product.
- **FR-019**: Mercy MUST preserve a zero-retention local-development posture unless
  a production storage feature explicitly defines the required safeguards.
- **FR-020**: Mercy MUST NOT use client documents, prompts, or matter facts for
  model training by Mercy.
- **FR-021**: Mercy MUST require authentication and tenant isolation before any
  external deployment that exposes client-data workflows.
- **FR-022**: Mercy MUST require encrypted persistence, retention controls,
  deletion controls, and audit boundaries before storing premium matter data.
- **FR-023**: Mercy MUST provide billing-report behavior for premium workflows that
  records AI-assisted tasks, estimated time saved, and attorney review warnings.
- **FR-024**: Mercy MUST maintain a free or entry path for basic drafting,
  single-document analysis, and basic guardrails.
- **FR-025**: Mercy MUST reserve multi-document administrative record indexing,
  audit trails, official citation/source verification, matter sync, and billing
  reports for premium or higher-value plans.
- **FR-026**: Mercy SHOULD support low-friction self-serve adoption for solo and
  boutique users, including clear pricing and sign-up paths.
- **FR-027**: Mercy SHOULD support pay-per-case or pass-through pricing concepts
  when they are compatible with attorney billing duties and engagement terms.
- **FR-028**: Mercy MUST support official Word add-in distribution only after
  public HTTPS hosting, production manifest generation, manifest validation,
  support URL, privacy policy, terms, screenshots, descriptions, icons, and test
  credentials are ready.
- **FR-029**: Mercy MUST expose clear product-readiness states distinguishing
  local/demo behavior from production-hardened behavior.
- **FR-030**: Mercy SHOULD support D.C. clause library workflows, including clause
  explanation, insertion, risk notes, and D.C.-specific drafting guidance.
- **FR-031**: Mercy SHOULD support a D.C. legal assistant chat experience that can
  answer grounded questions across active matter facts, documents, clauses, and
  approved legal sources.
- **FR-032**: Mercy SHOULD support contract analysis with risk scoring, issue
  summaries, recommended revisions, and D.C.-specific enforceability context.
- **FR-033**: Mercy SHOULD support document vault workflows for upload,
  organization, tagging, retrieval, and matter association after storage safeguards
  are approved.
- **FR-034**: Mercy SHOULD support administrative record workflows, including bulk
  upload, indexing, semantic search, Bates or record citation anchoring,
  contradiction detection, and exportable reports.
- **FR-035**: Mercy SHOULD support source-linked audit trails for premium outputs,
  including official court, agency, or public-source references when available.
- **FR-036**: Mercy SHOULD support role-based collaboration for firm use only after
  authentication, tenant isolation, and audit requirements are satisfied.
- **FR-037**: Mercy MUST provide user-friendly errors and fallback guidance for
  missing model credentials, unavailable model providers, quota exhaustion,
  unsupported files, missing matters, and failed document processing.
- **FR-038**: Mercy MUST maintain documentation that identifies current
  limitations, production hardening gaps, environment setup, deployment posture,
  and readiness criteria.
- **FR-039**: Mercy MUST treat this specification and the constitution as the
  governing product source for future planning.
- **FR-040**: Future features MUST update this specification when they materially
  change product scope, legal safeguards, data handling, monetization, deployment
  posture, or user-facing workflows.

### Key Entities *(include if feature involves data)*

- **Attorney User**: A solo, boutique, or small-firm legal professional using
  Mercy for D.C.-focused document review, drafting, matter work, or practice
  operations.
- **Matter**: A case, client project, or legal workstream with a name, tier,
  created date, facts, drafts, and billing events.
- **Document**: A legal PDF, contract, email, discovery file, administrative
  record excerpt, clause, draft, or other source material reviewed by Mercy.
- **Extracted Facts**: Structured information derived from documents or user input,
  including summaries, parties, entities, timeline items, issues, risks, gaps, and
  next actions.
- **Draft Output**: Attorney-review-required legal text, memo content, clause
  revision, appellate section, risk report, or other Word-ready content.
- **Guardrail Result**: Advisory review metadata covering D.C. brief structure,
  form, citation placeholders, record placeholders, confidentiality, supervision,
  citation verification, and fee reasonableness.
- **Source Anchor**: A citation, record reference, Bates marker, document location,
  official-source link, or placeholder that ties an output claim to verifiable
  support.
- **Billing Event**: A premium workflow record describing an AI-assisted task,
  baseline time, estimated assisted time, minutes saved, and billing caution.
- **Plan or Tier**: A product entitlement level such as entry/free, solo,
  small-firm, practice, or premium case project.
- **Audit Trail**: A reviewable history of prompts, source anchors, verification
  status, attorney approvals, and report exports that avoids unnecessary client
  data retention.
- **Clause Library Item**: A D.C.-focused clause, explanation, jurisdiction note,
  risk rating, and recommended drafting use.
- **User Workspace**: The attorney-facing area where matters, documents, analysis,
  drafts, clauses, assistant chat, and activity are organized.

### Legal AI Safety & Data Handling *(mandatory for Mercy features)*

- **D.C. scope**: Mercy serves D.C. appellate, administrative, regulatory,
  contract, and small-firm practice workflows first. Non-D.C. work must be clearly
  labeled as outside the governed specialty or separately justified.
- **Attorney supervision**: Every legal output must require attorney review.
  Outputs must expose citation verification, record verification, confidentiality,
  supervising attorney review, candor, and fee reasonableness obligations when
  relevant.
- **Source grounding**: Mercy must ground legal output in supplied facts,
  uploaded documents, active matter context, D.C. legal sources, or explicit
  placeholders. Unverified support must remain marked until reviewed.
- **Data handling**: Local development uses non-persistent matter context by
  default. Production storage requires authentication, tenant isolation,
  encryption, retention, deletion, and audit-log boundaries before launch.
- **Guardrail impact**: D.C. Rule 28, Rule 32, D.C. Bar Ethics Opinion 388,
  confidentiality, citation verification, source anchoring, human review, and fee
  reasonableness checks are required for legal drafting and review workflows.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new planner can read this spec and correctly identify Mercy's
  target market, product surfaces, legal safeguards, monetization tiers, current
  limitations, and next build priorities in under 20 minutes.
- **SC-002**: 100% of migrated source documents listed in the source inventory are
  represented by at least one requirement, scenario, entity, assumption, or
  success criterion.
- **SC-003**: 100% of legal output workflows described in this spec include
  attorney-review and source-verification expectations.
- **SC-004**: 100% of workflows that touch client data state whether storage is
  local/non-persistent, production-persistent, or blocked until safeguards are
  defined.
- **SC-005**: A reviewer can classify every major capability as entry/free,
  premium, production-hardening, or future expansion with no more than one
  unresolved ambiguity.
- **SC-006**: A D.C. attorney reviewing the product scope can identify at least
  five concrete D.C.-specific benefits Mercy provides over a generic AI assistant.
- **SC-007**: A release reviewer can determine whether Mercy is local/demo-only or
  production-ready using this spec without consulting old blueprint files.
- **SC-008**: At least 90% of future feature plans can reference this spec for
  scope, safety, data-handling, or tiering decisions without reopening the old
  documentation corpus.

## Assumptions

- The primary target users are D.C. solo attorneys, boutique firms, and small legal
  teams handling appellate, administrative, regulatory, contract, or discovery-heavy
  work.
- Mercy's near-term commercial wedge is D.C.-specific specialization rather than
  broad, general-purpose legal AI.
- The current product remains local/demo-oriented until authentication, tenant
  isolation, encrypted persistence, official citation/source verification, HTTPS
  Word add-in hosting, payment enforcement, and audit controls are completed.
- The "One Brain, Two Windows" architecture remains the governing product model:
  a shared intelligence core powers a standalone workspace and Word drafting
  sidekick.
- The product may also include a public marketing, pricing, sign-up, and dashboard
  experience, but legal intelligence must remain consistent with the shared core.
- Local zero-retention behavior is preferred until a deliberate storage feature is
  specified and approved.
- Premium value is concentrated in multi-document administrative record indexing,
  official-source verification, audit trails, matter sync, billing reports, and
  firm-scale controls.
- Older aspirational notes about broad agent orchestration, large-firm expansion,
  GraphRAG, collaboration, and full audit trails are future expansion signals, not
  current production commitments unless restated as requirements here.
- Source citations and legal-rule references must be verified against authoritative
  sources before they are treated as final legal work product.
- This specification does not replace the constitution; it applies the
  constitution to the product scope and becomes the product requirements baseline
  for planning.
