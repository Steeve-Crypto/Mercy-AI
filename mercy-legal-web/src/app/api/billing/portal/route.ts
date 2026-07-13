import { NextResponse } from "next/server";
import { getServerMercySessionUser } from "@/lib/auth/session";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  const sessionUser = await getServerMercySessionUser();
  if (!sessionUser) {
    return NextResponse.json({ message: "An active Mercy workspace session is required." }, { status: 401 });
  }

  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";

  if (!stripe) {
    return NextResponse.json(
      { mode: "unavailable", message: "Stripe customer portal is not configured for this environment." },
      { status: 503 },
    );
  }
  if (!sessionUser.stripeCustomerId) {
    return NextResponse.json(
      { mode: "unavailable", message: "No Stripe customer is assigned to this Mercy workspace." },
      { status: 409 },
    );
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sessionUser.stripeCustomerId,
    return_url: `${appUrl}/billing`,
  });

  return NextResponse.json({ url: session.url, mode: "stripe" });
}
