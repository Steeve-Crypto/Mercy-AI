import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const { customerId } = (await request.json().catch(() => ({}))) as { customerId?: string };
  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
  const configuredCustomer = customerId || process.env.STRIPE_CUSTOMER_ID;

  if (!stripe || !configuredCustomer) {
    return NextResponse.json({
      mode: "demo",
      url: "/billing?portal=demo",
      message: "Stripe customer portal is not configured for this environment.",
    });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: configuredCustomer,
    return_url: `${appUrl}/billing`,
  });

  return NextResponse.json({ url: session.url, mode: "stripe" });
}
