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

function localDevSessionUser(): MercySessionUser {
  return {
    id: process.env.MERCY_USER_ID || process.env.NEXT_PUBLIC_MERCY_USER_ID || "local-web-server",
    email: null,
    name: "Mercy Attorney",
    tenantId: process.env.MERCY_TENANT_ID || process.env.NEXT_PUBLIC_MERCY_TENANT_ID || "local-dev-tenant",
    firmId: process.env.MERCY_FIRM_ID || process.env.NEXT_PUBLIC_MERCY_FIRM_ID || null,
    roles: (process.env.MERCY_ROLES || "attorney,admin").split(",").map((role) => role.trim()).filter(Boolean),
    stripeCustomerId: process.env.STRIPE_CUSTOMER_ID || null,
  };
}

function accountNameFromUser(user: User): string | null {
  return String(user.user_metadata?.firm_name ?? user.user_metadata?.firmName ?? "").trim() || null;
}

export function mercyUserFromSupabaseUser(user: User, options?: { allowLocalFallback?: boolean }): MercySessionUser {
  const claims = trustedAccountClaims(user);
  const local = localDevSessionUser();
  const allowLocalFallback = Boolean(options?.allowLocalFallback && localDevAuthDefaultsEnabled());

  const tenantId = claims.tenantId ?? claims.firmId ?? (allowLocalFallback ? local.tenantId : "");
  const roles = claims.roles.length ? claims.roles : allowLocalFallback ? local.roles : [];

  return {
    id: user.id,
    email: user.email ?? null,
    name: String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? "Mercy Attorney"),
    // Tenant/workspace, firm/account, and role authorization is server-owned
    // Supabase app_metadata. User metadata remains display-only.
    tenantId,
    firmId: claims.firmId ?? (allowLocalFallback ? local.firmId : null),
    roles,
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

async function getSupabaseBrowserSession(): Promise<{ user: User; accessToken: string } | null> {
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
  if (!user || !session) return null;
  return { user, accessToken: session.access_token };
}

export async function getServerMercySessionUser(): Promise<MercySessionUser | null> {
  if (localDevAuthDefaultsEnabled()) {
    const supabaseSession = await getSupabaseBrowserSession();
    if (supabaseSession) {
      return mercyUserFromSupabaseUser(supabaseSession.user, { allowLocalFallback: true });
    }
    return localDevSessionUser();
  }

  if (!supabaseServerConfigured()) {
    return null;
  }

  const supabaseSession = await getSupabaseBrowserSession();
  if (!supabaseSession || !hasTrustedWorkspaceAccess(supabaseSession.user)) return null;
  return mercyUserFromSupabaseUser(supabaseSession.user);
}

export async function getServerMercyAuthContext(): Promise<CoreAuthContext> {
  if (localDevAuthDefaultsEnabled()) {
    const supabaseSession = await getSupabaseBrowserSession();
    if (supabaseSession) {
      const mercyUser = mercyUserFromSupabaseUser(supabaseSession.user, { allowLocalFallback: true });
      return {
        token: supabaseSession.accessToken || process.env.MERCY_CORE_API_TOKEN || process.env.MERCY_API_TOKEN,
        tenantId: mercyUser.tenantId,
        firmId: mercyUser.firmId,
        userId: mercyUser.id,
        roles: mercyUser.roles.join(","),
      };
    }
    return {
      token: process.env.MERCY_CORE_API_TOKEN || process.env.MERCY_API_TOKEN,
      tenantId: process.env.MERCY_TENANT_ID || process.env.NEXT_PUBLIC_MERCY_TENANT_ID || "local-dev-tenant",
      firmId: process.env.MERCY_FIRM_ID || process.env.NEXT_PUBLIC_MERCY_FIRM_ID,
      userId: process.env.MERCY_USER_ID || process.env.NEXT_PUBLIC_MERCY_USER_ID || "local-web-server",
      roles: process.env.MERCY_ROLES || "attorney,admin",
    };
  }

  if (!supabaseServerConfigured()) {
    return {};
  }

  const supabaseSession = await getSupabaseBrowserSession();
  if (!supabaseSession || !hasTrustedWorkspaceAccess(supabaseSession.user)) return {};
  const mercyUser = mercyUserFromSupabaseUser(supabaseSession.user);
  return {
    token: supabaseSession.accessToken,
    tenantId: mercyUser.tenantId,
    firmId: mercyUser.firmId,
    userId: mercyUser.id,
    roles: mercyUser.roles.join(","),
  };
}
