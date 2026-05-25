import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import type { CoreAuthContext } from "@/lib/core-client";

export type MercySessionUser = {
  id: string;
  email: string | null;
  name: string;
  tenantId: string;
  firmId: string | null;
  roles: string[];
  firm?: string | null;
  dcBarNumber?: string | null;
};

export function supabaseServerConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function localDevAuthDefaultsEnabled() {
  return process.env.MERCY_ENV === "local" && process.env.MERCY_AUTH_MODE === "dev";
}

function rolesFromUser(user: User): string[] {
  const rawRoles = user.app_metadata?.roles ?? user.user_metadata?.roles ?? user.app_metadata?.role ?? user.user_metadata?.role;
  if (Array.isArray(rawRoles)) return rawRoles.map(String).filter(Boolean);
  if (typeof rawRoles === "string") return rawRoles.split(",").map((role) => role.trim()).filter(Boolean);
  return ["attorney"];
}

function stringFromMetadata(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firmFromUser(user: User): string | null {
  return stringFromMetadata(
    user.app_metadata?.firm_id,
    user.app_metadata?.firmId,
    user.user_metadata?.firm_id,
    user.user_metadata?.firmId,
  );
}

function tenantFromUser(user: User): string {
  const tenantId = stringFromMetadata(
    user.app_metadata?.tenant_id,
    user.app_metadata?.tenantId,
    user.user_metadata?.tenant_id,
    user.user_metadata?.tenantId,
  );
  const firmId = firmFromUser(user);
  // Firm/customer context is valid for account-level flows. Tenant ID is the
  // child workspace/data scope when present; firm ID remains the firm boundary.
  return tenantId ?? firmId ?? user.id;
}

function accountNameFromUser(user: User): string | null {
  return String(
    user.user_metadata?.firm_name ?? user.user_metadata?.firmName ?? "",
  ).trim() || null;
}

export function mercyUserFromSupabaseUser(user: User): MercySessionUser {
  return {
    id: user.id,
    email: user.email ?? null,
    name: String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? "Mercy Attorney"),
    tenantId: tenantFromUser(user),
    firmId: firmFromUser(user),
    roles: rolesFromUser(user),
    firm: accountNameFromUser(user),
    dcBarNumber:
      typeof user.user_metadata?.dc_bar_number === "string"
        ? user.user_metadata.dc_bar_number
        : typeof user.user_metadata?.dcBarNumber === "string"
          ? user.user_metadata.dcBarNumber
          : null,
  };
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

  if (!user || !session) {
    return {};
  }

  const mercyUser = mercyUserFromSupabaseUser(user);
  return {
    token: session.access_token,
    tenantId: mercyUser.tenantId,
    firmId: mercyUser.firmId,
    userId: mercyUser.id,
    roles: mercyUser.roles.join(","),
  };
}
