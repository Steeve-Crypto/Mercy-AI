# Mercy Web App Architecture

This document describes the target structure for `mercy-legal-web/`, the primary standalone web product for Mercy Legal AI.

Current posture: the app is stable and connected to the FastAPI core, but still basic as a product. The next phase is to separate marketing, auth, authenticated matter workflows, and admin/beta operations cleanly.

## Goals

- Keep public marketing separate from attorney work.
- Make authenticated matter workflows the center of the product.
- Pass real tenant/user/session context to the FastAPI core.
- Preserve route, source, guardrail, citation, data posture, and attorney-review metadata across all legal outputs.
- Avoid duplicating legal intelligence in the frontend.

## Current Structure

Important current paths:

```text
mercy-legal-web/
  src/app/
    (marketing)/page.tsx
    api/checkout/route.ts
    dashboard/
      layout.tsx
      loading.tsx
      page.tsx
    sign-in/page.tsx
    sign-up/page.tsx
    layout.tsx
    globals.css
  src/components/
    auth/
    dashboard/
    marketing/
    ui/
  src/lib/
    core-client.ts
    data.ts
    stripe.ts
    utils.ts
```

The current dashboard calls the core through `src/lib/core-client.ts`. It is functional for local/beta workflows, but the route model should become more explicit before external beta.

## Target App Router Structure

Target structure:

```text
src/app/
  (marketing)/
    page.tsx
    pricing/
    word-addin/
  (auth)/
    sign-in/
    sign-up/
    callback/
  (app)/
    layout.tsx
    dashboard/
    matters/
      page.tsx
      [matterId]/
        page.tsx
        intake/
        documents/
        research/
        drafting/
        verification/
        activity/
        billing/
    templates/
    settings/
  (admin)/
    beta/
    monitoring/
    security/
  api/
    checkout/
    auth/
  layout.tsx
  globals.css
```

## Route Responsibilities

| Route Area | Purpose | Auth |
| --- | --- | --- |
| `(marketing)` | Public product education, pricing, Office add-in information, conversion. | Public |
| `(auth)` | Sign-in, sign-up, auth callback, beta invite acceptance. | Public/session bootstrap |
| `(app)` | Attorney workspace: matters, intake, documents, research, drafting, verification, templates, settings. | Required |
| `(admin)` | Beta operations, monitoring, cost, security/compliance views. | Required admin/ops role |
| `api/checkout` | Stripe checkout bridge. | Public or session-aware depending on plan flow |

## Data Flow

Legal intelligence must flow through the FastAPI core:

```text
Next.js UI
  -> src/lib/core-client.ts
  -> FastAPI Shared Intelligence Core
  -> router / RAG / Agent X / matter context / templates / monitoring
  -> response envelope
  -> UI reliability and attorney-review display
```

The frontend should not implement its own legal routing, RAG, citation verification, guardrail logic, or agent behavior. It should render core metadata clearly.

## Auth Strategy

Target behavior:

1. User signs in through Supabase Auth.
2. Middleware protects `(app)` and `(admin)` routes.
3. Server provisioning writes tenant, firm, role, account type, entitlement status, active state, and Stripe customer identity to Supabase `app_metadata`.
4. Middleware, server sessions, browser sessions, billing, and the FastAPI core derive authorization only from that server-owned metadata.
5. Client-side calls use a safe API route or session-aware token strategy.
6. Production code does not rely on localStorage tenant defaults.

Production Core contract:

```text
Authorization: Bearer <token>
JWT app_metadata.tenant_id: workspace/data scope
JWT app_metadata.firm_id: parent firm/account scope when applicable
JWT app_metadata.roles: allowlisted Mercy roles
JWT app_metadata.account_type: solo | firm
JWT app_metadata.account_status: active | trialing for workspace access
JWT app_metadata.workspace_active: true for workspace access
```

Supabase `user_metadata` is editable by the authenticated user. Mercy uses it only for display fields such as name, firm display name, D.C. Bar number, and pending onboarding data; it cannot supply tenant, firm, role, entitlement, active-state, or billing authorization. The paid signup and Microsoft session issuers already write the canonical `app_metadata` contract.

`X-Mercy-*` identity headers are accepted only by explicit local/test auth modes. In production Supabase mode, the verified bearer JWT is authoritative and client identity headers cannot select a tenant or add a role. The Next.js Core proxy also requires an active trusted workspace before forwarding non-health requests.

Legacy accounts whose authorization exists only in `user_metadata` must not be trusted. Operator backfill uses membership/tenant rows only:

```powershell
cd mercy-legal-web
node scripts\backfill-auth-claims.mjs
node scripts\backfill-auth-claims.mjs --apply
```

The server session helper refreshes the access token when verified `getUser()` `app_metadata` diverges from JWT claims before the Core proxy forwards a bearer token. Subscription suspension and entitlement demotion update `app_metadata` immediately; `getUser()`-backed workspace checks deny access without waiting for client refresh. Direct Core callers still need short JWT TTL and re-authentication. Full hosted steps live in `docs/product/hosted-beta-activation.md`.

Local dev may keep explicit `MERCY_ENV=local` and `MERCY_AUTH_MODE=dev` behavior, but production paths fail closed when trusted claims are missing or malformed.

## Matter Workspace Model

The primary authenticated product should be matter-centered:

```text
Matter
  -> Intake
  -> Documents
  -> Research
  -> Drafting / Analysis
  -> Verification
  -> Activity / Audit
  -> Billing / Saved-time report
```

Every workflow should preserve:

- Matter ID and tenant ID.
- Route mode and selected expert.
- Confidence and fallback state.
- Missing inputs.
- Citations/source anchors.
- Guardrail status.
- Attorney-review requirement.
- Trace ID where available.
- Data posture and retention warning.

## Frontend Components

Recommended component groups:

```text
src/components/
  marketing/
  auth/
  app-shell/
  matters/
  intake/
  documents/
  research/
  drafting/
  verification/
  templates/
  reliability/
  admin/
  ui/
```

The current `dashboard/` components can be migrated gradually into these groups.

## Product UX Requirements

- The first authenticated screen should be useful, not a marketing page.
- Attorneys should always know which matter they are working in.
- Legal outputs should not appear detached from matter context.
- Reliability metadata should be visible but not overwhelming.
- Empty states should guide the next legal workflow.
- Offline/core-unavailable states must say that work is not reliable until the core confirms it.

## Near-Term Implementation Tasks

1. Add `(app)` and move authenticated dashboard/workspace routes under it.
2. Add auth middleware and a session provider.
3. Replace placeholder auth forms with real provider integration.
4. Split `dashboard-workspace` into matter-centered workflow components.
5. Create reusable reliability/source metadata components.
6. Add admin/beta/monitoring route protection.
7. Add Playwright or equivalent end-to-end smoke tests.
