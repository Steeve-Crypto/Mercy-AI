# Contributing to Mercy Legal AI

Mercy Legal AI is a D.C.-native legal AI platform. Contributions should preserve the product architecture, legal safety posture, and source-of-truth documentation.

## Ground Rules

- Keep legal intelligence in the FastAPI Shared Intelligence Core.
- Do not create duplicate dashboard, add-in, router, or RAG services unless the Spec Kit plan changes.
- Use `mercy-legal-web/` as the primary web product.
- Use `mercy-legal-plugin/` as the primary Office add-in.
- Treat `standalone_platform/` and `word_plugin/` as legacy smoke/demo surfaces.
- Preserve response envelopes and attorney-review metadata in legal outputs.

## Source of Truth

Read these before major work:

- `README.md`
- `AGENTS.md`
- `.agents/skills/mercy-review-next-steps/SKILL.md`
- `specs/001-migrate-docs-spec/spec.md`
- `specs/002-legal-ai-integration/plan.md`
- `specs/002-legal-ai-integration/tasks.md`
- `docs/beta-readiness-checklist.md`

## Verification

Run the canonical verifier before handing off substantial changes:

```powershell
.\legal_discovery_ai\.venv\Scripts\python.exe scripts\verify.py
```

For targeted checks:

```powershell
python -m unittest discover -s tests -p "test_*.py"
python -m scripts.check_security_compliance
```

GitHub security automation also runs Gitleaks, pip-audit, npm audit, GitHub
Dependency Review, Semgrep, and CodeQL on pull requests and main-branch changes.

Web:

```powershell
cd mercy-legal-web
npm run typecheck
npm run lint
npm run build
```

Office add-in:

```powershell
cd mercy-legal-plugin
npm run lint
npm run build
npm run validate:manifest
```

## Documentation Changes

Update documentation when changes affect:

- Product scope.
- User workflows.
- Auth or tenant boundaries.
- Data retention or deletion.
- Legal output metadata.
- RAG/source behavior.
- Office add-in release process.
- Beta readiness.
- Deployment requirements.

## Legal Safety Requirements

All legal workflows must preserve:

- Attorney-review requirement.
- Citation verification warning.
- Record verification warning when applicable.
- Confidentiality and supervision reminders.
- Source/citation status.
- Route and guardrail metadata.
- Tenant/data posture.
