# Contract: Shared Intelligence Core API

This contract documents the current public behavior of the local Shared
Intelligence Core plus modernization expectations for future contracts.

## Common Response Rule

All JSON responses under `/v1/*` are processed by D.C. guardrail middleware.
Responses may include:

```json
{
  "dc_guardrails": {
    "schema": {},
    "rule_28": {},
    "rule_32": {},
    "ethics_388": {},
    "status": "pass",
    "review_flags": []
  },
  "human_review_required": true
}
```

Legal output consumers must treat `review_required` as an attorney-review state,
not as an application crash.

## GET /health

**Purpose**: Confirm local core availability.

**Response**:

```json
{
  "status": "ok",
  "product": "Mercy",
  "clerk_os_version": "dc-clerk-os-1.0"
}
```

## GET /v1/product/capabilities

**Purpose**: Return product positioning, windows, tiers, and local security
posture.

**Response fields**:
- `product`
- `core`
- `positioning`
- `windows`
- `tiers.free`
- `tiers.premium`
- `security_posture.mode`
- `security_posture.storage`
- `security_posture.training_use`

## POST /v1/matters

**Purpose**: Create local in-memory matter context.

**Request**:

```json
{
  "name": "EPA v. Smith",
  "tier": "premium"
}
```

**Rules**:
- `tier` accepts `free` or `premium`; invalid values fall back to `free`.
- Matter state is currently in-memory.

**Response fields**:
- `matter_id`
- `name`
- `tier`
- `created_at`
- `facts`
- `drafts`
- `billing_events`

## GET /v1/matters

**Purpose**: List active in-memory matters.

**Response**: Array of matter objects.

## GET /v1/matters/{matter_id}

**Purpose**: Return one matter.

**Errors**:
- `404` when matter is not found.

## GET /v1/matters/{matter_id}/billing-report

**Purpose**: Build a premium-style billing report from matter billing events.

**Response fields**:
- `matter_id`
- `matter_name`
- `generated_at`
- `line_items`
- `total_estimated_minutes_saved`
- `ethics_note`

**Rules**:
- Must include fee reasonableness and attorney supervision warnings.

## GET /v1/workspace/clerk-os

**Purpose**: Inspect the D.C. Clerk OS prompt and review requirement.

**Response fields**:
- `clerk_os_version`
- `system_prompt`
- `human_review_required`

## POST /v1/workspace/discovery

**Purpose**: Run discovery against a file path and optional supplemental text.

**Request**:

```json
{
  "document_path": "legal_discovery_ai/data/sample.pdf",
  "document_text": "Optional supplemental context",
  "matter_id": "optional-matter-id"
}
```

**Response fields**:
- `workspace`
- `engine`
- `document_path`
- `facts`
- `premium_billing_hook`
- `matter_id` when supplied

**Rules**:
- If `matter_id` exists, attach facts and billing event to the matter.
- Processing errors return `500` with user-visible detail.

## POST /v1/workspace/discovery/upload

**Purpose**: Upload a PDF and run discovery.

**Request**: Multipart form data:
- `file`: PDF file
- `document_text`: optional supplemental text
- `matter_id`: optional matter id

**Rules**:
- Non-PDF uploads return `400`.
- Uploaded files are written to local processing storage.
- This is not approved production document-vault behavior.

## POST /v1/workspace/draft

**Purpose**: Generate Word-ready legal drafting from supplied facts.

**Request**:

```json
{
  "facts": {
    "case_summary": "Agency denied petition."
  },
  "draft_type": "statement_of_case",
  "target_court": "U.S. Court of Appeals for the D.C. Circuit",
  "requested_relief": "grant the petition",
  "matter_id": "optional-matter-id"
}
```

**Response fields**:
- `workspace`
- `engine`
- `clerk_os_version`
- `target_court`
- `draft_type`
- `draft`
- `human_review_required`
- `premium_billing_hook`
- `matter_id` when supplied
- `dc_guardrails`

**Rules**:
- Missing LLM credentials should produce fallback draft text with verification
  placeholders.
- If `matter_id` exists, attach draft and billing event to the matter.

## Modernization Contract Requirements

Future API contracts must add:
- Stable schema versions.
- Typed error bodies.
- Source-anchor arrays on discovery and drafting output.
- Job resources for long-running record indexing.
- Authenticated tenant context for production.
- Explicit entitlement information for premium workflows.

