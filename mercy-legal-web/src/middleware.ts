import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED_PREFIXES = ["/mercy", "/dashboard", "/chat", "/history", "/matters", "/templates", "/intake", "/research", "/vault", "/settings", "/billing", "/admin"];
const ADMIN_ROLES = new Set(["admin", "superadmin", "platform_admin", "ops"]);
const PLATFORM_BYPASS_ROLES = new Set(["superadmin", "platform_admin", "ops"]);
const ACTIVE_ACCOUNT_STATUSES = new Set(["active", "trialing"]);

function supabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function localDevAuthBypassConfigured() {
  return process.env.MERCY_ENV === "local" && process.env.MERCY_AUTH_MODE === "dev";
}

function rolesFromMetadata(metadata: Record<string, unknown> | undefined): string[] {
  const rawRoles = metadata?.roles ?? metadata?.role;
  if (Array.isArray(rawRoles)) return rawRoles.map((role) => String(role).trim().toLowerCase()).filter(Boolean);
  if (typeof rawRoles === "string") return rawRoles.split(",").map((role) => role.trim().toLowerCase()).filter(Boolean);
  return [];
}

function stringFromMetadata(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizedStringFromMetadata(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = stringFromMetadata(metadata, key);
  return value ? value.toLowerCase() : null;
}

function hasWorkspaceAccess(user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }) {
  const roles = [...rolesFromMetadata(user.app_metadata), ...rolesFromMetadata(user.user_metadata)];
  if (roles.some((role) => PLATFORM_BYPASS_ROLES.has(role))) return true;

  const app = user.app_metadata || {};
  const userMeta = user.user_metadata || {};
  const tenantId = stringFromMetadata(app, "tenant_id") || stringFromMetadata(userMeta, "tenant_id");
  const firmId = stringFromMetadata(app, "firm_id") || stringFromMetadata(userMeta, "firm_id");
  const accountType = stringFromMetadata(app, "account_type") || stringFromMetadata(userMeta, "account_type");
  const accountStatus =
    normalizedStringFromMetadata(app, "subscription_status") ||
    normalizedStringFromMetadata(app, "account_status") ||
    normalizedStringFromMetadata(userMeta, "subscription_status") ||
    normalizedStringFromMetadata(userMeta, "account_status");
  const workspaceActive = app.workspace_active ?? app.account_active ?? userMeta.workspace_active ?? userMeta.account_active;

  if (!tenantId || !accountStatus || !ACTIVE_ACCOUNT_STATUSES.has(accountStatus)) return false;
  if (workspaceActive === false || workspaceActive === "false" || workspaceActive === "deactivated") return false;
  if (accountType === "firm" && !firmId) return false;
  return true;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/api/stripe/webhook") {
    return NextResponse.next();
  }
  const protectedRoute = PROTECTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  if (!protectedRoute) {
    return NextResponse.next();
  }
  if (!supabaseConfigured()) {
    if (localDevAuthBypassConfigured()) {
      return NextResponse.next();
    }
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/sign-in";
    redirectUrl.searchParams.set("next", `${path}${request.nextUrl.search}`);
    redirectUrl.searchParams.set("auth", "provider-required");
    return NextResponse.redirect(redirectUrl);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/sign-in";
    redirectUrl.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(redirectUrl);
  }

  if (path === "/admin" || path.startsWith("/admin/")) {
    const roles = [...rolesFromMetadata(user.app_metadata), ...rolesFromMetadata(user.user_metadata)];
    const accountType = stringFromMetadata(user.app_metadata, "account_type") || stringFromMetadata(user.user_metadata, "account_type");
    const platformBypass = roles.some((role) => PLATFORM_BYPASS_ROLES.has(role));
    const isAdmin = roles.some((role) => ADMIN_ROLES.has(role)) && (!accountType || platformBypass);
    if (!isAdmin) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/dashboard";
      redirectUrl.searchParams.set("auth", "admin-required");
      return NextResponse.redirect(redirectUrl);
    }
    return response;
  }

  if (!hasWorkspaceAccess(user)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/sign-up";
    redirectUrl.searchParams.set("next", `${path}${request.nextUrl.search}`);
    redirectUrl.searchParams.set("subscription", "required");
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
