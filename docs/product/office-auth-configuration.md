# Office Auth Configuration

Mercy Office auth uses Microsoft Entra directly for the primary Office SSO/NAA flow. Supabase Auth remains the fallback identity and session provider. PostgreSQL/Supabase Postgres remains the durable data source for users, firms, tenants, matters, documents, and Microsoft identity mappings.

## Primary Office SSO

Required live values:

- `MERCY_OFFICE_NAA_ENABLED=true`
- `POSTGRES_URL` or `SUPABASE_DB_URL`
- `MERCY_AUTH_MODE=supabase`
- `MERCY_DEV_TOOLS=false`
- `MERCY_ALLOW_DEV_MICROSOFT_IDENTITY_MAP_JSON=false`
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

Office NAA provisioning is manual for beta. Microsoft tokens never create Mercy users, firms, tenants, or domain-based mappings automatically. Unknown Microsoft identities fail closed. Auto-provisioning is disabled during beta so a verified Mercy admin confirms the user, universal tenant boundary, firm boundary when applicable, seat limit, and role set before any Office token can access legal workflows.

Production uses the PostgreSQL/Supabase Postgres table `microsoft_identity_mappings` as the durable source of truth. `MERCY_MICROSOFT_IDENTITY_MAP_JSON` is not a production source. It is only available for local/dev/test when `MERCY_ALLOW_DEV_MICROSOFT_IDENTITY_MAP_JSON=true`.

Run the controlled migration before production use:

```powershell
py -3 scripts\microsoft_identity_db.py apply
py -3 scripts\microsoft_identity_db.py check
```

Required Microsoft claims:

- `tid`: Microsoft Entra tenant ID
- `oid`: Microsoft object ID; `sub` is used only if `oid` is absent
- `preferred_username`, `email`, or `upn`: stored for admin review, not used for domain auto-provisioning

The durable mapping records the Microsoft tenant ID and Microsoft object ID as the stable lookup key.

Required Mercy fields:

- `mercy_user_id`
- `tenant_id` for every customer account
- `firm_id` for firm accounts; solo attorney accounts leave `firm_id` empty
- `roles`
- `status`: `active`, `pending`, or `disabled`
- `attorney_seat_limit`: solo defaults to 1; firm accounts require at least 2

`tenant_id` is the universal workspace/account boundary for both solo and firm customers. Firm accounts also carry `firm_id`; the current Office authorization token still uses `firm_id` as the effective scope for firm-specific authorization behavior. The backend derives `effective_scope_type` and `effective_scope_id`; clients and provisioning operators must not supply those values directly.

### Manual Admin UI Provisioning

In the Mercy Legal Web admin console, open `/admin/provisioning`. Admins can create firm and solo mappings, list status, update roles by resaving a mapping, set tenant and firm IDs, set firm seat limits, and disable users. The backend API is the security boundary and requires an `admin` or `superadmin` role.

### Manual Firm User Provisioning

```powershell
py -3 scripts\provision_microsoft_identity.py create `
  --microsoft-tenant-id "ENTRA_TENANT_ID" `
  --microsoft-object-id "ENTRA_OBJECT_ID" `
  --email "attorney@example.com" `
  --mercy-user-id "MERCY_USER_ID" `
  --tenant-id "TENANT_ID" `
  --firm-id "FIRM_ID" `
  --attorney-seat-limit 2 `
  --roles "attorney,firm_admin" `
  --status active
```

### Manual Solo Attorney Provisioning

```powershell
py -3 scripts\provision_microsoft_identity.py create `
  --microsoft-tenant-id "ENTRA_TENANT_ID" `
  --microsoft-object-id "ENTRA_OBJECT_ID" `
  --email "solo@example.com" `
  --mercy-user-id "MERCY_USER_ID" `
  --tenant-id "SOLO_TENANT_ID" `
  --roles "attorney" `
  --status active
```

### Disable a Mapping

```powershell
py -3 scripts\provision_microsoft_identity.py disable `
  --microsoft-tenant-id "ENTRA_TENANT_ID" `
  --microsoft-object-id "ENTRA_OBJECT_ID"
```

Disabled and pending mappings fail closed at `/v1/auth/microsoft/exchange`.

### Validate Live Office Auth

After provisioning, run the Office manifest/static checks, sideload the add-in, sign in with the provisioned Microsoft account, and confirm `/v1/auth/microsoft/exchange` returns a Mercy session. Unknown, pending, and disabled accounts should receive a sign-in failure and no backend token.

### Office NAA and PKCE Relationship

The Office add-in tries Microsoft Office SSO/NAA first and sends the Microsoft bootstrap token to `/v1/auth/microsoft/exchange`. The backend verifies the Microsoft token, loads the provisioned Mercy identity from PostgreSQL/Supabase Postgres, updates `last_login_at`, and returns the same short-lived backend-accepted Supabase-compatible token used by protected Mercy endpoints.

Supabase PKCE remains the fallback Office sign-in path. The fallback returns a Supabase Auth access token from the web callback dialog and does not use `microsoft_identity_mappings`.
