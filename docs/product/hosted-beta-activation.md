# Hosted Mercy Beta Activation Runbook

This runbook is the operator path from the current code-complete authorization
slice to a hosted attorney beta. It assumes branch work through the
`app_metadata`-only authorization boundary is already merged and deployed.

## Preconditions

- FastAPI core deployed over HTTPS with `MERCY_ENV=production` and
  `MERCY_AUTH_MODE=supabase`.
- Next.js web deployed over HTTPS with matching Supabase and Core env vars.
- Supabase project has Auth enabled and SQL migrations applied from
  `mercy-legal-web/supabase/migrations/`.
- Stripe beta seat price and webhook endpoint configured.
- Service-role and Stripe secrets exist only in server/runtime secret stores.

### Required web env

```text
MERCY_ENV=production
MERCY_AUTH_MODE=supabase
NEXT_PUBLIC_MERCY_ENV=production
NEXT_PUBLIC_MERCY_AUTH_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
MERCY_CORE_API_URL=https://<core-host>
NEXT_PUBLIC_MERCY_CORE_API_URL=https://<core-host>
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PRICE_ID_BETA_SEAT=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
MERCY_APP_URL=https://<web-host>
NEXT_PUBLIC_APP_URL=https://<web-host>
```

### Required core env

```text
MERCY_ENV=production
MERCY_AUTH_MODE=supabase
SUPABASE_URL=...
SUPABASE_JWT_SECRET=...   # or JWKS configuration used by auth_context
POSTGRES_URL=...          # or SUPABASE_DB_URL
MERCY_ALLOWED_ORIGINS=https://<web-host>
MERCY_REQUIRE_HTTPS=true
```

Local/dev defaults (`MERCY_ENV=local` + `MERCY_AUTH_MODE=dev`) must be disabled
on hosted surfaces.

## 1. Apply database migrations

In Supabase SQL editor or CLI, apply in order:

1. `mercy-legal-web/supabase/migrations/202605230001_signup_provisioning.sql`
2. `mercy-legal-web/supabase/migrations/202605250001_work_history.sql`
3. `mercy-legal-web/supabase/migrations/202605260001_pgvector_storage_foundation.sql`
4. `mercy-legal-web/supabase/migrations/202606080001_manual_beta_provisioning_statuses.sql`

Confirm tables exist:

```sql
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in ('mercy_tenants', 'mercy_firms', 'mercy_tenant_members');
```

## 2. Activate Supabase Auth

1. Enable Email auth (and only additional providers you intentionally support).
2. Set Site URL to `https://<web-host>`.
3. Add redirect URLs:
   - `https://<web-host>/sign-in`
   - `https://<web-host>/sign-up/success`
   - `https://<web-host>/api/auth/office/callback`
4. Confirm JWT expiry is short enough for entitlement revocation residual risk
   (recommended 5–15 minutes). Middleware and the Core proxy re-check verified
   user `app_metadata` via `getUser()`; short JWT TTL limits stale bearer risk
   for any direct Core callers.

## 3. Configure Stripe

1. Create a recurring beta seat price and set `STRIPE_PRICE_ID_BETA_SEAT`.
2. Point webhook to `https://<web-host>/api/stripe/webhook`.
3. Subscribe at least to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.paused`
4. Store the signing secret as `STRIPE_WEBHOOK_SECRET`.

Pure and optional live validation from `mercy-legal-web/`:

```powershell
node scripts\validate-stripe-entitlements.mjs
node scripts\validate-stripe-entitlements.mjs --live --json
```

## 4. Legacy authorization claim backfill

Paid signup and Microsoft session issuance already write canonical
`app_metadata`. Legacy accounts that only have authorization in editable
`user_metadata`, or whose membership rows diverge from claims, must be repaired
from membership/tenant tables — never by copying `user_metadata`.

Dry-run:

```powershell
cd mercy-legal-web
node scripts\backfill-auth-claims.mjs
```

Apply:

```powershell
node scripts\backfill-auth-claims.mjs --apply
node scripts\backfill-auth-claims.mjs --apply --user-id=<uuid>
```

Rules enforced by the script:

- Source of truth = `mercy_tenant_members` + `mercy_tenants`.
- `user_metadata` authorization without a membership row → `manual_review` only.
- Firm accounts require `firm_id`; solo accounts must not carry `firm_id`.
- Conflicting camelCase aliases are stripped when writing canonical claims.

After apply, affected users must refresh session or re-authenticate so Core
receives a JWT whose `app_metadata` matches the Auth user record. The web
session helper auto-refreshes when verified user claims diverge from the access
token.

Resolve every `manual_review` row in `/admin/provisioning` before inviting that
attorney.

## 5. Manual beta provisioning (optional non-Stripe)

Use `/admin/provisioning` as a superadmin, or:

```powershell
py -3 scripts\provision_microsoft_identity.py create `
  --email attorney@example.com `
  --tenant-id tenant_example `
  --account-type solo `
  --roles admin,attorney
```

Office Microsoft identity mapping remains separate; see
`docs/product/office-auth-configuration.md`.

## 6. Hosted smoke checklist

### Auth and entitlement

- [ ] Sign-up solo path creates Supabase user, Stripe checkout, webhook
      provisioning, and active `app_metadata`.
- [ ] `/sign-up/success` activation returns active and dashboard loads.
- [ ] Sign-in with unprovisioned or suspended account is denied workspace
      routes (`subscription=required` or equivalent).
- [ ] Billing portal opens only for the trusted `stripe_customer_id`.
- [ ] Cancel/past_due subscription removes workspace access after Auth user
      re-read (no reliance on client-supplied tenant headers).
- [ ] Profile settings cannot change roles/tenant/firm.

### Core legal workflow

- [ ] Create/select matter.
- [ ] Complete intake.
- [ ] Upload PDF to Vault, preview, attach, delete.
- [ ] Research and drafting return citations, guardrails, attorney-review.
- [ ] History reopen works for same tenant; wrong tenant is denied.
- [ ] `/health` public; protected `/v1/*` reject missing auth.

### Office

- [ ] Word sideload, sign-in, analyze selection, approved insert, approved
      matter capture.
- [ ] Outlook sideload, summary/triage, draft reply approval, no send controls,
      approved correspondence capture.
- [ ] Offline queue/cache contains only redacted metadata.

## 7. Go / no-go

Hosted beta is go only when:

1. Migrations and env are production-shaped.
2. Claim backfill dry-run has zero unresolved `manual_review` for invited users.
3. Stripe pure tests pass and live checkout/cancel paths were manually verified.
4. Web + Office smoke checklist is complete for at least one solo and one firm
   test account.
5. `docs/beta-readiness-checklist.md` Must Pass sections are checked for the
   invited cohort.

Until then, keep real client-confidential data out of the environment.
