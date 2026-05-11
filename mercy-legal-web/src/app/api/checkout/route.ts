import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

const priceEnvByPlan: Record<string, string | undefined> = {
  solo: process.env.STRIPE_PRICE_SOLO,
  "small-firm": process.env.STRIPE_PRICE_SMALL_FIRM,
  practice: process.env.STRIPE_PRICE_PRACTICE,
};

export async function POST(request: Request) {
  const { plan = "small-firm" } = (await request.json().catch(() => ({}))) as { plan?: string };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
  const stripe = getStripe();
  const priceId = priceEnvByPlan[plan];

  if (!stripe || !priceId) {
    return NextResponse.json({
      url: `/sign-up?plan=${encodeURIComponent(plan)}&checkout=demo`,
      mode: "demo",
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/?checkout=cancelled#pricing`,
    metadata: {
      product: "mercy-ai",
      plan,
    },
  });

  return NextResponse.json({ url: session.url });
}
