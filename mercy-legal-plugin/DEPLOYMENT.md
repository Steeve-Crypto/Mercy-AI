# Mercy Legal Plugin Official Deployment

## What "Official Extension" Means

Microsoft Word (and Outlook) add-ins are web apps (static HTML + JS bundle) plus an Office manifest XML. For Beta and eventual AppSource / official deployment:

- Build the plugin with production URLs baked into the JS (core API + web auth for sign-in).
- Host the `dist/` static assets on a public HTTPS origin.
- Generate production manifests (Word + Outlook) that point the taskpane, commands, icons, and support URLs at your hosted origin.
- For beta: sideload the generated `dist/manifest*.xml` (the XML contains the public HTTPS links).
- Later: submit via Microsoft Partner Center.

**Important**: The add-in static hosting origin (e.g. `https://addin.mercylegal.ai`) is independent of:
- The Mercy core backend (`VITE_MERCY_CORE_API_URL` — FastAPI).
- The main web app origin used for PKCE sign-in dialogs (`VITE_MERCY_WEB_AUTH_URL`).

All three can be different domains (or the same root with different subpaths/ subdomains).

## 1. Configure Production URLs (build-time injection)

Vite + `import.meta.env` bakes the values into the final bundle during `npm run build`.

```powershell
cd mercy-legal-plugin
cp .env.production.example .env.production
# Edit .env.production with your real (or beta) values:
#   VITE_MERCY_CORE_API_URL=https://api.mercylegal.example.com
#   VITE_MERCY_WEB_AUTH_URL=https://app.mercylegal.example.com
```

See `.env.production.example` for all supported variables (including PKCE fallback and Entra client IDs for validation).

## 2. Build the Production Bundle

```powershell
# With the .env.production (or exported VITE_* vars) in place:
npm run build
```

This runs TypeScript check + Vite multi-entry build (taskpane.html, commands.html, support.html, index.html + assets).

Output is in `dist/`. The built JS will contain your prod `CORE_API_URL` and `WEB_AUTH_URL`.

## 3. Generate Production Manifests (Word + Outlook)

```powershell
npm run manifest:prod -- --url https://addin.mercylegal.example.com
```

- Replaces all `https://localhost:3000` references in the source manifests.
- Writes:
  - `dist/manifest.xml` (Word)
  - `dist/manifest.outlook.xml` (Outlook)
- The `--url` value becomes the base for taskpane.html, commands, support, and all icon paths.

The source `manifest*.xml` (with localhost) stay untouched for local dev (`npm run dev` + sideloading the source manifests against the running Vite dev server on port 3000).

## 4. Host the Static Assets

Upload **the entire contents of `dist/`** to the root of an HTTPS static hosting provider so that:

- `https://addin.mercylegal.example.com/taskpane.html`
- `https://addin.mercylegal.example.com/commands.html`
- `https://addin.mercylegal.example.com/assets/icon-*.png`
- etc.

Recommended hosts for simple static files (no serverless functions needed):
- Vercel (static site / drag & drop or Git)
- Netlify
- Azure Static Web Apps or Blob static website
- Cloudflare Pages
- AWS S3 + CloudFront (static website hosting)
- GitHub Pages (with caveats on custom domains)

**CORS note**: The add-in bundle makes cross-origin `fetch` calls to your `VITE_MERCY_CORE_API_URL`. Make sure the production backend allows the add-in origin (or use a permissive policy for beta).

## 5. Validate

```powershell
npm run validate:prod-manifest   # validates dist/manifest.xml (Word)
# For Outlook you can run the office-addin-manifest tool directly against dist/manifest.outlook.xml
```

You can also run the smoke script with a hosted URL:

```powershell
$env:MERCY_ADDIN_TASKPANE_URL = "https://addin.mercylegal.example.com/taskpane.html"
npm run smoke:office -- --check-server
```

## Beta Sideloading (Word / Outlook)

1. Give beta testers a copy of the generated `dist/manifest.xml` (and/or `dist/manifest.outlook.xml`).
2. In Word:
   - Go to **File > Options > Trust Center > Trust Center Settings > Trusted Add-in Catalogs**.
   - Or use the developer "Upload My Add-in" flow and select the XML file.
3. The XML contains the public HTTPS `SourceLocation` and icon URLs, so Word/Outlook will load the JS bundle and assets from your hosted origin.
4. The baked-in `VITE_*` values make the add-in call your real backend and web auth origin.
5. Test Reliability Panel, auth handoff (NAA / PKCE), document analysis, drafting, etc.

Same process for Outlook using the outlook manifest.

Local dev sideloading (against `npm run dev`) continues to use the source `manifest.xml` (points at localhost:3000).

## Microsoft Partner Center / AppSource (future)

See the checklist in the original version of this doc. You will submit one of the generated production manifests (with your final production hosting URL) plus screenshots, privacy policy, support contact, test account, etc.

## Files You Typically Upload / Reference for Beta

- `dist/taskpane.html`
- `dist/commands.html`
- `dist/support.html`
- `dist/index.html` (if used)
- `dist/assets/*` (JS, CSS, maps, icons)
- `dist/manifest.xml` and `dist/manifest.outlook.xml` (for sideloading or submission)

Do not upload source `src/`, node_modules, or the dev manifests for production use.

## Preserved Behavior

- Offline queue + full redaction of confidential text (see `src/services/api.ts`).
- Fluent UI ReliabilitySignals panel, MCP skill discovery, envelope metadata, attorney-review disclaimers, etc. — unchanged.
- All Word + Outlook command surface actions remain identical.

This change only affects packaging, build-time URL injection, and hosting instructions.
