import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { provisionPaidSignup, syncStripeSubscriptionStatus } from "@/lib/signup/provisioning";

export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const rawBody = await request.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const result = await provisionPaidSignup(session);
    if (result.mode === "auth_error" || result.mode === "storage_error" || result.mode === "invalid" || result.mode === "not_configured") {
      console.error("Stripe signup provisioning failed", {
        eventId: event.id,
        sessionId: session.id,
        mode: result.mode,
      });
      return NextResponse.json({ error: "Signup provisioning failed." }, { status: 500 });
    }
  }
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.paused"
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    const result = await syncStripeSubscriptionStatus(subscription);
    if (result.mode === "storage_error") {
      console.error("Stripe subscription status sync failed", {
        eventId: event.id,
        subscriptionId: subscription.id,
        mode: result.mode,
      });
      return NextResponse.json({ error: "Subscription status sync failed." }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
