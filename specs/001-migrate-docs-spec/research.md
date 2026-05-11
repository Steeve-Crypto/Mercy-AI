# Research: Mercy Architecture and Modernization Plan

## Decision: Treat `main.py` as the current Shared Intelligence Core

**Rationale**: The active local product routes, static dashboard hosting, Word
taskpane hosting, matter context, discovery, drafting, and billing report flows all
run through the root FastAPI app. The constitution also names the Shared
Intelligence Core as authoritative.

**Alternatives considered**:
- Make `mercy-legal-web` the core application: rejected because it currently holds
  product/dashboard UI and checkout behavior, not legal discovery/drafting logic.
- Make `legal_discovery_ai` the core: rejected because it is a discovery engine
  package, not the cross-surface product API.

## Decision: Preserve zero-retention local matter state until storage is designed

**Rationale**: `mercy_context.py` intentionally uses in-memory state and the
constitution requires local zero-retention unless persistence is explicitly
specified. This avoids creating accidental client-data retention while the product
is local/demo-oriented.

**Alternatives considered**:
- Add a database immediately: rejected because authentication, tenant isolation,
  encryption, retention, deletion, and audit boundaries are not specified yet.
- Store all matter state in local files: rejected because it would weaken the
  zero-retention posture and create unclear client-data handling.

## Decision: Document uploads as processing artifacts, not durable matter storage

**Rationale**: Uploaded PDFs are currently written to
`legal_discovery_ai/data/uploads` so the discovery crew can process them. This is
not the same as an approved production document vault.

**Alternatives considered**:
- Treat upload directory as a vault: rejected because there is no tenant boundary,
  retention policy, encryption guarantee, or deletion workflow.
- Remove uploads from the plan: rejected because the current dashboard and API
  expose upload-based discovery.

## Decision: Keep D.C. guardrails advisory but mandatory on legal API output

**Rationale**: `DCGuardrailMiddleware` already attaches `dc_guardrails` to `/v1/*`
JSON responses and sets `human_review_required`. The current behavior flags
`review_required` instead of blocking, which matches attorney-supervised workflow.

**Alternatives considered**:
- Hard-block any output with guardrail failures: rejected for current local/demo
  product because attorneys need to inspect and revise imperfect work product.
- Remove guardrails from non-drafting endpoints: rejected because matter,
  discovery, and billing responses can still carry legal/supervision context.

## Decision: Separate source anchoring from true citation verification

**Rationale**: Current outputs include facts and placeholders but do not yet verify
authorities against official sources. Planning must distinguish "has a placeholder
or citation-looking text" from "verified against an authoritative source."

**Alternatives considered**:
- Consider current regex checks as citation verification: rejected because regex
  patterns cannot prove a case, quote, or record cite is valid.
- Delay all source work until production: rejected because source anchors are
  foundational for safe premium workflows.

## Decision: Use a tracked async job model for future administrative records

**Rationale**: Multi-document administrative records, indexing, RAG, and official
source verification can exceed normal request/response UX. A job model gives users
progress, retry, and completion states without blocking Word drafting.

**Alternatives considered**:
- Keep long work synchronous: rejected because it will create timeouts and poor UX.
- Push all processing into the Word add-in: rejected because the standalone
  platform is the heavy-lifting window by design.

## Decision: Treat `word_plugin/` and `mercy-legal-plugin/` as separate maturity levels

**Rationale**: `word_plugin/` is a lightweight local scaffold served by FastAPI.
`mercy-legal-plugin/` is the production-oriented React/Vite add-in with Office
tooling, manifest validation, and official deployment documentation.

**Alternatives considered**:
- Delete one add-in now: rejected because this planning feature should not remove
  working scaffolds.
- Merge immediately: rejected until shared contracts and core integration paths are
  defined.

## Decision: Prioritize contract tests before broad refactors

**Rationale**: Multiple surfaces depend on the core API shape. Contract artifacts
and tests reduce the risk of breaking dashboard, Word, and CLI workflows when the
core is modernized.

**Alternatives considered**:
- Refactor first, document later: rejected because current product docs were
  scattered and the user requested source-of-truth planning first.
- Test only UI snapshots: rejected because legal safety depends on response data,
  guardrails, and source metadata, not just rendering.

