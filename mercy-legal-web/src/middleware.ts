import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED_PREFIXES = ["/dashboard", "/chat", "/matters", "/templates", "/intake", "/research", "/vault", "/settings", "/billing", "/admin"];
const ADMIN_ROLES = new Set(["admin", "superadmin", "platform_admin", "ops"]);

function supabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function localDevAuthBypassConfigured() {
  return process.env.MERCY_ENV === "local" && process.env.MERCY_AUTH_MODE === "dev";
}

function rolesFromMetadata(metadata: Record<string, unknown> | undefined): string[] {
  const rawRoles = metadata?.roles ?? metadata?.role;
  if (Array.isArray(rawRoles)) return rawRoles.map(String).filter(Boolean);
  if (typeof rawRoles === "string") return rawRoles.split(",").map((role) => role.trim()).filter(Boolean);
  return [];
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
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
    const isAdmin = roles.some((role) => ADMIN_ROLES.has(role));
    if (!isAdmin) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/dashboard";
      redirectUrl.searchParams.set("auth", "admin-required");
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
