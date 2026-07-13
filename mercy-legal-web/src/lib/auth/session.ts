import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import type { CoreAuthContext } from "@/lib/core-client";
import { hasTrustedWorkspaceAccess, trustedAccountClaims } from "@/lib/auth/trusted-claims";

export type MercySessionUser = {
  id: string;
  email: string | null;
  name: string;
  tenantId: string;
  firmId: string | null;
  roles: string[];
  firm?: string | null;
  dcBarNumber?: string | null;
  stripeCustomerId?: string | null;
};

export function supabaseServerConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function localDevAuthDefaultsEnabled() {
  return process.env.MERCY_ENV === "local" && process.env.MERCY_AUTH_MODE === "dev";
}

function accountNameFromUser(user: User): string | null {
  return String(
    user.user_metadata?.firm_name ?? user.user_metadata?.firmName ?? "",
  ).trim() || null;
}

export function mercyUserFromSupabaseUser(user: User): MercySessionUser {
  const claims = trustedAccountClaims(user);
  return {
    id: user.id,
    email: user.email ?? null,
    name: String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? "Mercy Attorney"),
    // Tenant/workspace, firm/account, and role authorization is server-owned
    // Supabase app_metadata. User metadata remains display-only.
    tenantId: claims.tenantId ?? claims.firmId ?? "",
    firmId: claims.firmId,
    roles: claims.roles,
    stripeCustomerId: claims.stripeCustomerId,
    firm: accountNameFromUser(user),
    dcBarNumber:
      typeof user.user_metadata?.dc_bar_number === "string"
        ? user.user_metadata.dc_bar_number
        : typeof user.user_metadata?.dcBarNumber === "string"
          ? user.user_metadata.dcBarNumber
          : null,
  };
}

async function getTrustedSupabaseSession(): Promise<{ user: User; accessToken: string } | null> {
  if (!supabaseServerConfigured()) return null;

  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // Server Components only read auth state. Middleware refreshes cookies.
      },
    },
  });
  const [{ data: userResult }, { data: sessionResult }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);
  const user = userResult.user;
  const session = sessionResult.session;
  if (!user || !session || !hasTrustedWorkspaceAccess(user)) return null;
  return { user, accessToken: session.access_token };
}

export async function getServerMercySessionUser(): Promise<MercySessionUser | null> {
  if (!supabaseServerConfigured()) {
    if (!localDevAuthDefaultsEnabled()) return null;
    return {
      id: process.env.MERCY_USER_ID || process.env.NEXT_PUBLIC_MERCY_USER_ID || "local-web-server",
      email: null,
      name: "Mercy Attorney",
      tenantId: process.env.MERCY_TENANT_ID || process.env.NEXT_PUBLIC_MERCY_TENANT_ID || "local-dev-tenant",
      firmId: process.env.MERCY_FIRM_ID || process.env.NEXT_PUBLIC_MERCY_FIRM_ID || null,
      roles: (process.env.MERCY_ROLES || "attorney").split(",").map((role) => role.trim()).filter(Boolean),
      stripeCustomerId: process.env.STRIPE_CUSTOMER_ID || null,
    };
  }

  const trustedSession = await getTrustedSupabaseSession();
  return trustedSession ? mercyUserFromSupabaseUser(trustedSession.user) : null;
}

export async function getServerMercyAuthContext(): Promise<CoreAuthContext> {
  if (!supabaseServerConfigured()) {
    if (!localDevAuthDefaultsEnabled()) {
      return {};
    }
    return {
      token: process.env.MERCY_CORE_API_TOKEN || process.env.MERCY_API_TOKEN,
      tenantId: process.env.MERCY_TENANT_ID || process.env.NEXT_PUBLIC_MERCY_TENANT_ID || "local-dev-tenant",
      firmId: process.env.MERCY_FIRM_ID || process.env.NEXT_PUBLIC_MERCY_FIRM_ID,
      userId: process.env.MERCY_USER_ID || process.env.NEXT_PUBLIC_MERCY_USER_ID || "local-web-server",
      roles: process.env.MERCY_ROLES || "attorney",
    };
  }

  const trustedSession = await getTrustedSupabaseSession();
  if (!trustedSession) return {};
  const mercyUser = mercyUserFromSupabaseUser(trustedSession.user);
  return {
    token: trustedSession.accessToken,
    tenantId: mercyUser.tenantId,
    firmId: mercyUser.firmId,
    userId: mercyUser.id,
    roles: mercyUser.roles.join(","),
  };
}
