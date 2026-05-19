# Mercy Legal Web Project Structure

`mercy-legal-web/` is the primary standalone web product for Mercy Legal AI.

Current posture: the app is stable, uses the Next.js App Router, and has live core integration through `src/lib/core-client.ts`. It still needs frontend productization: real auth, clean route groups, matter-centered workflows, entitlements, and beta polish.

## Current Folder Layout

```text
mercy-legal-web/
  components.json
  eslint.config.mjs
  next.config.ts
  package.json
  postcss.config.mjs
  tsconfig.json
  src/
    app/
      (marketing)/
        page.tsx
      api/
        checkout/
          route.ts
      dashboard/
        layout.tsx
        loading.tsx
        page.tsx
      sign-in/
        page.tsx
      sign-up/
        page.tsx
      globals.css
      layout.tsx
    components/
      auth/
        auth-shell.tsx
      dashboard/
        activity-feed.tsx
        ai-assistant-panel.tsx
        beta-feedback.tsx
        beta-launch-panel.tsx
        beta-onboarding.tsx
        clause-library.tsx
        contract-analyzer.tsx
        dashboard-workspace.tsx
        document-vault.tsx
        matter-management.tsx
        reliability-panel.tsx
        sidebar.tsx
        template-gallery.tsx
        upload-dropzone.tsx
      marketing/
        auth-payment-section.tsx
        checkout-button.tsx
        cta-section.tsx
        feature-showcase.tsx
        hero-section.tsx
        plugin-download-section.tsx
        pricing-section.tsx
        testimonials.tsx
      ui/
        badge.tsx
        button.tsx
        card.tsx
        input.tsx
        progress.tsx
        separator.tsx
        tabs.tsx
        textarea.tsx
        tooltip.tsx
    lib/
      core-client.ts
      data.ts
      stripe.ts
      utils.ts
```

## Current Responsibilities

| Area | Responsibility |
| --- | --- |
| `src/app/(marketing)` | Public marketing entry point. |
| `src/app/dashboard` | Current attorney workspace shell. Connected to core but should move into an authenticated app route group. |
| `src/app/sign-in`, `src/app/sign-up` | Placeholder auth pages. Need real provider/session integration. |
| `src/app/api/checkout` | Stripe checkout route with demo fallback. |
| `src/components/dashboard` | Matter, assistant, document, template, beta, reliability, and activity UI components. |
| `src/lib/core-client.ts` | Typed client for FastAPI core endpoints and response envelopes. |
| `src/lib/data.ts` | Marketing/static product copy. Should not drive authenticated legal workflows. |

## Target App Router Structure

Target structure for the next productization phase:

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

## Target Component Structure

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

The existing `dashboard/` components can be migrated incrementally into these groups.

## Core Data Flow

All legal intelligence must flow through the FastAPI core:

```text
React UI
  -> src/lib/core-client.ts
  -> FastAPI core
  -> router / RAG / Agent X / templates / beta / monitoring
  -> response envelope
  -> reliability UI
```

The web app should not duplicate legal routing, RAG, guardrails, or citation verification logic.

## Auth and Tenant Target

Production target:

- Middleware protects `(app)` and `(admin)`.
- Real auth provider supplies session state.
- Tenant ID, user ID, and roles are propagated to the core.
- Local dev may use `MERCY_ENV=local` and `MERCY_AUTH_MODE=dev`.
- Production must not rely on localStorage defaults for tenant identity.

Required core headers:

```text
Authorization: Bearer <token>
X-Mercy-Tenant-Id: <tenant>
X-Mercy-User-Id: <user>
X-Mercy-Roles: <roles>
```

## Developer Commands

Install:

```powershell
npm install
```

Run:

```powershell
npm run dev
```

Check:

```powershell
npm run typecheck
npm run lint
npm run build
```

## Productization Priorities

1. Move authenticated workspace routes under `(app)`.
2. Add real auth/session middleware.
3. Turn dashboard panels into a coherent matter workspace.
4. Standardize reliability/source/guardrail components.
5. Improve document upload/review/source-anchor UX.
6. Connect Stripe/beta entitlements to tenant capability state.
7. Add end-to-end tests for beta attorney workflows.

