import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type Stripe from "stripe";
import { supabaseServerConfigured } from "@/lib/auth/session";
import { getStripe } from "@/lib/stripe";
import { getPaidSignupActivationStatus, provisionPaidSignup } from "@/lib/signup/provisioning";

function validCheckoutSessionId(value: string | null) {
  return Boolean(value && value.startsWith("cs_"));
}

async function currentSignupUser() {
  if (!supabaseServerConfigured()) {
    return { user: null, error: "Supabase Auth is not configured." };
  }
  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // Middleware and browser auth refresh own cookie writes.
      },
    },
  });
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { user, error: error?.message || null };
}

function stripeSessionUserId(session: Stripe.Checkout.Session) {
  return session.client_reference_id || session.metadata?.user_id || null;
}

export async function GET(request: NextRequest) {
  const checkoutSessionId = request.nextUrl.searchParams.get("session_id");
  if (!validCheckoutSessionId(checkoutSessionId)) {
    return NextResponse.json({ active: false, error: "A valid Stripe checkout session is required." }, { status: 400 });
  }

  const { user, error } = await currentSignupUser();
  if (error || !user) {
    return NextResponse.json({ active: false, error: error || "Please sign in before checking workspace activation." }, { status: 401 });
  }

  const stripe = getStripe();
  if (stripe) {
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(checkoutSessionId!, { expand: ["subscription"] });
    } catch {
      return NextResponse.json({ active: false, error: "Stripe checkout session could not be verified." }, { status: 502 });
    }

    if (stripeSessionUserId(session) !== user.id) {
      return NextResponse.json({ active: false, error: "Checkout session does not belong to the signed-in Mercy account." }, { status: 403 });
    }

    if (session.status === "complete") {
      const result = await provisionPaidSignup(session);
      if (result.mode === "auth_error" || result.mode === "storage_error" || result.mode === "invalid" || result.mode === "not_configured") {
        return NextResponse.json({ active: false, error: "Workspace provisioning is not complete yet." }, { status: 503 });
      }
    }
  }

  const status = await getPaidSignupActivationStatus(user.id, checkoutSessionId);
  if (status.mode === "auth_error" || status.mode === "storage_error" || status.mode === "not_configured") {
    return NextResponse.json(
      {
        active: false,
        error:
          status.mode === "not_configured"
            ? "Signup activation storage is not configured."
            : status.error || "Workspace activation could not be confirmed.",
      },
      { status: status.mode === "not_configured" ? 503 : 500 },
    );
  }

  return NextResponse.json({
    active: status.active,
    tenantId: status.tenantId,
    firmId: status.firmId,
    subscriptionStatus: status.subscriptionStatus,
    workspaceActive: status.workspaceActive,
    sessionRefreshRequired: status.active,
  });
}
