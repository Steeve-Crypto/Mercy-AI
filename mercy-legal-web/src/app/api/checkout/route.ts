import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { normalizeSignup, signupMetadata, validatePendingSignup } from "@/lib/signup/provisioning";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const signup = normalizeSignup({
    accountType: body.accountType === "firm" ? "firm" : "solo",
    userId: typeof body.userId === "string" ? body.userId : "",
    email: typeof body.email === "string" ? body.email : "",
    fullName: typeof body.fullName === "string" ? body.fullName : "",
    tenantName: typeof body.tenantName === "string" ? body.tenantName : "",
    firmName: typeof body.firmName === "string" ? body.firmName : "",
    seats: Number(body.seats || 1),
    practiceAreas: typeof body.practiceAreas === "string" ? body.practiceAreas : "",
    jurisdictionFocus: typeof body.jurisdictionFocus === "string" ? body.jurisdictionFocus : "",
  });
  const validationError = validatePendingSignup(signup);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const appUrl = process.env.MERCY_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRICE_ID_BETA_SEAT;

  if (!stripe || !priceId) {
    return NextResponse.json({
      url: `/sign-up/success?checkout=demo&account=${encodeURIComponent(signup.accountType)}`,
      mode: "demo",
      message: "Stripe checkout is not configured for this environment.",
    });
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
      ...signupMetadata(signup),
    },
    subscription_data: {
      metadata: signupMetadata(signup),
    },
  });

  return NextResponse.json({ url: session.url });
}
