import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getStripe } from "@/lib/stripe";
import { normalizeSignup, signupMetadata, validatePendingSignup } from "@/lib/signup/provisioning";

function supabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

async function requireMatchingSignupUser(userId: string) {
  if (!supabaseConfigured()) {
    return null;
  }
  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // Checkout reads the current signup session only.
      },
    },
  });
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return "Please sign in before continuing to payment.";
  }
  if (user.id !== userId) {
    return "Checkout user does not match the signed-in Mercy account.";
  }
  return null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const termsAccepted = body.termsAccepted === true;
  const responsibilityAccepted = body.responsibilityAccepted === true;
  const accountType = body.accountType === "firm" ? "firm" : "solo";
  const requestedSeats = Number(body.seats || 1);
  if (accountType === "firm" && requestedSeats < 2) {
    return NextResponse.json({ error: "Firm signup requires at least 2 attorney seats." }, { status: 400 });
  }
  const signup = normalizeSignup({
    accountType,
    userId: typeof body.userId === "string" ? body.userId : "",
    email: typeof body.email === "string" ? body.email : "",
    fullName: typeof body.fullName === "string" ? body.fullName : "",
    tenantName: typeof body.tenantName === "string" ? body.tenantName : "",
    firmName: typeof body.firmName === "string" ? body.firmName : "",
    seats: requestedSeats,
    practiceAreas: typeof body.practiceAreas === "string" ? body.practiceAreas : "",
    jurisdictionFocus: typeof body.jurisdictionFocus === "string" ? body.jurisdictionFocus : "",
  });
  const validationError = validatePendingSignup(signup);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  if (!termsAccepted || !responsibilityAccepted) {
    return NextResponse.json({ error: "Please accept the beta terms and AI responsibility acknowledgments." }, { status: 400 });
  }
  const authError = await requireMatchingSignupUser(signup.userId);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const appUrl = process.env.MERCY_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRICE_ID_BETA_SEAT;
  const pendingSignupId = `signup_${crypto.randomUUID()}`;

  if (!stripe || !priceId) {
    if (process.env.MERCY_DEMO_CHECKOUT === "true") {
      return NextResponse.json({
        error: "Demo checkout is enabled, but real signup checkout cannot fake payment success.",
      }, { status: 503 });
    }
    return NextResponse.json({
      error: "Stripe checkout is not configured. Add STRIPE_SECRET_KEY and STRIPE_PRICE_ID_BETA_SEAT to enable payment.",
    }, { status: 503 });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: signup.email,
    line_items: [{ price: priceId, quantity: signup.seats }],
    success_url: `${appUrl}/sign-up/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/sign-up/cancel?account=${encodeURIComponent(signup.accountType)}`,
    client_reference_id: signup.userId,
    metadata: {
      product: "mercy-ai",
      pending_signup_id: pendingSignupId,
      ...signupMetadata(signup),
    },
    subscription_data: {
      metadata: {
        pending_signup_id: pendingSignupId,
        ...signupMetadata(signup),
      },
    },
  });

  return NextResponse.json({ url: session.url });
}
