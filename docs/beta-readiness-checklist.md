# Mercy Legal AI Beta Readiness Checklist

This checklist is the go/no-go gate before inviting real D.C. attorneys or small firms to use Mercy with client-related workflows.

Current posture: **not ready for external attorney beta until all Must Pass items are complete**.

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
- [ ] Production manifest validates.
- [ ] Manifest uses production taskpane, command, icon, support, terms, and privacy URLs.
- [ ] Sideload instructions are tested.
- [ ] Add-in can connect to the same core and tenant model as the web app.
- [ ] Add-in can analyze selected text or active document text.
- [ ] Add-in can draft revisions and preserve route/source/guardrail metadata.
- [ ] Offline queue/cache stores only redacted metadata and never raw confidential text.
- [ ] Word insertion failures provide copy fallback with the same attorney-review warnings.

Go/no-go: **Must pass for Word beta**.

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

