<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan.
<!-- SPECKIT END -->

# Mercy Agent Instructions

This is an existing brownfield Mercy Legal AI repo. Do not recreate the
backend, web app, Office add-in, router, RAG system, auth layer, or Spec Kit
state unless the current plan explicitly changes those boundaries.

Before review, implementation, or next-step generation:

1. Read `.specify/feature.json` and the active feature plan it points to.
2. Read `specs/002-legal-ai-integration/plan.md` and `tasks.md`.
3. For review and next-step work, read
   `.agents/skills/mercy-review-next-steps/SKILL.md`.

Mercy-specific checks must preserve:

- FastAPI shared core as the only legal intelligence brain.
- `mercy-legal-web/` as the primary web product surface.
- `mercy-legal-plugin/` as the primary Office add-in surface.
- D.C. grounding, citation/source traceability, and attorney-review language.
- Auth/session reliability, tenant isolation, and safe file/document handling.
- Vault, matter, document, web-to-backend proxy, and CI reliability.
