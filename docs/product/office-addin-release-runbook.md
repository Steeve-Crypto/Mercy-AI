# Mercy Office Add-in Release Runbook

This runbook covers development, sideloading, and production release preparation for the Mercy Legal AI Microsoft Word add-in.

Current posture: the add-in is integrated with the FastAPI core and Agent X for local/beta use. Production release still requires HTTPS hosting, auth handoff, manifest finalization, privacy/support assets, and beta validation.

## Primary Add-in Path

```text
mercy-legal-plugin/
```

The legacy `word_plugin/` directory is a local scaffold and should not be treated as the production add-in.

## Key Files

| Path | Purpose |
| --- | --- |
| `manifest.xml` | Local/development Office manifest. |
| `src/App.tsx` | Taskpane application shell. |
| `src/services/api.ts` | Core API client, intake calls, Agent X execution, offline redaction/cache behavior. |
| `src/services/word.ts` | Office.js document/selection helpers. |
| `src/commands.ts` | Ribbon command handlers. |
| `scripts/generate-production-manifest.mjs` | Production manifest generation. |
| `DEPLOYMENT.md` | Existing add-in deployment notes. |

## Local Development

Install dependencies:

```powershell
cd mercy-legal-plugin
npm install
```

Run the dev server:

```powershell
npm run dev
```

Validate manifest:

```powershell
npm run validate:manifest
```

Build:

```powershell
npm run build
```

Optional local certificate setup:

```powershell
npm run install:certs
```

Start desktop sideload session:

```powershell
npm run start:desktop
```

Stop desktop sideload session:

```powershell
npm run stop
```

## Required Environment

Development variables:

```text
VITE_MERCY_CORE_API_URL=http://127.0.0.1:8000
VITE_MERCY_API_TOKEN=
VITE_MERCY_TENANT_ID=local-dev-tenant
VITE_MERCY_USER_ID=word-addin-user
```

Production/beta variables must point to HTTPS services:

```text
VITE_MERCY_CORE_API_URL=https://api.example.com
```

Do not ship production manifests pointing at `127.0.0.1`, localhost, or HTTP taskpane URLs.

## Manifest Requirements

Before external beta:

- [ ] Manifest validates with `npm run validate:manifest`.
- [ ] Production manifest validates with `npm run validate:prod-manifest`.
- [ ] Taskpane URL uses HTTPS.
- [ ] Command URLs use HTTPS.
- [ ] Icon URLs use HTTPS.
- [ ] Support URL is valid and public.
- [ ] Privacy policy URL is valid and public.
- [ ] Terms URL is valid and public.
- [ ] Display name and description clearly identify Mercy Legal AI.
- [ ] Capabilities match actual Word workflows.
- [ ] Test account instructions exist for reviewers.

## Sideloading Checklist

For beta testers:

1. Confirm Microsoft Word supports sideloading for the tester account/environment.
2. Provide the validated manifest.
3. Provide the HTTPS taskpane URL.
4. Provide sign-in or beta token instructions.
5. Confirm the tester can open the taskpane.
6. Confirm the add-in can read selected text.
7. Confirm a core-backed action succeeds.
8. Confirm insertion or copy fallback works.
9. Confirm reliability metadata appears.

## Core Integration Requirements

The add-in must continue to call the shared core:

- `/v1/matter/intake/full`
- `/v1/agent/execute`
- `/v1/agent/skills`
- `/v1/templates/gallery`
- `/v1/beta/status`
- `/v1/beta/feedback`

The add-in should not implement independent legal reasoning. It should capture Word context, call the core, and display the core response envelope.

## Offline and Local Storage Requirements

The add-in already includes redaction behavior in `src/services/api.ts`. Preserve these rules:

- Do not store raw selected text in localStorage.
- Do not store raw document text in localStorage.
- Do not store generated legal content in offline cache.
- Queue only redacted metadata.
- Tell users to rerun actions with the active document open after reconnecting.

## Privacy and Support Requirements

Before AppSource or external beta:

- [ ] Public privacy policy exists.
- [ ] Public terms or beta terms exist.
- [ ] DPA or data-processing language exists for beta firms.
- [ ] Support URL and support email are active.
- [ ] Data handling limitations are clear.
- [ ] Attorney-review and source-verification requirements are clear.
- [ ] No client data is used for model training by Mercy.

## AppSource Notes

AppSource release is a later milestone. Before submission, prepare:

- Production manifest.
- Valid icons at required sizes.
- Screenshots.
- Short and long descriptions.
- Support URL.
- Privacy URL.
- Terms URL.
- Test credentials.
- Detailed reviewer notes.
- HTTPS taskpane hosting.
- Clear explanation of AI-generated output and attorney-review requirements.

## Beta Release Gate

Do not distribute the add-in to real D.C. attorneys until:

- FastAPI core is hosted over HTTPS.
- Web auth/tenant model is defined.
- Add-in auth or beta access model is defined.
- Manifest validates.
- Sideload flow is tested.
- Offline redaction is verified.
- Selected-text analysis, drafting, citation verification, and insertion/copy fallback are tested.
- `docs/beta-readiness-checklist.md` passes for Word beta items.

