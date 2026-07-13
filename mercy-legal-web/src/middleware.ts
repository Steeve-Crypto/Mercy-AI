import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasTrustedPlatformAdminAccess, hasTrustedWorkspaceAccess } from "@/lib/auth/trusted-claims";

const PROTECTED_PREFIXES = ["/mercy", "/dashboard", "/chat", "/history", "/matters", "/templates", "/intake", "/research", "/vault", "/settings", "/billing", "/admin"];

function supabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function localDevAuthBypassConfigured() {
  return process.env.MERCY_ENV === "local" && process.env.MERCY_AUTH_MODE === "dev";
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
    if (!hasTrustedPlatformAdminAccess(user)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/dashboard";
      redirectUrl.searchParams.set("auth", "admin-required");
      return NextResponse.redirect(redirectUrl);
    }
    return response;
  }

  if (!hasTrustedWorkspaceAccess(user)) {
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
