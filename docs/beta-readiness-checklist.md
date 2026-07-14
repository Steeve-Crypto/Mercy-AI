# Mercy Legal AI Beta Readiness Checklist

This checklist is the go/no-go gate before inviting real D.C. attorneys or small firms to use Mercy with client-related workflows.

Current posture: **not ready for external attorney beta until all Must Pass items are complete**.

## Current Implementation State - 2026-06-21

Mercy is a local/beta-candidate legal workspace with the FastAPI core, tenant-scoped matter/document APIs, Mercy chat, Research, Vault, History, templates, beta status, monitoring, and Office add-in surfaces substantially implemented. The product is not approved for real client-confidential external beta until the remaining blockers below are cleared.

Update - 2026-07-03:

- Local Windows e2e verification no longer depends on the broken roaming `npx` prefix. `mercy-legal-web/scripts/run-e2e-local.mjs` now invokes the workspace Playwright CLI through Node.
- Verified `npm.cmd run typecheck` in `mercy-legal-web`.
- Verified `npm.cmd run test:e2e:local -- tests/e2e/dashboard.spec.ts --project=chromium`; the authenticated dashboard smoke passes with the local dev auth harness.
- Direct `npm`/`npx` can still resolve to a broken roaming npm prefix on this workstation; use `npm.cmd` for local Windows verification until Node/npm is repaired outside the repo.

Update - 2026-07-11 (shared Office safety and Outlook workflow slice):

- The existing `mercy-legal-plugin/` bundle now detects Word versus Outlook and keeps shared auth, tenant/matter selection, core routing, reliability metadata, offline recovery, and visual primitives.
- Outlook exposes summary, legal-email triage, reply preview, source/ethics review, and explicit selected-matter capture using permitted message context and attachment metadata.
- Word replacements/appends and Outlook draft writes now have preview/approval UI. Ribbon fallbacks also require confirmation. There is no Outlook send API, `ItemSend`, or `OnMessageSend` handler.
- The Word and Outlook production manifests validated through Microsoft's manifest service; Office TypeScript, ESLint, production build, and `npm run smoke:office` passed.
- Live Word/Outlook sideload testing is still required. Static validation does not prove Office host APIs, enterprise SSO, or tenant persistence work in a real Microsoft 365 account.

Update - 2026-07-13 (approved Outlook matter-history persistence):

- `Save to matter` now previews the permitted capture and requires a separate approval before any write. State-changing capture is live-only: it is never cached, queued, or replayed after reconnect, and an offline or failed request is explicitly reported as not saved.
- Word `Update Matter` now follows the same live-only boundary: selected text is previewed and approved, stored as a dedicated `office_document_context_saved` history event, and never changes the Word document.
- Success is shown only when the core returns a passing `update_matter_context` skill result whose provenance confirms `office_correspondence_saved`.
- The core requires an existing selected matter and stores sanitized correspondence in a dedicated history event rather than generic key facts. The event records the distinct firm/account and tenant/workspace IDs, actor, approval method, Office/Outlook provenance, attorney-review posture, and that attachment bodies were not included.
- Automated checks cover in-memory readback, persistent SQLite reload, same-tenant API readback, cross-tenant 404/block behavior, unknown-matter no-create behavior, Office non-replay policy, Office lint/build/smoke, both manifest validations, and web typecheck.
- Live Outlook sideload and a real hosted database/account remain required before the Office release gate is complete.

Update - 2026-07-13 (production auth claim hardening):

- Web middleware, server sessions, browser sessions, the Core proxy, Stripe billing portal, and FastAPI now share a fail-closed Supabase authorization boundary. Tenant, firm, allowlisted roles, account type, subscription status, active state, and Stripe customer identity come only from server-owned `app_metadata`.
- User-editable `user_metadata` remains available for display fields but cannot create a workspace, select another tenant, reactivate a blocked account, add a platform role, or choose a Stripe customer. Self-service profile editing no longer submits role changes.
- Missing roles, malformed active flags, unknown account types, and firm accounts without a firm claim are denied. Post-auth redirects accept only internal paths, and preliminary API rate limits no longer trust a caller-supplied tenant header.
- Automated regressions cover metadata-only and conflicting-metadata attacks, inactive-account override attempts, trusted tenant/firm precedence, platform-admin denial, malformed claims, Stripe customer provenance, and safe redirects. Static assertions cover the production Core proxy wiring; hosted behavioral proxy verification remains part of PD047. The targeted Core/web auth suite and pure Playwright claim tests pass.
- Current paid signup and Microsoft-issued Mercy sessions already write canonical `app_metadata`. Before live beta, legacy users must be backfilled and forced to refresh/re-authenticate; live Stripe suspension/role-removal revocation timing still requires hosted verification.

Update - 2026-07-14 (Mercy LARS / ALTS-MoE foundation):

- Added durable Legal Autonomous Research System modules under `lars/` with assignment compiler, ALTS tree controller, structured branch evaluator, MoE/agent bridge, attorney approval gates, budget limits, and tenant-scoped job store (`mercy_lars_jobs` or local memory).
- API surface: `/v1/lars/status`, compile, jobs CRUD lifecycle (steps/pause/resume/cancel/gates). Web Workspace route `/lars` and sidebar entry. Docs: `docs/product/lars-alts-moe.md`.
- MoE router and LangGraph agents remain the expert/model/tool layer; ALTS only selects trajectory.

Update - 2026-07-14 (premium web UI redesign pass):

- Unified Mercy design tokens (navy/gold, light/dark), shared surface primitives, role-aware workspace chrome (solo vs firm vs platform admin), mobile navigation, and marketing shell polish across the Next.js web surface.
- Production build remains green for all 64 routes; TypeScript and ESLint clean. Authorization boundaries unchanged—UI only adapts presentation from existing session claims.
- Residual UI: denser matter-detail command layout, packaged screenshot QA, and live hosted visual QA on real solo/firm accounts.

Update - 2026-07-14 (hosted activation support for claims and entitlements):

- Canonical claim builders, membership-backed legacy backfill decisions, entitlement status mapping, and stale JWT detection live in `mercy-legal-web/src/lib/auth/authorization-claims.ts`.
- Server sessions now refresh Supabase access tokens when verified `getUser()` app_metadata diverges from JWT claims, so the Core proxy does not forward pre-backfill or pre-revocation bearer tokens after Auth metadata changes.
- Operator tooling:
  - `node mercy-legal-web/scripts/backfill-auth-claims.mjs` (dry-run) / `--apply`
  - `node mercy-legal-web/scripts/validate-stripe-entitlements.mjs` (pure) / `--live`
- Hosted operator runbook: `docs/product/hosted-beta-activation.md`.
- Backfill never copies `user_metadata` into authorization claims; membership/tenant rows are the only automated source of truth. Remaining blockers are external: hosted Supabase/Stripe secrets, apply backfill in the live project, live checkout/cancel smoke, and full manual product smoke.

Verified in this update:

- Core `/health` is public and does not require tenant or user headers.
- Browser-side Core calls route through the Next.js `/api/core/*` proxy; server-side calls use normalized `MERCY_CORE_API_URL` configuration.
- Mercy polls Core health every 15 seconds, so a backend started after the web app can move the status from offline to online without a page reload.
- Proxy connection failures return an actionable `502` JSON error instead of an opaque route failure.
- Vault upload remains wired to `/v1/workspace/discovery/upload`.
- Tenant Vault listing and unassigned-document attachment use `/v1/vault/documents` and `/v1/vault/documents/{document_id}/matter`.
- Vault refresh, preview, attachment, and delete operations use durable document IDs and server-authenticated tenant/matter checks.
- Persistent document rows, chunks, and embedding-job metadata are removed with a supported Vault delete, preventing deleted documents from reappearing after refresh.
- Mercy and Research handoffs preserve durable document IDs through route query context.
- Web TypeScript typecheck passes.
- `main.py` and `scripts/full-smoke-test.py` compile with `py -3 -m py_compile`.
- GitHub CI selector failures were corrected separately and CI is reported fixed as of this update.

Implemented but not fully manually verified in-browser:

- Upload document to Vault, refresh metadata, and see the document library update.
- Preview an uploaded matter document from Vault.
- Delete a matter-attached document from Vault.
- Attach an unassigned persisted Vault document to the selected matter.
- Send a Vault document to Mercy and use a Vault document in Research.
- Extraction-limited warning path in Vault-to-Mercy use.

Current blockers:

- External beta still needs hosted Supabase Auth activation, operator-run legacy-claim backfill against the live project, live Stripe checkout/cancel entitlement verification, and full manual smoke (see `docs/product/hosted-beta-activation.md`).
- Code-side claim/session/entitlement mapping for those steps is in place; residual JWT risk for direct Core callers is bounded by short JWT TTL plus proxy `getUser()` gates.
- Real-client use remains blocked until data retention, deletion, support, and legal documentation are tenant-approved.

Vault document type support:

- Current support is PDF-only. The frontend upload control accepts `application/pdf`, and the backend rejects non-`.pdf` filenames.
- Scanned PDFs may be stored. If no extractable text is available for chunking, storage marks the document `extraction_limited`; reliable first-class OCR is not currently guaranteed.
- DOCX, TXT, RTF, email attachments, and OCR are future features, not current beta promises.

Future feature backlog:

- DOCX, TXT, and RTF Vault ingestion.
- Scanned PDF OCR with explicit confidence and extraction-limit reporting.
- Outlook/email attachment ingestion.
- Richer Vault summaries, key facts, and safe preview snippets.
- Advanced document search and batch document actions.
- First-class `source_scope` and History schema if current metadata surfacing remains too implicit.
- Office document-context alignment with the same Vault document IDs and extraction warnings.
- Admin/manual provisioning completion and verification.
- Payment/session activation hardening.
- Final beta smoke covering upload, attach, Mercy, Research, History reopen, wrong-tenant blocking, and Office add-in context.

## 1. Product Scope

- [ ] Mercy is clearly positioned as a D.C.-native legal AI workspace for solo attorneys and small firms.
- [ ] Public and in-app language states that Mercy is attorney-assistive, not a substitute for legal judgment.
- [ ] Non-D.C. requests are labeled out of governed specialty or routed to bounded general assistance.
- [ ] Product surfaces distinguish beta, local/demo, and production-hardened states.

Go/no-go: **Must pass**.

## 2. Web App Readiness

- [ ] Marketing site and authenticated app are separated in the Next.js App Router.
- [ ] Authenticated matter workflows are not mixed with public marketing components.
- [ ] Real sign-in/sign-up/session handling is implemented outside local dev.
- [ ] Tenant ID, user ID, and role are propagated to the FastAPI core.
- [ ] A beta attorney can create or select a matter without developer assistance.
- [ ] A beta attorney can complete structured intake.
- [ ] A beta attorney can run research, drafting, document review, template generation, and citation/reliability review from a selected matter.
- [ ] Loading the app does not mutate matter state until the user acts.
- [ ] Errors and offline states clearly explain what is and is not saved.

Go/no-go: **Must pass**.

## 3. Office Add-in Readiness

- [ ] The taskpane is hosted over HTTPS.
- [ ] Both production manifests validate and are tested in supported Word and Outlook hosts.
- [ ] Manifests use production taskpane, command, icon, support, terms, and privacy URLs.
- [ ] Word and Outlook sideload instructions are tested.
- [ ] Both hosts connect to the same core, auth/session, firm, tenant, user, and matter model as the web app.
- [ ] Offline queue/cache stores only redacted metadata and never raw confidential document or email text.

Word:

- [ ] Add-in can analyze selected text or active document text.
- [ ] Add-in can draft revisions and preserve route/source/guardrail metadata.
- [ ] Draft, redline, insertion, replacement, and report append remain previews until the attorney explicitly approves the exact output.
- [ ] Word insertion failures provide copy fallback with the same attorney-review warnings and provenance.
- [ ] Approved Word context capture appears only in the selected tenant/matter history and does not modify the document.

Outlook:

- [ ] Add-in can read the selected email and permitted message/thread context without silently fetching attachment bodies.
- [ ] Summary and triage identify material facts, deadlines, requests, obligations, risks, and follow-up items with inference warnings.
- [ ] Draft replies preserve matter context, source/provenance metadata, and attorney-review language.
- [ ] Read mode cannot modify received email; compose mode writes only to the open draft after explicit approval.
- [ ] Mercy exposes no automatic send control, send event, or irreversible mailbox action.
- [ ] Approved correspondence capture is persisted only to the selected tenant/matter and appears in matter history.
- [ ] Permission, offline, backend-unavailable, timeout, malformed-context, and recovery states are tested in Outlook.

Go/no-go: **Must pass for Word and Outlook beta**.

## 4. Core API Readiness

- [ ] `/health` returns healthy status.
- [ ] `/v1/product/capabilities` reflects current beta capabilities.
- [ ] Protected legal endpoints reject unauthenticated non-local requests.
- [ ] Same-tenant matter access succeeds.
- [ ] Cross-tenant matter access fails.
- [ ] `/v1/router/inspect` returns route, confidence, selected capability, missing inputs, guardrail profile, and fallback path.
- [ ] `/v1/agent/execute` returns Agent X metadata and response envelope.
- [ ] `/v1/rag/status` reports truthful backend/source status.
- [ ] `/v1/templates/gallery` returns D.C. templates with attorney-review requirements.
- [ ] `/v1/beta/status` reports access and quota state.
- [ ] `/v1/security/compliance` reports current compliance posture.

Go/no-go: **Must pass**.

## 5. D.C. Knowledge and Source Grounding

- [ ] Seeded official D.C. source registry is present.
- [ ] RAG status reports source count, chunk count, verification status, and backend mode.
- [ ] UI distinguishes candidate source metadata from verified official source text.
- [ ] Research and drafting outputs include citations, source placeholders, or explicit "no adequate source found" language.
- [ ] No output presents unverified authority, quotations, record citations, procedural facts, or standards of review as final.
- [ ] Source refresh date/currentness status is visible or clearly marked pending.
- [ ] Full official text extraction limitations are disclosed before beta use.

Go/no-go: **Must pass with limitations disclosed**.

## 6. Legal Safety and Ethics

- [ ] Every legal output states or displays attorney-review requirement.
- [ ] Citation verification requirement is visible.
- [ ] Record verification requirement is visible when drafting from facts or documents.
- [ ] Confidentiality warnings appear for matter/document workflows.
- [ ] D.C. ethics and supervision warnings are preserved.
- [ ] Billing/saved-time outputs include fee-reasonableness and engagement-term cautions.
- [ ] Missing-input blocks are distinguishable from true ethics/compliance blocks.

Go/no-go: **Must pass**.

## 7. Data Handling

- [ ] Production/beta storage mode is documented.
- [ ] Database encryption at rest is enabled by provider.
- [ ] Database connections require TLS where supported.
- [ ] Backups and recovery expectations are documented.
- [ ] Tenant deletion flow is tested.
- [ ] Retention policy is documented for matters, documents, traces, audit logs, and uploaded files.
- [ ] Client data is not used for model training by Mercy.
- [ ] Observability traces avoid unnecessary raw client text.
- [ ] Local/offline Office storage is redacted.

Go/no-go: **Must pass before real client data**.

## 8. Monitoring and Operations

- [ ] Monitoring dashboard endpoints are admin-only outside local dev.
- [ ] Cost events are tracked without raw PII.
- [ ] Tenant quota state is visible.
- [ ] Error and fallback rates are visible.
- [ ] Guardrail warning/block rates are visible.
- [ ] Alert thresholds are configured or explicitly set to dry-run.
- [ ] Support contact and incident process are documented.

Go/no-go: **Must pass for external beta**.

## 9. Payments and Entitlements

- [ ] Stripe checkout is configured or explicitly disabled for beta.
- [ ] Tenant plan state maps to capability metadata.
- [ ] Strong-model quotas are enforced or clearly beta-limited.
- [ ] Premium workflows are gated or marked unavailable.
- [ ] Billing reports include attorney fee-reasonableness warnings.

Go/no-go: **Can be deferred only for free invite-only beta**.

## 10. Verification Commands

Required before each beta invite batch:

```powershell
.\legal_discovery_ai\.venv\Scripts\python.exe scripts\verify.py
```

```powershell
python -m scripts.check_security_compliance
```

```powershell
python -m evals.run_regression --corpus=full --json
```

Web checks:

```powershell
cd mercy-legal-web
npm run typecheck
npm run lint
npm run build
```

Office add-in checks:

```powershell
cd mercy-legal-plugin
npm run lint
npm run build
npm run validate:manifest
```

Go/no-go: **Must pass or have documented owner-approved exception**.

## 11. Manual Attorney Workflow Smoke Test

Before inviting attorneys, a non-developer reviewer must complete:

- [ ] Sign in.
- [ ] Create a test D.C. matter.
- [ ] Complete intake.
- [ ] Upload or attach a safe sample document.
- [ ] Run D.C. research.
- [ ] Generate a draft.
- [ ] Review route/source/guardrail metadata.
- [ ] Submit beta feedback.
- [ ] Open the Office add-in.
- [ ] Analyze selected Word text.
- [ ] Insert or copy output.
- [ ] Delete test tenant data.

Go/no-go: **Must pass**.

## Final Decision

- [ ] **Go**: All Must Pass items complete, limitations disclosed, support ready.
- [ ] **Limited Go**: Invite-only beta may proceed with named limitations and no real client data.
- [ ] **No Go**: Any auth, tenant isolation, data handling, attorney-review, or core workflow requirement is incomplete.

