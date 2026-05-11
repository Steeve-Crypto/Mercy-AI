# Contract: Browser and Product UI Workflows

## Standalone Platform

**Purpose**: Local heavy-lifting workspace served by the Shared Intelligence Core.

**Current workflows**:
1. Health check displays core status and Clerk OS version.
2. Create matter with name and tier.
3. Run discovery by PDF upload or document path.
4. Display extracted facts as JSON.
5. Generate draft from facts.
6. Display D.C. guardrail status and details.
7. Generate billing report for active matter.
8. Copy drafting output.

**Required behavior**:
- Disable form controls while a request is running.
- Display recoverable error text for failed requests.
- Preserve active matter id visibly.
- Show guardrail status when available.

## Mercy Legal Web

**Purpose**: Product, pricing, auth/payment, and dashboard experience.

**Current workflows**:
1. Marketing/product presentation for D.C.-focused legal AI.
2. Dashboard panels for assistant, document vault, contract analyzer, clause
   library, matters, and activity.
3. Checkout route creates Stripe subscription session when configured.
4. Checkout route falls back to demo sign-up URL when Stripe config is missing.

**Modernization requirements**:
- Replace demo-only dashboard data with authenticated core-backed matter and
  document workflows.
- Enforce auth before client-data workflows.
- Enforce plan entitlements before premium workflows.
- Keep legal AI behavior consistent with the Shared Intelligence Core.

