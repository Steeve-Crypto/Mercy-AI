import { NextResponse, type NextRequest } from "next/server";
import { getServerMercyAuthContext } from "@/lib/auth/session";
import { MERCY_CORE_API_URL } from "@/lib/core-client";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function localDevAuthDefaultsEnabled() {
  return process.env.MERCY_ENV === "local" && process.env.MERCY_AUTH_MODE === "dev";
}

function targetUrl(path: string[], search: string): string {
  const suffix = path.map((part) => encodeURIComponent(part)).join("/");
  return `${MERCY_CORE_API_URL}/${suffix}${search}`;
}

function forwardedRequestHeaders(request: NextRequest, auth: Awaited<ReturnType<typeof getServerMercyAuthContext>>) {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  headers.set("Accept", request.headers.get("accept") || "application/json");
  if (auth.token) headers.set("Authorization", `Bearer ${auth.token}`);
  if (localDevAuthDefaultsEnabled()) {
    if (auth.tenantId) headers.set("X-Mercy-Tenant-Id", auth.tenantId);
    if (auth.firmId) headers.set("X-Mercy-Firm-Id", auth.firmId);
    if (auth.userId) headers.set("X-Mercy-User-Id", auth.userId);
    if (auth.roles) headers.set("X-Mercy-Roles", auth.roles);
  }
  return headers;
}

async function proxyCore(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  const isHealthRequest = path.length === 1 && path[0] === "health";
  const auth = await getServerMercyAuthContext();
  if (!isHealthRequest && !auth.token && !localDevAuthDefaultsEnabled()) {
    return NextResponse.json({ detail: "Mercy session is required." }, { status: 401 });
  }

  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  let response: Response;
  try {
    response = await fetch(targetUrl(path, request.nextUrl.search), {
      method: request.method,
      headers: forwardedRequestHeaders(request, auth),
      body,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { detail: "Mercy Core is unreachable. Confirm the FastAPI service is running and MERCY_CORE_API_URL is correct." },
      { status: 502 },
    );
  }

  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  return new NextResponse(response.body, { status: response.status, headers });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyCore(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyCore(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyCore(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyCore(request, context);
}
