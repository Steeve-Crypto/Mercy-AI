# Mercy Deployment Notes

Mercy is currently a single FastAPI service that serves three surfaces:

- Shared Intelligence Core API: `/v1/*`
- Standalone Platform: `/dashboard`
- Word taskpane scaffold: `/word_plugin/taskpane.html`

## Local Run

```powershell
cd "C:\Users\12404\Downloads\Mercy AI"
.\legal_discovery_ai\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\legal_discovery_ai\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Open:

```text
http://127.0.0.1:8000/dashboard
```

## Word Add-in

Sideload:

```text
C:\Users\12404\Downloads\Mercy AI\word_plugin\manifest.xml
```

The current manifest points the taskpane at:

```text
http://127.0.0.1:8000/word_plugin/taskpane.html
```

Some Word environments require HTTPS for taskpanes. For production, host the
taskpane on HTTPS and update `word_plugin/manifest.xml`.

## Docker

```powershell
docker build -t mercy-core .
docker run --env-file .env -p 8000:8000 mercy-core
```

## Production Hardening Checklist

- Put FastAPI behind HTTPS.
- Replace in-memory matter context with an encrypted database only after the
  retention policy is finalized.
- Add authentication before external deployment.
- Add Stripe or billing provider integration before enabling premium actions.
- Add citation verification against official D.C. and federal sources.
- Add audit logging that records prompts, source anchors, and attorney approval
  without storing unnecessary client documents.
