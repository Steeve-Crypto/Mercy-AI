# Data Model: Mercy Source-of-Truth Architecture

## Attorney User

**Purpose**: Represents the legal professional or firm user operating Mercy.

**Fields**:
- `user_id`: Stable identity once authentication is introduced.
- `display_name`: User-facing name.
- `firm_id`: Tenant or firm boundary once multi-user production mode exists.
- `role`: Solo attorney, supervising attorney, staff, admin, or future role.
- `plan`: Entry, solo, small-firm, practice, or premium project entitlement.

**Validation Rules**:
- Production users must belong to exactly one tenant boundary for client-data
  workflows.
- Roles must not bypass attorney review requirements.

## Matter

**Purpose**: Legal workstream tying facts, drafts, documents, billing, and review
state together.

**Current Fields**:
- `matter_id`
- `name`
- `tier`
- `created_at`
- `facts`
- `drafts`
- `billing_events`

**Future Fields**:
- `tenant_id`
- `retention_policy`
- `deleted_at`
- `source_anchor_index`
- `audit_trail_id`

**Relationships**:
- Has many Documents.
- Has many Extracted Fact sets.
- Has many Draft Outputs.
- Has many Billing Events.
- Has one or more Guardrail Results through outputs.

**State Transitions**:
- `created` -> `facts_attached` -> `drafting` -> `review_required`
- `review_required` -> `attorney_approved` or `revision_needed`
- `active` -> `archived` -> `deleted` once persistence exists

## Document

**Purpose**: Legal source material uploaded, referenced, parsed, or drafted.

**Fields**:
- `document_id`
- `matter_id`
- `filename`
- `document_type`
- `source_path_or_uri`
- `uploaded_at`
- `processing_status`
- `quality_warnings`
- `retention_status`

**Relationships**:
- Belongs to a Matter.
- Produces Document Chunks and Extracted Facts.
- Can be referenced by Source Anchors.

**Validation Rules**:
- Current upload flow accepts PDFs for discovery upload.
- Production storage requires encryption, tenant isolation, retention, and
  deletion behavior.

## Document Chunk / Source Anchor

**Purpose**: Verifiable source support for extracted facts and legal outputs.

**Fields**:
- `anchor_id`
- `document_id`
- `page`
- `bates_or_record_reference`
- `text_span`
- `official_source_url`
- `verification_status`
- `verification_notes`

**Relationships**:
- Belongs to a Document.
- Supports Extracted Facts and Draft Output claims.

**Validation Rules**:
- Unverified anchors must remain marked as unverified.
- Official-source links must not be treated as confirmed until validated.

## Extracted Facts

**Purpose**: Structured output from document discovery and analysis.

**Fields**:
- `case_summary`
- `metadata`
- `entities`
- `exhibits`
- `timeline`
- `parties`
- `key_issues`
- `critical_risks`
- `missing_elements`
- `next_actions`
- `quality_warnings`
- `source_anchors`

**Relationships**:
- Belongs to a Matter when a matter is active.
- Derived from one or more Documents.
- Feeds Draft Outputs and Guardrail Results.

**Validation Rules**:
- Facts that lack source support should be marked for review.
- Structured facts must be serializable for API, CLI, and UI display.

## Draft Output

**Purpose**: Attorney-review-required legal text generated from facts or user
instructions.

**Fields**:
- `draft_id`
- `matter_id`
- `draft_type`
- `target_court`
- `requested_relief`
- `draft`
- `human_review_required`
- `source_anchors`
- `verification_placeholders`
- `created_at`

**Relationships**:
- Belongs to a Matter when a matter is active.
- Has one Guardrail Result.
- May create one Billing Event.

**Validation Rules**:
- `human_review_required` must be true for legal drafting.
- Missing authorities, record cites, and standards of review must be bracketed.

## Guardrail Result

**Purpose**: Advisory legal and ethics review metadata attached to API output.

**Fields**:
- `schema`
- `rule_28`
- `rule_32`
- `ethics_388`
- `status`
- `review_flags`

**Relationships**:
- Attached to legal API responses.
- References Draft Output or Extracted Facts.

**Validation Rules**:
- Status is `pass` or `review_required`.
- Full appellate brief output must satisfy or flag Rule 28 components.
- Ethics controls must preserve supervision and fee reasonableness notes.

## Billing Event

**Purpose**: Premium workflow event for saved-time estimates and fee review.

**Fields**:
- `task`
- `baseline_minutes`
- `estimated_ai_assisted_minutes`
- `estimated_minutes_saved`
- `billing_note`

**Relationships**:
- Belongs to a Matter.
- Appears in Billing Report.

**Validation Rules**:
- Must include attorney review and engagement-term caution.
- Must not imply automatic client billing approval.

## Billing Report

**Purpose**: Matter-level premium report summarizing AI-assisted work.

**Fields**:
- `matter_id`
- `matter_name`
- `generated_at`
- `line_items`
- `total_estimated_minutes_saved`
- `ethics_note`

**Validation Rules**:
- Must include fee reasonableness and supervision warning.
- Must be gated as premium behavior when product entitlement is enforced.

## Product Plan / Tier

**Purpose**: Defines entitlement and product packaging.

**Fields**:
- `plan_id`
- `name`
- `price_or_pricing_mode`
- `included_capabilities`
- `premium_capabilities`
- `limits`

**Validation Rules**:
- Multi-document administrative record indexing, audit trails, citation
  verification, matter sync, and billing reports are premium or higher-value
  workflows.

## Audit Trail

**Purpose**: Reviewable record of AI assistance without over-retaining client data.

**Fields**:
- `audit_id`
- `matter_id`
- `event_type`
- `timestamp`
- `source_anchor_ids`
- `verification_status`
- `attorney_action`
- `retention_status`

**Validation Rules**:
- Must preserve supervision evidence without unnecessary client-document storage.
- Requires retention and deletion policy before production persistence.

