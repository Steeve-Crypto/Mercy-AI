# Office Auth Configuration

Mercy Office auth uses Microsoft Entra directly for the primary Office SSO/NAA flow. Supabase Auth remains the fallback identity and session provider. PostgreSQL/Supabase Postgres remains the durable data source for users, firms, tenants, matters, documents, and future identity mappings.

## Primary Office SSO

Required live values:

- `MERCY_OFFICE_NAA_ENABLED=true`
- `MICROSOFT_ENTRA_TENANT_ID`
- `MICROSOFT_ENTRA_CLIENT_ID`
- `MICROSOFT_ENTRA_APPLICATION_ID_URI`
- `MICROSOFT_ENTRA_ISSUER`
- `MICROSOFT_ENTRA_JWKS_URL`

The Word and Outlook manifests must include `WebApplicationInfo` with:

- `Id` equal to the Entra application client ID
- `Resource` equal to the application ID URI
- `access_as_user` scope

TODO before enterprise pilots: pre-authorize the relevant Microsoft Office client applications for Mercy's `access_as_user` scope in Entra.

## Supabase PKCE Fallback

Required live values:

- `MERCY_OFFICE_PKCE_FALLBACK_ENABLED=true`
- `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_JWT_SECRET`
- `MERCY_OFFICE_PKCE_PROVIDER`
- `NEXT_PUBLIC_MERCY_OFFICE_PKCE_PROVIDER`
- `VITE_MERCY_WEB_AUTH_URL`

`MERCY_OFFICE_PKCE_PROVIDER` must name the OAuth provider that is actually enabled in Supabase Auth for the Office fallback. Mercy does not default this to Azure because Microsoft Entra is already used directly for the Office NAA primary path. If the fallback provider is `azure`, set `MERCY_SUPABASE_AZURE_PROVIDER_ENABLED=true` only after the Azure provider is configured in Supabase Auth.

Supabase redirect URLs must include the deployed Office callback route:

- `https://YOUR_WEB_ORIGIN/api/auth/office/callback`
- Local validation: `https://127.0.0.1:3000/api/auth/office/callback`

The Office pane receives only the returned Supabase access token from the dialog callback. It does not share cookies or localStorage with the web app.

## Durable Identity Mapping

The current Microsoft mapping layer is a safe fail-closed bridge. The next production step is a PostgreSQL/Supabase Postgres table for Microsoft identity provisioning with:

- Microsoft tenant ID
- Microsoft object ID
- email and/or domain
- Mercy user ID
- `firm_id` for firm accounts or `tenant_id` for solo accounts
- roles
- active/disabled state
- created, updated, and audit timestamps
