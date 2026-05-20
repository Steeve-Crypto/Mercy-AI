import { NextResponse, type NextRequest } from "next/server";

const PKCE_COOKIE = "mercy-office-pkce";
const STATE_COOKIE = "mercy-office-state";

type SupabaseTokenResponse = {
  access_token?: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  refresh_token?: string;
};

function supabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function dialogHtml(payload: Record<string, unknown>) {
  const message = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Mercy Office sign-in</title><script src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"></script></head>
<body>
  <main style="font-family:system-ui,sans-serif;padding:24px;line-height:1.5">
    <h1 style="font-size:18px">Returning to Mercy Office...</h1>
    <p>You can close this window if it does not close automatically.</p>
  </main>
  <script>
    const message = ${message};
    function sendMessage() {
      if (window.Office && Office.context && Office.context.ui && Office.context.ui.messageParent) {
        Office.context.ui.messageParent(JSON.stringify(message));
      } else if (window.opener) {
        window.opener.postMessage(message, window.location.origin);
      }
    }
    if (window.Office && Office.onReady) {
      Office.onReady(sendMessage);
    } else {
      sendMessage();
    }
  </script>
</body>
</html>`;
}

function htmlResponse(payload: Record<string, unknown>, status = 200) {
  const response = new NextResponse(dialogHtml(payload), {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  response.cookies.delete(PKCE_COOKIE);
  response.cookies.delete(STATE_COOKIE);
  return response;
}

async function exchangeCode(code: string, verifier: string): Promise<SupabaseTokenResponse> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/+$/, "")}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      auth_code: code,
      code_verifier: verifier,
    }),
    cache: "no-store",
  });
  const data = (await response.json()) as SupabaseTokenResponse | { error?: string; error_description?: string };
  if (!response.ok || !("access_token" in data) || !data.access_token) {
    const detail = "error_description" in data ? data.error_description : null;
    throw new Error(detail || "Supabase code exchange failed.");
  }
  return data;
}

export async function GET(request: NextRequest) {
  if (!supabaseConfigured()) {
    return htmlResponse({ type: "mercy-office-auth", ok: false, error: "Supabase Office auth is not configured." }, 503);
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const verifier = request.cookies.get(PKCE_COOKIE)?.value;
  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return htmlResponse({ type: "mercy-office-auth", ok: false, error: "Office sign-in could not be verified." }, 400);
  }

  try {
    const session = await exchangeCode(code, verifier);
    return htmlResponse(
      {
        type: "mercy-office-auth",
        ok: true,
        access_token: session.access_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type ?? "bearer",
      },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Office sign-in failed.";
    return htmlResponse({ type: "mercy-office-auth", ok: false, error: detail }, 502);
  }
}

export const runtime = "nodejs";
