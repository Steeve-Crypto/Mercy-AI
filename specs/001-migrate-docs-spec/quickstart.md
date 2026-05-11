# Quickstart: Verify the Current Mercy Architecture Plan

This quickstart validates the architecture documented in `plan.md`. It does not
require production deployment.

## 1. Confirm active feature artifacts

```powershell
Get-Content .specify\feature.json
Get-ChildItem specs\001-migrate-docs-spec
```

Expected:
- `feature_directory` points to `specs/001-migrate-docs-spec`.
- `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, and `contracts/`
  exist.

## 2. Run the Shared Intelligence Core locally

```powershell
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

If using the existing virtual environment described in the docs:

```powershell
.\legal_discovery_ai\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\legal_discovery_ai\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

## 3. Smoke test the core

Open:

```text
http://127.0.0.1:8000/dashboard
```

Then verify:
- Health status reports Mercy core online.
- A matter can be created.
- A draft can be generated from pasted facts.
- Guardrail output appears with review status.
- Billing report requires an active matter.

## 4. Smoke test the CLI

```powershell
.\legal_discovery_ai\.venv\Scripts\python.exe tools\mercy_cli.py health --output json
.\legal_discovery_ai\.venv\Scripts\python.exe tools\mercy_cli.py capabilities --output json
.\legal_discovery_ai\.venv\Scripts\python.exe tools\mercy_cli.py create-matter "EPA v. Smith" --tier premium --output json
.\legal_discovery_ai\.venv\Scripts\python.exe tools\mercy_cli.py draft --facts-json "{""case_summary"":""Agency denied petition.""}" --output json
```

Expected:
- JSON output is parseable.
- Draft output includes `human_review_required` and `dc_guardrails`.
- Missing live model credentials produce fallback draft text rather than silent
  failure.

## 5. Verify the lightweight Word taskpane scaffold

With the core running, sideload:

```text
word_plugin/manifest.xml
```

Expected:
- Taskpane connects to `http://127.0.0.1:8000`.
- Draft request returns output.
- Insert works in Word or copies fallback text when Word context is unavailable.

## 6. Verify product web package gates

```powershell
cd mercy-legal-web
npm run build
npm run typecheck
```

Expected:
- The product/dashboard package builds and typechecks.
- Checkout remains demo-mode when Stripe environment variables are not set.

## 7. Verify production add-in package gates

```powershell
cd mercy-legal-plugin
npm run build
npm run validate:manifest
```

For production manifest validation:

```powershell
npm run manifest:prod -- --url https://app.mercylegal.ai
npm run validate:prod-manifest
```

Expected:
- Local add-in package builds.
- Office manifest validates.
- Production manifest points to an HTTPS host before external distribution.

## 8. Review modernization backlog from the plan

Before implementing production features, confirm the next plan covers:
- Authentication and tenant isolation.
- Encrypted persistence and retention/deletion policy.
- Source anchors and Bates/record references.
- Official citation verification.
- Async job model for administrative records.
- Premium entitlement enforcement.
- Audit logging without over-retaining client data.
- Contract tests for shared API behavior.

