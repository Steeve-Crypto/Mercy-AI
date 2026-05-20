import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

const PKCE_COOKIE = "mercy-office-pkce";
const STATE_COOKIE = "mercy-office-state";

function supabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function base64Url(value: Buffer) {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function verifierChallenge(verifier: string) {
  return base64Url(crypto.createHash("sha256").update(verifier).digest());
}

function callbackUrl(request: NextRequest) {
  return new URL("/api/auth/office/callback", request.nextUrl.origin).toString();
}

function officeAuthProvider() {
  return process.env.MERCY_OFFICE_PKCE_PROVIDER || process.env.NEXT_PUBLIC_MERCY_OFFICE_PKCE_PROVIDER || "azure";
}

function cookieOptions(request: NextRequest) {
  return {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "none" as const,
    path: "/api/auth/office",
    maxAge: 10 * 60,
  };
}

export function GET(request: NextRequest) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ detail: "Supabase Office auth is not configured." }, { status: 503 });
  }

  const verifier = base64Url(crypto.randomBytes(32));
  const state = base64Url(crypto.randomBytes(24));
  const authUrl = new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/+$/, "")}/auth/v1/authorize`);
  authUrl.searchParams.set("provider", officeAuthProvider());
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  authUrl.searchParams.set("redirect_to", callbackUrl(request));
  authUrl.searchParams.set("code_challenge", verifierChallenge(verifier));
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(PKCE_COOKIE, verifier, cookieOptions(request));
  response.cookies.set(STATE_COOKIE, state, cookieOptions(request));
  return response;
}

export const runtime = "nodejs";
