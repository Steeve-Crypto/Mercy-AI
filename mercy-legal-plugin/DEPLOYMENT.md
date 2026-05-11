# Mercy Legal Plugin Official Deployment

## What "Official Extension" Means

Microsoft Word add-ins are web apps plus an Office manifest. To make Mercy Legal Plugin official, host the built web files on a public HTTPS domain, generate a production manifest that points to that domain, then submit the manifest in Microsoft Partner Center for AppSource / Office Store review.

## Build The Hosted App

```powershell
cd "C:\Users\12404\Downloads\Mercy AI\mercy-legal-plugin"
npm run build
```

Upload the contents of `dist/` to your production HTTPS host.

The host must serve:

- `/taskpane.html`
- `/commands.html`
- `/support.html`
- `/assets/icon-16.png`
- `/assets/icon-32.png`
- `/assets/icon-64.png`
- `/assets/icon-80.png`

## Generate The Production Manifest

Replace the URL with your real production host:

```powershell
npm run manifest:prod -- --url https://app.mercylegal.ai
```

This writes:

```text
dist/manifest.xml
```

## Validate Before Submission

```powershell
npm run validate:prod-manifest
```

## Microsoft Partner Center Submission Checklist

- Production HTTPS hosting is live.
- `dist/manifest.xml` points to the production domain.
- Support URL is live.
- Privacy policy and terms pages are published.
- App name, icons, screenshots, descriptions, support contact, and test credentials are ready.
- The add-in works in Word on Windows, Word on Mac, and Word on the web for the Office APIs used.

Submit the validated manifest through Microsoft Partner Center as an Office Add-in offer.
