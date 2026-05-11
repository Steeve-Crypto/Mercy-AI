# Contract: Mercy CLI

The local CLI is a thin client for the Shared Intelligence Core.

## Global Options

- `--api-url`: Overrides the core URL. Default: `http://127.0.0.1:8000`.
- `--output`: `table` or `json`. JSON output must remain machine-readable.

## Commands

### `health`

Calls `GET /health`.

**Expected output**: Service status, product name, and Clerk OS version.

### `capabilities`

Calls `GET /v1/product/capabilities`.

**Expected output**: Product positioning, windows, tier capabilities, and
security posture.

### `matters`

Calls `GET /v1/matters`.

**Expected output**: Active in-memory matters.

### `create-matter <name> --tier <free|premium>`

Calls `POST /v1/matters`.

**Expected output**: Created matter object.

### `draft --facts-json <json> [--draft-type <type>] [--requested-relief <text>] [--matter-id <id>]`

Calls `POST /v1/workspace/draft`.

**Rules**:
- Invalid JSON must fail locally with a clear message.
- Draft output must preserve `human_review_required` and guardrail metadata.

### `billing-report <matter_id>`

Calls `GET /v1/matters/{matter_id}/billing-report`.

**Expected output**: Matter billing report with ethics note.

## Modernization Contract Requirements

- Add CLI coverage for discovery and upload workflows when safe local file
  semantics are defined.
- Preserve JSON output for automation.
- Keep errors explicit and suitable for local debugging.

