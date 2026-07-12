# Feature Specification: Legal AI Integration Specifications

**Feature Branch**: `002-legal-ai-integration`  
**Created**: 2026-05-12  
**Status**: Draft  
**Input**: User description: "Create detailed, ready-to-implement specifications for: 1. MoE Legal Task Router (Cursor.ai style) + router pseudocode; 2. DC Knowledge Base Sources & Hybrid Graph+Agentic RAG Plan; 3. RAGAS Eval Pipeline + Initial DC Golden Dataset Template; 4. LangSmith Project Config + Observability Dashboard; 5. Client Intake Flow + Prompts; 6. Detailed Office Add-in Spec. Focus on brownfield integration with existing Standalone Platform and Word Add-in."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Route Legal Work Consistently (Priority: P1)

As a D.C. attorney using Mercy from the Standalone Platform or Word add-in, I want each request routed to the right legal task capability so intake, research, review, drafting, compliance, and billing workflows behave consistently across surfaces.

**Why this priority**: Routing is the shared decision layer that prevents the dashboard, add-in, and local tools from inventing separate legal behavior.

**Independent Test**: Submit representative prompts from both product surfaces and verify that each response exposes route mode, confidence, missing inputs, selected capability, safety profile, and fallback behavior.

**Acceptance Scenarios**:

1. **Given** a user asks "draft a D.C. Circuit statement of the case from these facts", **When** Mercy routes the request, **Then** the route is drafting/appellate, D.C. appellate guardrails are required, and missing record or citation support is identified.
2. **Given** a user selects a contract clause in Word and asks "is this enforceable in D.C.?", **When** Mercy routes the request, **Then** the route is clause explanation or contract review, selected text is treated as the primary document context, and source verification remains required.
3. **Given** route confidence is below the safe threshold, **When** Mercy responds, **Then** it asks for the minimum clarifying input or uses a bounded general matter route without final legal conclusions.

---

### User Story 2 - Research D.C. Law With Grounded Sources (Priority: P1)

As a D.C. attorney, I want Mercy to retrieve official and curated D.C. legal knowledge with visible source grounding so I can verify authorities before relying on an answer or draft.

**Why this priority**: D.C.-specific source grounding is Mercy's core product wedge and the main safeguard against unsupported legal output.

**Independent Test**: Ask D.C.-focused legal questions and verify that answers return source anchors, candidate authorities, verification status, unsupported-source warnings, and attorney-review requirements.

**Acceptance Scenarios**:

1. **Given** an attorney asks a D.C. landlord-tenant, contract, appellate, or administrative-law question, **When** Mercy answers, **Then** the response includes source-grounded propositions and marks any unverified support.
2. **Given** a document or matter fact conflicts with retrieved authority, **When** Mercy prepares an evidence pack, **Then** the conflict is flagged for attorney review instead of hidden.
3. **Given** no reliable source is available, **When** Mercy responds, **Then** it provides a limited answer, requests additional source material, or marks the proposition as not verified.

---

### User Story 3 - Evaluate RAG Quality With a D.C. Golden Dataset (Priority: P1)

As the product owner, I want a repeatable evaluation pipeline and initial golden dataset template so Mercy's D.C. research and drafting quality can be measured before product release.

**Why this priority**: Legal AI quality must be regression-tested with legal-domain examples, not judged only by demos.

**Independent Test**: Run a small evaluation set and verify that each test case records expected sources, expected route, answer quality, citation grounding, missing-input handling, and attorney-review behavior.

**Acceptance Scenarios**:

1. **Given** a golden test case with expected D.C. source support, **When** Mercy answers, **Then** the evaluation records whether the answer is faithful to the supplied or retrieved sources.
2. **Given** a test case intentionally lacks required facts, **When** Mercy answers, **Then** the evaluation rewards missing-input detection over unsupported completion.
3. **Given** a regression reduces citation grounding or route accuracy, **When** evaluation results are reviewed, **Then** the failing cases are identifiable by workflow, matter type, source set, and prompt version.

---

### User Story 4 - Observe Cross-Surface Legal AI Behavior (Priority: P2)

As the founder or supervising attorney, I want a project-level observability dashboard so I can see request volume, route accuracy, latency, fallback usage, source grounding, guardrail status, and evaluation trends across Mercy surfaces.

**Why this priority**: Observability is required to harden the brownfield system and prove whether the shared core is being used safely.

**Independent Test**: Complete requests from the dashboard and Word add-in and verify that traces are grouped by project, surface, route, matter, prompt version, guardrail result, and evaluation status without exposing unnecessary client data.

**Acceptance Scenarios**:

1. **Given** a Word add-in drafting request, **When** it completes, **Then** the trace identifies the surface, route, selected capability, fallback state, safety profile, and output verification status.
2. **Given** a Standalone Platform research request, **When** it completes, **Then** the trace includes source retrieval and answer-generation steps with source identifiers but minimizes client-sensitive payloads.
3. **Given** repeated low-confidence routing or fallback events occur, **When** the dashboard is reviewed, **Then** those events are visible as operational issues.

---

### User Story 5 - Capture Client Intake for Matter-Aware Work (Priority: P1)

As a D.C. small-firm attorney or staff member, I want a guided intake flow that captures the minimum matter facts, documents, parties, deadlines, requested relief, and sensitivity flags so Mercy can safely research, review, and draft from matter context.

**Why this priority**: Matter-aware legal work depends on structured intake and missing-input detection.

**Independent Test**: Open a new matter, complete the intake flow, and verify that later research, review, and drafting requests reuse the captured context and clearly identify missing facts.

**Acceptance Scenarios**:

1. **Given** a user opens a matter, **When** they complete intake prompts, **Then** Mercy stores structured matter context and missing-input status for that matter.
2. **Given** the user omits jurisdiction, deadlines, posture, parties, document type, requested relief, or sensitivity flags, **When** intake is submitted, **Then** Mercy marks the specific missing fields.
3. **Given** the matter contains privileged, confidential, or personally sensitive information, **When** intake is saved, **Then** confidentiality and attorney-review warnings are visible.

---

### User Story 6 - Use Mercy Inside Microsoft Word (Priority: P2)

As an attorney drafting in Word, I want the Mercy add-in to analyze selected text, answer matter-aware questions, draft revisions, insert clauses, and generate risk reports while preserving the same route, source, and guardrail metadata used by the Standalone Platform.

**Why this priority**: Word is the attorney's drafting workspace, and the existing production-oriented add-in needs to consume the shared core instead of diverging.

**Independent Test**: Use the add-in against selected text and full document text, then verify that output can be inserted or copied and includes core metadata, guardrail state, source status, and fallback messaging.

**Acceptance Scenarios**:

1. **Given** selected Word text and an instruction, **When** the user requests an explanation or revision, **Then** Mercy uses the selected text as the primary context and returns attorney-review-required output.
2. **Given** the user requests insertion, **When** Word insertion is available, **Then** Mercy inserts the approved text and records the action; otherwise it provides copyable output with the same metadata.
3. **Given** the shared core is unavailable, **When** the add-in handles the request, **Then** preview fallback is clearly labeled and legal output remains bounded.

### User Story 7 - Triage and Draft Inside Microsoft Outlook (Priority: P1)

As a D.C. attorney managing client correspondence, I want Mercy to summarize and triage permitted email context, draft a matter-aware reply, and capture approved correspondence to a matter without sending or changing anything unless I explicitly approve it.

**Why this priority**: Email is a core legal-work surface and the beta objective treats Outlook as equal to the web application and Word add-in.

**Independent Test**: Open the add-in in both message-read and compose/reply modes, then verify context capture, summary/triage, reply preview, reliability metadata, explicit draft-write approval, selected-matter capture, and the absence of any send capability.

**Acceptance Scenarios**:

1. **Given** an attorney opens a received message, **When** Mercy summarizes or triages it, **Then** Mercy uses only the message/thread context Outlook exposes, reports material facts, deadlines, requests, obligations, risks, and follow-up items, and does not modify the item.
2. **Given** Mercy prepares a reply, **When** the attorney is reading a received message, **Then** the result remains copyable preview output and draft modification is unavailable.
3. **Given** Mercy prepares a reply in a compose or reply window, **When** the attorney approves `Write to draft`, **Then** only the open draft changes; Mercy never sends the message.
4. **Given** a tenant-scoped matter is selected, **When** the attorney approves correspondence capture, **Then** the permitted email context and selected Mercy output are added only to that matter history.

### Edge Cases

- The request has no matter, no selected text, and no document context: Mercy routes to intake or asks for the minimum context needed.
- The request is outside D.C. scope: Mercy labels the scope issue and avoids presenting D.C.-specific authority as controlling.
- The router identifies multiple plausible routes: Mercy returns the top route, alternates, confidence, and the clarifying question needed to disambiguate.
- The source set is stale, unofficial, or missing: Mercy marks authority as unverified and requires attorney review.
- The document is oversized, scanned poorly, or not legal material: Mercy returns quality warnings and safe next actions.
- The evaluation dataset contains privileged real-client data: Mercy rejects it unless anonymized or explicitly approved for the evaluation environment.
- Observability traces include sensitive matter text: Mercy redacts or summarizes payloads and preserves only required metadata.
- Word APIs are unavailable or insertion fails: Mercy provides copy fallback and does not drop guardrail metadata.
- Outlook exposes read-only context or denies compose access: Mercy keeps output copyable, disables draft writing, and never attempts a send or irreversible mailbox action.
- Premium-only workflows are requested from an ungated context: Mercy identifies the gating status and avoids performing restricted work.

## Requirements *(mandatory)*

### Functional Requirements

#### 1. MoE Legal Task Router (Cursor.ai Style) + Router Pseudocode

- **FR-001**: Mercy MUST provide one shared legal task routing contract used by the Standalone Platform, Word add-in, local dashboard, lightweight taskpane, and command-line workflows.
- **FR-002**: The router MUST classify requests into at least these route modes: intake, D.C. legal research, document review, discovery review, contract review, clause explanation, drafting, billing report, compliance check, source verification, and general matter assistance.
- **FR-003**: The router MUST return route mode, confidence, alternate routes, selected capability, missing inputs, safety profile, source requirements, fallback path, surface context, premium gate, and user-facing next action.
- **FR-004**: The router MUST prefer existing brownfield capabilities before proposing new ones, including current matter endpoints, discovery processing, drafting, guardrail checks, Word add-in document actions, and dashboard matter workflows.
- **FR-005**: The router MUST treat low confidence, missing jurisdiction, missing facts, missing selected text, missing document source, or missing requested relief as reasons to ask a targeted clarification or route to intake.
- **FR-006**: The router MUST expose a safe fallback route when the live model, source index, document processor, or Word API is unavailable.
- **FR-007**: Router decisions MUST be visible in user-facing developer/review surfaces and machine-readable for observability and evaluation.

Router decision pseudocode:

```text
function route_legal_task(request):
  context = collect(
    prompt=request.prompt,
    surface=request.surface,
    matter=request.matter_context,
    selected_text=request.selected_text,
    document_text=request.document_text,
    files=request.files,
    user_plan=request.plan,
    prior_route=request.prior_route
  )

  signals = detect_signals(context)
  missing = detect_missing_inputs(signals, context)

  candidates = score_routes([
    intake,
    dc_research,
    document_review,
    discovery_review,
    contract_review,
    clause_explanation,
    drafting,
    billing_report,
    compliance_check,
    source_verification,
    general_matter_assistance
  ], signals, context)

  top = highest_confidence(candidates)
  safety_profile = choose_guardrails(top, signals, context)
  source_requirements = choose_source_requirements(top, signals)
  premium_gate = choose_entitlement(top, context.user_plan)

  if premium_gate.blocks_execution:
    return route_envelope(top, confidence=top.score, missing=missing,
      next_action="upgrade_or_use_limited_workflow", execute=false)

  if top.score < safe_confidence_threshold or missing.required:
    clarification = minimum_question(top, missing, candidates)
    return route_envelope(top, confidence=top.score, alternates=candidates[1:3],
      missing=missing, next_action=clarification, execute=false)

  capability = select_existing_capability(top, context)
  fallback = select_fallback(top, capability, context)

  return route_envelope(top, confidence=top.score, alternates=candidates[1:3],
    selected_capability=capability, guardrails=safety_profile,
    source_requirements=source_requirements, fallback_path=fallback,
    execute=true)
```

#### 2. DC Knowledge Base Sources & Hybrid Graph+Agentic RAG Plan

- **FR-008**: Mercy MUST maintain a D.C. source registry with source type, authority level, update cadence, coverage notes, citation format, license/access status, and verification status.
- **FR-009**: The initial D.C. knowledge base SHOULD prioritize official or high-authority sources: D.C. Code, D.C. Municipal Regulations, D.C. Register, D.C. Court of Appeals opinions, Superior Court rules and public guidance, D.C. Circuit rules and opinions where relevant, D.C. Bar ethics opinions, Office of Administrative Hearings materials, Mayor's Orders, agency guidance, and user-provided matter records.
- **FR-010**: Mercy MUST distinguish official sources, curated secondary references, user-provided matter documents, generated summaries, and unverified placeholders.
- **FR-011**: Hybrid retrieval MUST support keyword, semantic, metadata-filtered, graph-neighbor, matter-record, and agent-planned retrieval paths.
- **FR-012**: Graph relationships MUST capture legal entities useful to D.C. work, including authority, court, agency, statute, regulation, rule, ethics opinion, case, party, issue, remedy, deadline, document, record citation, clause, and risk.
- **FR-013**: Agentic retrieval MUST create an evidence plan before final answering for high-risk workflows, including issue framing, source targets, search steps, retrieved anchors, contradictions, gaps, and final verification status.
- **FR-014**: Every research or drafting answer MUST include an evidence pack or explicit statement that no adequate sources were found.
- **FR-015**: Matter documents MUST be retrievable only within the authorized matter context and must not be blended into global legal knowledge without explicit approval.

Hybrid RAG readiness plan:

```text
1. Register source collections with authority level and refresh cadence.
2. Normalize documents into source records with title, jurisdiction, date, source URL or file anchor, and citation guidance.
3. Create chunks with page/section/span anchors and preserve source hierarchy.
4. Extract graph entities and relationships for D.C. legal concepts, authorities, parties, and matter records.
5. For each request, route first; then choose retrieval strategy by route and risk.
6. Build an evidence pack with retrieved anchors, authority ranking, conflicts, gaps, and verification status.
7. Generate answer or draft only from matter facts, retrieved evidence, or marked placeholders.
8. Log route, retrieval plan, evidence quality, guardrail status, and user-facing warnings.
```

#### 3. RAGAS Eval Pipeline + Initial DC Golden Dataset Template

- **FR-016**: Mercy MUST maintain a repeatable RAG evaluation pipeline for route accuracy, context relevance, faithfulness, answer relevance, citation grounding, missing-input behavior, and safety warning coverage.
- **FR-017**: The evaluation pipeline MUST support a golden dataset of D.C. legal workflows spanning intake, research, document review, contract review, clause explanation, drafting, source verification, and compliance warnings.
- **FR-018**: Each golden case MUST include the expected route, prompt, matter context, allowed source set, expected source anchors, expected answer traits, prohibited unsupported claims, and scoring notes.
- **FR-019**: The evaluation pipeline MUST mark a case as failing when Mercy invents legal authority, treats unverified support as verified, ignores required missing inputs, omits attorney review, or routes to an unsafe capability.
- **FR-020**: Evaluation results MUST be comparable over time by dataset version, prompt version, route version, source snapshot, and product surface.

Initial D.C. golden dataset template:

```csv
case_id,workflow,priority,surface,prompt,matter_context,selected_text,document_summary,expected_route,expected_missing_inputs,allowed_sources,expected_source_anchors,expected_answer_traits,prohibited_claims,guardrails_required,scoring_notes
DC-INTAKE-001,intake,P1,standalone,"Open a D.C. tenant matter for unpaid repairs and rent escrow.",client has apartment issue,"","",intake,"lease, deadlines, landlord, relief sought, documents","user intake only","","asks targeted intake questions; flags confidentiality","final legal conclusion before facts","confidentiality; human review","Reward missing-input detection."
DC-RESEARCH-001,dc_research,P1,standalone,"What are the D.C. requirements for a valid contract modification?","","","",dc_research,"facts, contract text if applying law","D.C. Code; D.C. cases; D.C. Bar guidance if relevant","official or candidate authority anchors","short answer; authority candidates; verification status","invented case names or quotes","citation verification; human review","Faithfulness and source grounding are primary."
DC-WORD-001,clause_explanation,P1,word_addin,"Explain this indemnity clause under D.C. law.","commercial services agreement","Client indemnifies provider for all claims regardless of fault.","",clause_explanation,"party roles, contract type if absent","D.C. cases; contract source text","selected text span plus authority anchors","plain explanation; risk notes; suggested narrower language","claim that clause is enforceable without review","human review; source verification","Selected text must drive answer."
DC-DRAFT-001,drafting,P1,standalone,"Draft a statement of facts for a D.C. Circuit brief from these facts.","administrative appeal facts supplied","","agency denial timeline",drafting,"record citations, standard of review, procedural posture","matter record; D.C. Circuit rules","record placeholder anchors","Word-ready draft; [VERIFY CITE]; record placeholders","fabricated record citations","Rule 28; Rule 32; human review","Placeholders are correct when support is missing."
```

#### 4. LangSmith Project Config + Observability Dashboard

- **FR-021**: Mercy MUST group traces under separate environments for local development, staging, production-candidate, and production-hardened operation.
- **FR-022**: Trace metadata MUST include project, environment, surface, route mode, route confidence, matter identifier or redacted surrogate, selected capability, prompt version, source snapshot, guardrail status, fallback status, premium gate, and evaluation case identifier when applicable.
- **FR-023**: Observability MUST avoid storing unnecessary client text; where full text is not required for debugging or evaluation, traces MUST store redacted summaries, hashes, source identifiers, or structured metadata.
- **FR-024**: The dashboard MUST show request volume, route distribution, route confidence, fallback rate, missing-input rate, source-grounding status, guardrail failures, evaluation scores, latency bands, error categories, and surface adoption.
- **FR-025**: Observability MUST allow reviewers to drill from a failing evaluation or production warning into the route decision, retrieval plan, evidence pack, model interaction, and final guardrail status.

Project configuration target:

```text
Project names:
- mercy-local-core
- mercy-staging-core
- mercy-production-candidate

Required trace tags:
- surface: standalone_platform | mercy_legal_web | mercy_legal_plugin | word_plugin | cli
- route_mode: intake | dc_research | document_review | discovery_review | contract_review | clause_explanation | drafting | billing_report | compliance_check | source_verification | general
- safety_profile: dc_general | dc_appellate | dc_contract | dc_discovery | billing | intake
- fallback: none | preview | source_missing | model_unavailable | word_api_unavailable | gated
- data_posture: local_nonpersistent | local_processing_artifact | production_persistent | redacted_trace
```

#### 5. Client Intake Flow + Prompts

- **FR-026**: Mercy MUST provide a structured matter intake flow before high-risk research, review, drafting, or billing workflows when required context is missing.
- **FR-027**: Intake MUST capture matter name, client role, opposing parties, jurisdiction, venue, procedural posture, deadlines, requested relief, facts, documents, document types, sensitivity flags, user goal, and missing information.
- **FR-028**: Intake MUST support fast-start mode for minimal context and expanded mode for litigation, administrative appeal, contract, landlord-tenant, employment, business, and discovery-heavy matters.
- **FR-029**: Intake prompts MUST be attorney-friendly, concise, and capable of producing a structured intake summary, missing-input checklist, risk flags, and recommended next workflow.
- **FR-030**: Intake MUST preserve confidentiality, privilege, conflicts, PII, and attorney-supervision reminders without blocking low-risk local drafting unless required fields are absent.
- **FR-031**: Intake results MUST be reusable by router, RAG, drafting, Word add-in chat, document review, billing reports, and observability metadata.

Intake prompt set:

```text
Matter opener:
"Briefly describe the D.C. matter, your client role, the opposing party, and what you need Mercy to help with first."

Required context prompt:
"What is the jurisdiction or forum, current procedural posture, key deadlines, requested relief, and the documents you have available?"

Document prompt:
"List the documents Mercy should rely on. For each, provide type, date, source, page or record reference if known, and whether it is privileged or sensitive."

Missing-input prompt:
"Mercy is missing the following items before it can safely complete this workflow: {missing_items}. Provide them now, skip with attorney-review placeholders, or change the task."

Safety prompt:
"Confirm whether the matter includes confidential, privileged, sealed, minor, health, financial, immigration, criminal, or other sensitive information. Mercy will mark legal output for attorney review either way."

Workflow selection prompt:
"Choose the next task: D.C. research, document review, contract review, clause explanation, draft generation, source verification, billing report, or general matter planning."
```

#### 6. Detailed Office Add-in Spec

- **FR-032**: The production Word add-in MUST use the shared router and core response envelope for explain, review, revise, draft, clause, chat, and report actions.
- **FR-033**: The add-in MUST collect surface context, selected text, full document text when authorized, matter identifier, user instruction, insertion intent, and document metadata before routing.
- **FR-034**: The add-in MUST provide taskpane modes for Assistant Chat, Review Selected Text, Draft Revision, Clause Library, Risk Report, Matter Context, and Source/Guardrail Details.
- **FR-035**: The add-in MUST show route mode, confidence, source status, guardrail status, human-review requirement, fallback state, and missing-input requests in the taskpane.
- **FR-036**: The add-in MUST support insert-at-selection, replace-selection, append-to-document, generate-report, and copy-output actions with user confirmation for destructive edits.
- **FR-037**: The add-in MUST preserve preview fallback behavior for development and demos, but all fallback output MUST be visibly labeled as fallback and attorney-review-required.
- **FR-038**: The add-in MUST support matter selection or matter creation handoff so Word work product can be tied to the same context used by the Standalone Platform.
- **FR-039**: The add-in MUST display D.C. clause library entries with title, category, risk level, jurisdiction note, source status, and insertion action.
- **FR-040**: The add-in MUST handle Word API unavailability, empty selection, oversized document text, offline core, failed insertion, and missing entitlement with clear user recovery paths.
- **FR-041**: The production Outlook add-in MUST use the same shared router, auth/session, tenant/matter context, core response envelope, reliability UI, and redacted offline infrastructure as Word.
- **FR-042**: Outlook read workflows MUST support message/thread summarization and structured triage of material facts, deadlines, requests, obligations, risks, attachment gaps, and follow-up items using only permitted context.
- **FR-043**: Outlook drafting MUST produce a preview first. Read mode MUST remain non-modifying; compose/reply mode MAY write only to the open draft after explicit attorney approval.
- **FR-044**: Mercy MUST NOT expose programmatic email sending, `ItemSend`, `OnMessageSend`, or another irreversible mailbox action in the beta.
- **FR-045**: Approved Outlook correspondence capture MUST require a selected matter and preserve firm, tenant, user, source/provenance, and attorney-review metadata in matter history.
- **FR-046**: Outlook MUST handle missing permissions, unavailable body/selection context, read versus compose mode, offline core, timeout, malformed context, failed draft write, and retry/copy recovery with clear user-facing states.

Office add-in workflow contract:

```text
1. User selects text or opens taskpane action.
2. Add-in captures selected text, document summary, matter context, and instruction.
3. Add-in requests route inspection from shared core.
4. If missing inputs exist, add-in asks for the smallest missing item in the taskpane.
5. If execution is allowed, add-in calls the selected capability through the shared core.
6. Add-in renders answer, sources, guardrails, route metadata, and fallback status.
7. User chooses insert, replace, append, report, or copy.
8. Add-in records action metadata without unnecessary document retention.
```

### Key Entities *(include if feature involves data)*

- **Legal Task Route**: A decision envelope containing route mode, confidence, alternates, missing inputs, selected capability, source requirements, safety profile, fallback path, surface context, and premium gate.
- **Route Signal**: A detected feature of a request, such as selected text, document upload, D.C. jurisdiction, request for drafting, request for authority, contract language, discovery material, deadline, or billing intent.
- **D.C. Source Record**: A registered legal or matter source with authority level, jurisdiction, title, date, source type, citation guidance, access status, refresh cadence, and verification status.
- **Source Anchor**: A page, section, URL, record cite, Bates marker, text span, clause span, or placeholder linking an answer to support.
- **Evidence Pack**: The reviewable set of retrieved sources, graph relationships, conflicts, gaps, and verification notes used for a legal answer or draft.
- **Golden Dataset Case**: A test case containing prompt, context, expected route, allowed sources, expected answer traits, prohibited claims, required guardrails, and scoring notes.
- **Observability Trace**: A redacted or metadata-focused record of a request path, route decision, retrieval plan, selected capability, output status, safety status, and evaluation link.
- **Client Intake Record**: Structured matter-opening data covering parties, role, jurisdiction, posture, deadlines, relief, facts, documents, sensitivity, missing inputs, and next workflow.
- **Office Add-in Action**: A Word or Outlook user action such as explain, review, revise, draft, summarize, triage, copy, approved insert/replace/append/draft-write, or selected-matter capture, linked to route, source, approval, and guardrail metadata.

### Legal AI Safety & Data Handling *(mandatory for Mercy features)*

- **D.C. scope**: This feature serves D.C. legal workflows, including D.C. appellate, administrative, regulatory, contract, discovery, landlord-tenant, business, and small-firm matter work. Non-D.C. requests must be labeled outside the governed specialty or routed to general assistance with no controlling-law claims.
- **Attorney supervision**: Every research, review, drafting, clause, intake, evaluation, and Word add-in output must remain attorney-review-required. The product must surface citation verification, record verification, source status, and human review before use.
- **Source grounding**: Legal answers and drafts must rely on supplied matter facts, official or curated D.C. sources, user-provided records, selected Word text, or explicit verification placeholders. Unsupported authority, quotations, record citations, procedural facts, and legal conclusions must not be presented as final.
- **Data handling**: Brownfield local operation remains non-persistent by default except for explicitly identified local processing artifacts. Production storage, trace retention, source indexing of client data, and matter sync require authentication, tenant isolation, encryption, retention controls, deletion controls, and audit boundaries.
- **Guardrail impact**: The router, RAG plan, evaluations, observability, intake flow, and Office add-in must preserve D.C. Rule 28/32 checks where appellate drafting is implicated, D.C. Bar ethics warnings where legal work product or billing is implicated, and confidentiality/citation/record verification warnings across all legal workflows.
- **Evaluation data**: Golden datasets should use synthetic, public, anonymized, or explicitly approved examples. Real-client privileged facts must not be included in evaluation datasets or traces without a deliberate approved data-handling posture.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 95% of representative MVP requests across Standalone Platform and Word add-in receive a route envelope with mode, confidence, missing inputs, selected capability, fallback path, and guardrail profile.
- **SC-002**: At least 90% of golden dataset cases route to the expected primary workflow or a documented safe alternate workflow.
- **SC-003**: 100% of legal research, drafting, clause, and document-review outputs include source anchors, supplied-source references, or explicit verification placeholders.
- **SC-004**: 100% of low-confidence or missing-context cases ask a targeted clarification, route to intake, or produce bounded placeholder output instead of unsupported final legal advice.
- **SC-005**: The initial D.C. golden dataset template supports at least 25 test cases across intake, research, drafting, contract review, discovery review, clause explanation, source verification, and compliance workflows.
- **SC-006**: Evaluation reports identify failing cases by workflow, route, source set, prompt version, and failure reason in under 5 minutes of reviewer effort.
- **SC-007**: Observability dashboards show route distribution, fallback rate, guardrail status, source-grounding status, and evaluation trend for both Standalone Platform and Word add-in traffic.
- **SC-008**: Intake users can create a usable matter context for common D.C. small-firm workflows in under 5 minutes when they have basic facts and documents available.
- **SC-009**: 100% of Word add-in generated outputs preserve route, source, guardrail, fallback, and human-review metadata whether inserted, appended, copied, or reported.
- **SC-010**: 100% of traces and evaluation records that include client-sensitive content are either redacted, anonymized, explicitly approved for that environment, or rejected before storage.
- **SC-011**: 100% of Outlook-generated replies remain previews until attorney approval; no Mercy code path sends a message, and read-mode items cannot be modified.

## Assumptions

- The feature is one integrated specification package, not six separate Spec Kit features, because this command creates a single feature directory per invocation.
- The existing Shared Intelligence Core remains the system of record for routing, matter context, drafting, discovery, guardrails, and source metadata.
- `mercy-legal-web` is the production Standalone Platform candidate, while `standalone_platform` remains a local smoke-test surface.
- `mercy-legal-plugin` is the production Word and Outlook add-in candidate with one shared host-aware foundation, while `word_plugin` remains a lightweight local taskpane scaffold.
- RAGAS and LangSmith are user-requested product requirements for evaluation and observability; their project-specific wiring will be detailed in planning and tasks.
- D.C. source coverage starts with official, public, and user-provided sources before adding broader commercial or proprietary legal datasets.
- Source verification and citation finalization remain attorney-supervised until official verification workflows are production-hardened.
- Production launch remains blocked for client-data workflows until authentication, tenant isolation, persistence, retention, deletion, audit, and support obligations are specified and implemented.
