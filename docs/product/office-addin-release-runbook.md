# Mercy Office Add-in Release Runbook

This runbook covers development, sideloading, and production release preparation for the Mercy Legal AI Microsoft Word and Outlook add-ins.

Current posture: one host-aware task-pane bundle is integrated with the FastAPI core and Agent X for local/beta use. Word document workflows and Outlook email workflows share auth, tenant/matter context, reliability metadata, offline recovery, and visual primitives. Production release still requires real HTTPS hosting, tenant-approved data policy, live-host smoke testing, privacy/support assets, and AppSource/reviewer preparation.

## Primary Add-in Path

```text
mercy-legal-plugin/
```

The legacy `word_plugin/` directory is a local scaffold and should not be treated as the production add-in.

## Key Files

| Path | Purpose |
| --- | --- |
| `manifest.xml` | Local/development Word manifest. |
| `manifest.outlook.xml` | Local/development Outlook read/compose manifest. |
| `src/App.tsx` | Taskpane application shell. |
| `src/services/api.ts` | Core API client, request-scoped matter context, Agent X execution, and redacted offline behavior. |
| `src/services/office.ts` | Shared host detection, Word/Outlook context normalization, copy, and approved-write boundary. |
| `src/services/word.ts` | Low-level Word selection/document and Outlook body/draft Office.js helpers. |
| `src/components/office/` | Shared context and explicit approval UI. |
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

Validate Outlook directly during local work:

```powershell
.\node_modules\.bin\office-addin-manifest.cmd validate manifest.outlook.xml
```

Run the shared static safety/workflow smoke:

```powershell
npm run smoke:office
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
VITE_MERCY_USER_ID=office-addin-user
```

Production/beta variables must point to HTTPS services:

```text
VITE_MERCY_CORE_API_URL=https://api.example.com
```

Do not ship production manifests pointing at `127.0.0.1`, localhost, or HTTP taskpane URLs.

## Manifest Requirements

Before external beta:

- [ ] Word manifest validates with `npm run validate:manifest`.
- [ ] Word and Outlook production manifests validate with `npm run validate:prod-manifest`.
- [ ] Taskpane URL uses HTTPS.
- [ ] Command URLs use HTTPS.
- [ ] Icon URLs use HTTPS.
- [ ] Support URL is valid and public.
- [ ] Privacy policy URL is valid and public.
- [ ] Terms URL is valid and public.
- [ ] Display name and description clearly identify Mercy Legal AI.
- [ ] Word manifest capabilities match actual document workflows.
- [ ] Outlook manifest capabilities match actual message-read and compose workflows.
- [ ] No Outlook `ItemSend`, `OnMessageSend`, or programmatic send capability is present.
- [ ] Test account instructions exist for reviewers.

## Sideloading Checklist

For beta testers:

1. Confirm Microsoft Word and Outlook support sideloading for the tester account/environment.
2. Provide the validated `manifest.xml` and `manifest.outlook.xml` files for the hosts in scope.
3. Provide the HTTPS taskpane URL.
4. Provide sign-in or beta token instructions.
5. Confirm the tester can open the taskpane.
6. In Word, confirm selection/document context is read and Draft/Redline/Report remain previews until the attorney approves replacement or append. Run `Update Matter`, approve the selected-text capture, and confirm a dedicated Word context event appears without changing the document.
7. In Outlook read mode, confirm subject, sender/recipients, attachment names, and permitted selection/body context are displayed; attachment bodies are not silently fetched.
8. In Outlook compose mode, confirm Draft reply remains a preview until `Write to draft` is approved and that Mercy never sends the message.
9. Confirm summary, triage, citation/ethics review, selected-matter capture, copy fallback, and reliability metadata work.
10. For `Save to matter`, review the capture preview, approve it, and verify a dedicated Outlook correspondence event appears in the selected matter history only.
11. Repeat `Save to matter` with the core offline. Confirm Mercy reports that nothing was saved, queues no mutation, and does not replay the write after reconnecting.

## Core Integration Requirements

The add-in must continue to call the shared core:

- `/v1/matters`
- `/v1/agent/execute`
- `/v1/agent/skills`
- `/v1/templates/gallery`
- `/v1/beta/status`
- `/v1/beta/feedback`

The add-in must not implement independent legal reasoning. It captures permitted Word or Outlook context, builds request-scoped read-only matter metadata, calls the core, and displays the core response envelope. Matter creation and intake remain explicit web/core actions; Office analysis must not mutate matter intake as a preflight.

## Offline and Local Storage Requirements

The add-in already includes redaction behavior in `src/services/api.ts`. Preserve these rules:

- Do not store raw selected text in localStorage.
- Do not store raw document text in localStorage.
- Do not store generated legal content in offline cache.
- Queue only redacted metadata.
- Never queue, cache, or replay state-changing matter capture. The attorney must reconnect, keep the source item open, and approve the capture again.
- Tell users to rerun actions with the active document or message open after reconnecting.

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
- Outlook summary, triage, reply preview, draft-write approval, matter capture, and no-send boundaries are tested.
- `docs/beta-readiness-checklist.md` passes for both Word and Outlook beta items.
