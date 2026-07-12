---
name: mercy-review-next-steps
description: "Review Mercy Legal AI changes and generate exact next steps across core, web, Office add-in, auth, vault/matter/document flows, D.C. grounding, citations, tenant isolation, and CI."
---

# Mercy Review And Next Steps

Use this playbook when reviewing Mercy Legal AI changes, preparing PR feedback,
or generating next todos from the current repo state.

## Required Context

Read these before drawing conclusions:

1. `AGENTS.md`
2. `.specify/feature.json`
3. `specs/002-legal-ai-integration/plan.md`
4. `specs/002-legal-ai-integration/tasks.md`
5. `docs/beta-readiness-checklist.md`
6. The affected code, tests, workflow files, and docs

Do not rely on chat memory. Treat the repo as the source of truth.

## Review Posture

Lead with concrete findings, ordered by risk. Prefer file and line references.
Call out missing tests, CI gaps, or beta-readiness blockers separately from code
style. If no issues are found, say so and state the remaining residual risk.

## Mercy Gates

Every review should check whether the change preserves:

- Backend/core health and the FastAPI shared intelligence boundary.
- Web app health, especially the `/api/core/*` proxy and authenticated app
  routes.
- Office add-in health, auth handoff, redacted queue/cache behavior, and manifest
  readiness.
- Auth/session reliability, tenant/user context propagation, and cross-tenant
  denial behavior.
- Vault, matter, document upload, preview, attach, delete, and retrieval flows.
- D.C. grounding, citation accuracy, source traceability, and currentness labels.
- Attorney control, attorney-review language, and missing-input clarity.
- File/document handling, retention posture, audit traces, and PII/secrets
  redaction.
- CI reliability across Python, Next.js, Office add-in, security, and code
  scanning jobs.

## Next-Step Output

When generating todos, use exact repo state:

- Prefer existing PD items in `specs/002-legal-ai-integration/tasks.md`.
- If a todo is new, tie it to an existing blocker or Mercy gate.
- Include target files or workflows.
- Keep the list short enough to be actionable.
- Do not propose a new app, router, RAG service, auth system, or add-in surface.

## Security Automation Fit

Prefer low-friction open-source or GitHub-native checks before agentic review:

1. Secrets scanning with Gitleaks or TruffleHog.
2. Dependency checks with pip-audit and npm audit, or OSV-Scanner.
3. Static analysis with Semgrep.
4. GitHub code scanning with CodeQL.
5. PR-Agent/Qodo only after token scope, prompt-injection exposure, and review
   permissions are explicitly acceptable.
6. Architecture or dependency review only when it closes a real brownfield risk.
