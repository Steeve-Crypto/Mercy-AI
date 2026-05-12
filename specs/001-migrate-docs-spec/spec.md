# Feature Specification: Mercy Legal AI Product Source of Truth

**Feature Branch**: `001-migrate-docs-spec`  
**Created**: 2026-05-11  
**Status**: Active product source of truth  
**Input**: User description: "Merge all existing Mercy Legal AI documentation
into one strong Spec Kit specification for a Legal AI assistant serving
Washington, D.C. small law firms. Focus on product vision, features,
requirements, D.C. compliance, guardrails, architecture, MoE routing, and actual
product delivery instead of more housekeeping."

## Documentation Sources Consolidated

This specification is the primary product authority for Mercy going forward. It
consolidates and supersedes product direction scattered across:

- `README.md`
- `MERCY_BUILD_DOCUMENTATION.md`
- `DEPLOYMENT.md`
- `PRODUCT_BLUEPRINT_ALIGNMENT.md`
- `legal_discovery_ai/README.md`
- `mercy-legal-web/PROJECT_STRUCTURE.md`
- `mercy-legal-plugin/DEPLOYMENT.md`
- `mercy-legal-plugin/assets/README.md`
- `mercy-legal-web/public/downloads/mercy-plugin-preview.txt`
- `Mercy_architecture.md.docx`
- `MERCY_SYSTEM_DESIGN.md.docx`
- `Site1.md.docx`
- `Site2.md.docx`
- `Site3.md.docx`
- `system_prompts.py`, `dc_guardrails.py`, `mercy_context.py`, `main.py`, and
  `bridge.py` as evidence of current behavior
- `.specify/memory/constitution.md`
- Supporting Spec Kit inventory files:
  [source-migration.md](./source-migration.md),
  [structure-audit.md](./structure-audit.md), and
  [cleanup-register.md](./cleanup-register.md)

No separate `docs/` directory exists in this checkout as of 2026-05-11.

## Product Vision

Mercy is a D.C.-native Legal AI workspace for solo attorneys, boutique firms, and
small legal teams in Washington, D.C. It helps lawyers intake matters, understand
documents, research D.C.-specific issues, draft attorney-ready work product, and
preserve professional duties around confidentiality, supervision, citations,
record support, and fees.

Mercy is not a generic chatbot and not an enterprise-only legal vault. Its wedge
is the local, affordable, integrated alternative for D.C. small firms:

- D.C. appellate, administrative, regulatory, contract, discovery, and small-firm
  legal workflows first.
- Matter-centered legal work rather than one-off generic prompts.
- A standalone heavy-work workspace plus a Word drafting sidekick.
- Source-grounded output with explicit verification status.
- Low-friction adoption for solo and boutique attorneys.
- Premium value from administrative records, official source verification,
  audit trails, matter sync, and billing reports.

## Product Architecture Direction

Mercy follows the "One Brain, Two Windows" model:

- **Shared Intelligence Core**: The product brain that owns matter context,
  legal task routing, discovery, research, drafting, guardrails, billing-report
  behavior, and shared contracts.
- **Standalone Platform**: The heavy-lifting workspace for intake, document
  upload, discovery review, administrative records, research, billing reports,
  and matter management.
- **Word Drafting Sidekick**: The Microsoft Word experience for document-local
  explanation, clause work, risk highlighting, drafting, insertion, and
  copyable fallback output.
- **Product Dashboard**: The web product and workspace surface for onboarding,
  pricing, active matters, document vault workflows, assistant chat, contract
  analysis, clause library, and activity review.
- **Legal Discovery Engine**: The document parsing, risk scanning, structured
  fact extraction, timeline, entity, issue, missing-element, and next-action
  workflow that feeds the shared core.

The immediate product direction is to build the useful legal AI product around
the current core, not to continue documentation migration as the critical path.
Remaining cleanup and traceability tasks are parked unless they directly unblock
product delivery, legal safety, privacy, source-of-truth integrity, build
verification, or release readiness.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open a D.C. Matter and Capture Intake (Priority: P1)

As a D.C. solo or boutique attorney, I want to open a matter and capture client
facts, parties, deadlines, jurisdiction, documents, requested relief, sensitivity
flags, and missing information so Mercy can reason from the same context across
research, review, and drafting.

**Why this priority**: Small-firm legal work starts with matter context. Without
structured intake, research and drafting become generic and risky.

**Independent Test**: A reviewer can create a matter, enter intake information,
see missing required context, and reuse the matter in research or drafting.

**Acceptance Scenarios**:

1. **Given** an attorney starts a new matter, **When** they enter parties,
   jurisdiction, deadlines, requested relief, and documents, **Then** Mercy stores
   the matter context for the current workspace and marks missing facts.
2. **Given** a matter includes sensitive or privileged material, **When** intake
   is saved, **Then** Mercy shows confidentiality and attorney-review signals.
3. **Given** the attorney asks for research or drafting without enough intake
   context, **When** Mercy evaluates the request, **Then** it asks for the minimum
   missing information or marks assumptions for attorney review.

---

### User Story 2 - Route Legal Work to the Right Capability (Priority: P1)

As an attorney, I want Mercy to understand whether I need intake, research,
document review, contract analysis, drafting, billing, or compliance help so the
response uses the correct legal workflow instead of a generic assistant answer.

**Why this priority**: MoE-style routing is the leverage point for every later
capability and prevents UI surfaces from inventing separate legal behavior.

**Independent Test**: A reviewer can submit representative prompts and see route
mode, confidence, missing inputs, fallback behavior, and guardrail requirements.

**Acceptance Scenarios**:

1. **Given** a user asks "analyze this lease under D.C. law", **When** Mercy
   routes the request, **Then** it selects contract review or clause explanation
   rather than appellate drafting.
2. **Given** a user asks for a D.C. Circuit statement of the case, **When** Mercy
   routes the request, **Then** it selects drafting and applies appellate
   guardrails.
3. **Given** route confidence is low, **When** Mercy responds, **Then** it exposes
   uncertainty, asks a clarifying question or uses a safe general matter route,
   and avoids final legal conclusions.

---

### User Story 3 - Research D.C. Legal Questions With Verification (Priority: P1)

As a D.C. attorney, I want Mercy to research local legal questions and return a
grounded answer with candidate authorities, D.C. jurisdiction notes, source
anchors or placeholders, and verification status so I can use the work safely.

**Why this priority**: D.C.-native legal research is the product's strongest
differentiator over generic AI tools.

**Independent Test**: A reviewer can ask a D.C.-focused legal question and verify
that Mercy distinguishes supported authorities from unverified placeholders.

**Acceptance Scenarios**:

1. **Given** a user asks a D.C. legal research question, **When** Mercy answers,
   **Then** the response includes issue framing, a short answer, authority
   candidates, and verification status.
2. **Given** no authoritative source is available, **When** Mercy produces a
   research summary, **Then** every unsupported cite or proposition remains marked
   for attorney verification.
3. **Given** a user asks for non-D.C. advice, **When** Mercy detects the scope
   issue, **Then** it labels the request outside the governed specialty or asks
   for D.C.-specific context.

---

### User Story 4 - Review Legal Documents and Extract Case Facts (Priority: P1)

As an attorney or staff member, I want Mercy to analyze legal PDFs, contracts,
emails, discovery, and administrative-record materials so I can find parties,
timelines, entities, risks, missing elements, and next actions faster.

**Why this priority**: Document-heavy intake and discovery are immediate
small-firm pain points and feed research and drafting workflows.

**Independent Test**: A reviewer can submit a document or file path and receive
structured facts, risks, warnings, and recommended next actions.

**Acceptance Scenarios**:

1. **Given** an attorney uploads or references a legal PDF, **When** Mercy runs
   document review, **Then** it returns structured facts, parties, timeline,
   issues, critical risks, missing elements, and next actions.
2. **Given** the document contains possible PII, privilege, fraud indicators, or
   D.C. statutory/regulatory issues, **When** Mercy analyzes it, **Then** those
   risks are surfaced for attorney review.
3. **Given** a document is noisy, unsupported, or not a suitable legal document,
   **When** Mercy processes it, **Then** it returns quality warnings instead of
   overconfident legal conclusions.

---

### User Story 5 - Draft Attorney-Ready Work Product (Priority: P1)

As an attorney, I want Mercy to draft memos, client letters, demand letters,
contract clauses, discovery summaries, administrative-record notes, and appellate
sections in Word-ready form so I can revise and supervise the output quickly.

**Why this priority**: Drafting is the daily workflow that makes Mercy valuable
inside a small law practice and inside Microsoft Word.

**Independent Test**: A reviewer can generate a draft from matter facts and
confirm it is Word-ready, tied to matter context, and includes verification
placeholders.

**Acceptance Scenarios**:

1. **Given** a matter has facts and a requested draft type, **When** Mercy drafts,
   **Then** it produces concise legal text without chatty framing.
2. **Given** facts lack record support, citations, quotations, procedural facts,
   or standards of review, **When** Mercy drafts, **Then** it uses bracketed
   placeholders and `[VERIFY CITE]` rather than inventing support.
3. **Given** Word insertion is unavailable, **When** the user generates a draft,
   **Then** Mercy provides copyable text and preserves guardrail status.

---

### User Story 6 - Work Inside Word as a Drafting Sidekick (Priority: P2)

As an attorney drafting in Microsoft Word, I want Mercy to explain selected text,
highlight risks, insert D.C. clauses, answer matter-aware questions, and generate
risk reports without forcing me into another drafting environment.

**Why this priority**: Word is where legal drafting happens, and a sidekick
reduces adoption friction for small firms.

**Independent Test**: A reviewer can use a Word taskpane or equivalent drafting
surface to request explanation, drafting, insertion, or copy fallback while
preserving guardrail status.

**Acceptance Scenarios**:

1. **Given** a user selects contract text in Word, **When** they ask Mercy to
   explain it, **Then** Mercy returns a D.C.-aware explanation and risk notes.
2. **Given** a user requests a D.C. standard clause, **When** Mercy generates it,
   **Then** the clause includes jurisdiction and attorney-verification notes.
3. **Given** insertion fails, **When** Mercy produces output, **Then** the user
   receives a copyable fallback.

---

### User Story 7 - Preserve Confidentiality, Supervision, and Compliance (Priority: P1)

As a supervising attorney, I want every Mercy workflow to preserve confidentiality,
human review, citation verification, record verification, fee reasonableness, and
clear data-handling boundaries so the product supports professional duties.

**Why this priority**: Legal trust and D.C. ethics duties are mandatory for
adoption and deployment.

**Independent Test**: A reviewer can inspect intake, research, review, drafting,
and billing output and find visible compliance signals.

**Acceptance Scenarios**:

1. **Given** Mercy produces legal output, **When** the user reviews it, **Then**
   human review and verification status are visible.
2. **Given** Mercy processes local client data before production storage is
   approved, **When** the workflow completes, **Then** the product maintains a
   local/non-persistent posture except for explicitly identified processing files.
3. **Given** Mercy estimates saved time or billing value, **When** it produces a
   billing report, **Then** it warns that attorney supervision, fee
   reasonableness, and engagement terms control any client charge.

---

### User Story 8 - Package Free and Premium Value Clearly (Priority: P2)

As the founder, I want Mercy's entry and premium capabilities separated so small
firms can adopt quickly while high-value workflows support paid plans.

**Why this priority**: The business model depends on low-friction adoption plus
premium workflows that save measurable attorney time.

**Independent Test**: A product reviewer can classify each major capability as
entry, paid, premium, production-gated, or future expansion.

**Acceptance Scenarios**:

1. **Given** a user needs single-document analysis or basic drafting, **When**
   they use Mercy, **Then** the product can provide limited value in an entry
   tier.
2. **Given** a user needs administrative-record indexing, audit trails, official
   source verification, matter sync, or billing reports, **When** they request
   those features, **Then** Mercy treats them as premium or production-gated.
3. **Given** external users access client-data workflows, **When** production
   deployment is planned, **Then** authentication, tenant isolation, encrypted
   persistence, retention, deletion, audit, and support obligations are defined.

---

### Edge Cases

- A request lacks jurisdiction, posture, facts, or requested relief: Mercy asks
  for missing context or marks assumptions for attorney review.
- A request falls outside D.C. scope: Mercy labels it outside the governed
  specialty or requires a separate scoped justification.
- The router cannot classify a request confidently: Mercy exposes low confidence,
  asks a clarifying question or uses a safe general route, and avoids final legal
  conclusions.
- No live model key is configured: Mercy returns structured fallback output with
  verification placeholders instead of failing silently.
- A source, quote, record cite, procedural fact, or standard of review is missing:
  Mercy preserves a placeholder and never presents it as verified.
- A document is unsupported, noisy, oversized, or not legal material: Mercy
  returns quality warnings and next actions.
- A matter cannot be found or has expired from local state: Mercy provides a path
  to recreate, select, or paste context.
- A premium workflow is requested without entitlement: Mercy explains the
  limitation and avoids performing gated work.
- A production feature would store client data: Mercy blocks launch until
  authentication, tenant isolation, encryption, retention, deletion, and audit
  boundaries are specified.
- Word insertion is unavailable: Mercy provides copyable output with the same
  attorney-review and guardrail metadata.
- A billing report could imply client pass-through costs: Mercy includes fee
  reasonableness and engagement-review warnings.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Mercy MUST serve D.C. appellate, administrative, regulatory,
  contract, discovery, and small-firm legal workflows before broader legal use
  cases.
- **FR-002**: Mercy MUST position itself as an affordable, D.C.-native alternative
  to enterprise legal AI for solo and boutique law firms.
- **FR-003**: Mercy MUST maintain one shared legal intelligence core for matter
  context, routing, research, document review, drafting, guardrails, billing
  reports, and shared contracts.
- **FR-004**: Mercy MUST provide a heavy-work workspace for matter setup,
  document intake, discovery review, legal research, draft preparation, billing
  reports, and operational review.
- **FR-005**: Mercy MUST provide a Word drafting sidekick for document-local
  explanation, review, insertion, risk reporting, clause work, and copy fallback.
- **FR-006**: Mercy SHOULD provide a product/dashboard experience for onboarding,
  pricing, workspace entry, authenticated user access, and product education.
- **FR-007**: Mercy MUST support matter creation and selection before attaching
  facts, documents, drafts, research notes, billing events, or premium reports.
- **FR-008**: Mercy MUST support structured client intake with parties, contact
  or context notes, deadlines, jurisdiction, desired relief, document list,
  sensitivity flags, and missing information.
- **FR-009**: Mercy MUST classify user requests into legal task routes including
  intake, research, discovery review, drafting, contract review, clause
  explanation, billing, compliance, and general matter assistance.
- **FR-010**: Mercy MUST expose route mode, route confidence, missing inputs,
  selected capability, fallback behavior, and guardrail requirements for routed
  tasks.
- **FR-011**: Mercy MUST support single-document legal analysis for uploaded or
  referenced PDFs, contracts, emails, discovery materials, and legal text.
- **FR-012**: Mercy MUST extract or present structured facts including summaries,
  metadata, parties, entities, exhibits, timeline, issues, risks, missing
  elements, quality warnings, and next actions when available.
- **FR-013**: Mercy MUST identify D.C.-relevant legal and compliance risks,
  including PII, privilege, fraud indicators, D.C. Code or regulatory issues,
  contract ambiguity, missing protections, and enforceability concerns.
- **FR-014**: Mercy MUST support D.C.-focused legal research with issue framing,
  short answer, candidate authorities, jurisdiction notes, source anchors or
  placeholders, and verification status.
- **FR-015**: Mercy MUST distinguish source anchoring from true official citation
  verification; unverified support must remain visibly unverified.
- **FR-016**: Mercy MUST support D.C.-focused drafting assistance for appellate,
  administrative, contract, clause, memo, client-letter, demand-letter,
  summary, and risk-report workflows.
- **FR-017**: Mercy MUST use a senior D.C. appellate clerk posture for appellate
  and administrative drafting, including D.C. Circuit rules, D.C. court practice,
  local rules, controlling authority, and record-based drafting.
- **FR-018**: Mercy MUST produce Word-ready legal text without unnecessary
  conversational framing when the user requests drafting output.
- **FR-019**: Mercy MUST provide insertion or copy paths for generated drafting
  output.
- **FR-020**: Mercy MUST support D.C. clause library workflows, including clause
  explanation, insertion, risk notes, jurisdiction notes, and D.C.-specific
  drafting guidance.
- **FR-021**: Mercy SHOULD support contract analysis with risk scoring, issue
  summaries, recommended revisions, and D.C.-specific enforceability context.
- **FR-022**: Mercy SHOULD support administrative-record workflows including bulk
  upload, indexing, semantic search, Bates or record citation anchoring,
  contradiction detection, and exportable reports.
- **FR-023**: Mercy SHOULD support grounded legal assistant chat across active
  matter facts, documents, clauses, drafts, and approved legal sources.
- **FR-024**: Mercy MUST apply legal safety guardrails to intake, research,
  document review, drafting, billing, and compliance responses when relevant.
- **FR-025**: Mercy MUST mark every missing or unverified citation, authority,
  quotation, record cite, procedural fact, or standard of review for attorney
  verification.
- **FR-026**: Mercy MUST NOT present unverified legal authority, quotations,
  record support, standards of review, procedural facts, or case facts as final.
- **FR-027**: Mercy MUST preserve human attorney review as mandatory for all
  AI-generated legal work product.
- **FR-028**: Mercy MUST preserve confidentiality warnings, citation verification
  requirements, record verification requirements, supervising-attorney review,
  candor reminders, and fee-reasonableness warnings where relevant.
- **FR-029**: Mercy MUST preserve a zero-retention local-development posture
  unless a production storage feature explicitly defines required safeguards.
- **FR-030**: Mercy MUST NOT use client documents, prompts, matter facts, or
  work product for model training by Mercy.
- **FR-031**: Mercy MUST require authentication and tenant isolation before any
  external deployment that exposes client-data workflows.
- **FR-032**: Mercy MUST require encrypted persistence, retention controls,
  deletion controls, and audit boundaries before storing premium matter data.
- **FR-033**: Mercy MUST treat uploaded local documents as processing artifacts,
  not an approved production document vault, until storage safeguards are
  specified.
- **FR-034**: Mercy MUST provide user-friendly errors and fallback guidance for
  missing model credentials, unavailable providers, quota exhaustion, unsupported
  files, missing matters, failed document processing, and unavailable Word APIs.
- **FR-035**: Mercy MUST provide billing-report behavior for premium workflows
  that records AI-assisted tasks, estimated time saved, and attorney review
  warnings.
- **FR-036**: Mercy MUST NOT imply that AI-saved time is automatically billable to
  a client; engagement terms and fee reasonableness must control.
- **FR-037**: Mercy MUST maintain an entry path for basic drafting,
  single-document analysis, basic guardrails, and low-friction product trial.
- **FR-038**: Mercy MUST reserve administrative-record indexing, audit trails,
  official citation/source verification, matter sync, billing reports, and
  firm-scale controls for paid, premium, or production-gated workflows.
- **FR-039**: Mercy SHOULD support solo subscription, small-firm plan, and
  pay-per-case or pass-through pricing concepts when compatible with attorney
  billing duties and engagement terms.
- **FR-040**: Mercy MUST expose local/demo, production-candidate, and
  production-hardened readiness states for product surfaces and workflows.
- **FR-041**: Mercy MUST support official Word add-in distribution only after
  HTTPS hosting, production manifest validation, support URL, privacy policy,
  terms, screenshots, descriptions, icons, and test credentials are ready.
- **FR-042**: Mercy MUST preserve machine-readable response metadata for route
  decisions, guardrail results, human review, verification status, source anchors,
  and premium billing hooks.
- **FR-043**: Mercy SHOULD support source-linked audit trails for premium outputs
  while avoiding unnecessary client-data retention.
- **FR-044**: Mercy SHOULD support role-based collaboration for firm use only
  after authentication, tenant isolation, and audit requirements are satisfied.
- **FR-045**: Mercy MUST maintain documentation that identifies current
  limitations, production hardening gaps, setup expectations, deployment posture,
  and readiness criteria.
- **FR-046**: This specification and the constitution MUST govern Mercy product
  planning. Supporting inventory files remain references, not the product
  critical path.
- **FR-047**: Future features MUST update this specification when they materially
  change product scope, legal safeguards, data handling, monetization, deployment
  posture, user-facing workflows, routing behavior, or compliance expectations.

### Key Entities *(include if feature involves data)*

- **Attorney User**: A solo, boutique, or small-firm legal professional using
  Mercy for D.C.-focused document review, legal research, drafting, matter work,
  or practice operations.
- **Firm / Tenant**: A future production boundary for users, matters, documents,
  entitlements, audit trails, and access control.
- **Matter**: A legal workstream tying intake facts, documents, research notes,
  drafts, billing events, source anchors, and review state together.
- **Client Intake Record**: Structured matter-opening information including
  parties, contact/context notes, deadlines, jurisdiction, documents, requested
  relief, sensitivity flags, and missing information.
- **Document**: A legal PDF, contract, email, discovery file, administrative
  record excerpt, clause, draft, or other source material reviewed by Mercy.
- **Document Chunk / Source Anchor**: Verifiable source support such as a page,
  Bates marker, record reference, text span, official-source link, or placeholder.
- **Extracted Facts**: Structured facts derived from documents or user input,
  including summaries, parties, entities, timelines, issues, risks, gaps, and
  next actions.
- **Legal Task Route**: The router decision describing workflow mode, confidence,
  selected capability, missing inputs, fallback path, and required guardrails.
- **Research Result**: A D.C.-focused research response containing issue framing,
  short answer, authority candidates, source anchors or placeholders,
  verification status, and attorney-review warnings.
- **Draft Output**: Attorney-review-required legal text, memo, clause revision,
  appellate section, risk report, or other Word-ready content.
- **Guardrail Result**: Advisory legal and ethics metadata covering D.C. brief
  structure, form, citation placeholders, record placeholders, confidentiality,
  supervision, citation verification, and fee reasonableness.
- **Compliance Signal**: A machine-readable warning or requirement related to
  confidentiality, privilege, citation verification, record verification, human
  review, fee reasonableness, retention, tenant boundaries, or production status.
- **Billing Event**: A premium workflow record describing an AI-assisted task,
  baseline time, estimated assisted time, minutes saved, and billing caution.
- **Billing Report**: A matter-level report summarizing AI-assisted work,
  estimated time savings, line items, and ethics warnings.
- **Plan or Tier**: A product entitlement level such as entry/free, solo,
  small-firm, practice, or premium case project.
- **Audit Trail**: A reviewable history of prompts, source anchors, verification
  status, attorney approvals, and exports that avoids unnecessary data retention.
- **Clause Library Item**: A D.C.-focused clause, explanation, jurisdiction note,
  risk rating, and recommended drafting use.
- **User Workspace**: The attorney-facing area where active matters, intake,
  documents, analysis, research, drafts, clauses, assistant chat, billing, and
  activity are organized.

### Legal AI Safety & Data Handling *(mandatory for Mercy features)*

- **D.C. scope**: Mercy serves D.C. appellate, administrative, regulatory,
  contract, discovery-heavy, and small-firm workflows first. Non-D.C. work must
  be labeled outside the governed specialty or separately justified.
- **Attorney supervision**: Every legal output must require attorney review.
  Outputs must expose citation verification, record verification,
  confidentiality, supervising-attorney review, candor, and fee reasonableness
  obligations when relevant.
- **Source grounding**: Mercy must ground legal output in supplied facts, uploaded
  documents, active matter context, D.C. legal sources, source anchors, or
  explicit placeholders. Unverified support must remain marked until reviewed.
- **Data handling**: Local development uses non-persistent matter context by
  default. Production storage requires authentication, tenant isolation,
  encryption, retention, deletion, and audit-log boundaries before launch.
- **Guardrail impact**: D.C. Circuit Rule 28, Rule 32, D.C. Bar Ethics Opinion
  388, confidentiality, citation verification, source anchoring, human review,
  and fee reasonableness checks are required for legal drafting and review
  workflows.
- **Model training**: Client documents, prompts, matter facts, and legal work
  product must not be used for model training by Mercy.
- **Premium records**: Administrative-record indexing, source-linked audit
  trails, matter sync, billing reports, and official source verification require
  premium gating and stronger production controls before external use.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new product planner can read this spec and identify Mercy's
  target market, product surfaces, top product priorities, legal safeguards,
  commercial tiers, and production gates in under 20 minutes.
- **SC-002**: A D.C. small-firm attorney can create a matter, enter intake facts,
  request research or drafting help, and receive attorney-review-required output
  in one coherent workflow.
- **SC-003**: At least 90% of supported MVP user requests return a visible route
  mode, confidence level, required inputs or missing inputs, fallback behavior,
  and guardrail status.
- **SC-004**: 100% of legal research and drafting outputs include source anchors,
  supplied-source references, or explicit verification placeholders before
  attorney use.
- **SC-005**: 100% of workflows that touch client data state whether data handling
  is local/non-persistent, local processing artifact, production-persistent, or
  blocked until safeguards are defined.
- **SC-006**: A reviewer can classify every major capability as entry/free, paid,
  premium, production-gated, or future expansion with no more than one unresolved
  ambiguity.
- **SC-007**: A D.C. attorney reviewing the product scope can identify at least
  five concrete D.C.-specific benefits Mercy provides over a generic AI assistant.
- **SC-008**: A release reviewer can determine whether Mercy is local/demo-only or
  production-ready without consulting old blueprint files.
- **SC-009**: A product reviewer can identify the next 3-5 product-development
  tasks from the active task list and board without treating parked
  documentation cleanup as the critical path.
- **SC-010**: 100% of billing-report or saved-time outputs include attorney
  supervision, fee reasonableness, and engagement-term caution.
- **SC-011**: 100% of Word drafting outputs preserve human-review and guardrail
  status whether inserted into Word or delivered through copy fallback.
- **SC-012**: At least 90% of future feature plans can reference this spec for
  scope, safety, data-handling, tiering, routing, or workflow decisions without
  reopening the legacy documentation corpus.

## Assumptions

- The primary target users are D.C. solo attorneys, boutique firms, and small
  legal teams handling appellate, administrative, regulatory, contract, or
  discovery-heavy work.
- Mercy's near-term commercial wedge is D.C.-specific specialization rather than
  broad, general-purpose legal AI.
- The active product should build matter-centered intake, legal task routing,
  D.C. research, attorney-ready drafting, and compliance signals before deeper
  documentation cleanup.
- The current product remains local/demo-oriented until authentication, tenant
  isolation, encrypted persistence, official citation/source verification, HTTPS
  Word add-in hosting, payment enforcement, and audit controls are completed.
- The "One Brain, Two Windows" architecture remains the governing product model:
  a shared intelligence core powers a standalone heavy-work workspace and Word
  drafting sidekick.
- The product may also include a public marketing, pricing, sign-up, and
  dashboard experience, but legal intelligence must remain consistent with the
  shared core.
- Local zero-retention behavior is preferred until a deliberate storage feature
  is specified and approved.
- Premium value is concentrated in multi-document administrative record indexing,
  official-source verification, audit trails, matter sync, billing reports, and
  firm-scale controls.
- Source citations and legal-rule references must be verified against
  authoritative sources before they are treated as final legal work product.
- Foundational inventory files remain useful references, but incomplete
  documentation-heavy tasks are lower-priority backlog items unless they directly
  unblock product delivery, legal safety, privacy, source-of-truth integrity,
  build verification, or release readiness.
