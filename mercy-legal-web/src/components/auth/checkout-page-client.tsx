"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type CheckoutPayload = {
  accountType?: "solo" | "firm";
  userId?: string;
  email?: string;
  fullName?: string;
  tenantName?: string;
  firmName?: string;
  seats?: number;
  practiceAreas?: string;
  jurisdictionFocus?: string;
  termsAccepted?: boolean;
  responsibilityAccepted?: boolean;
};

type EmbeddedCheckout = {
  mount: (selector: string) => void;
  destroy?: () => void;
};

declare global {
  interface Window {
    Stripe?: (publishableKey: string) => {
      initEmbeddedCheckout: (options: { clientSecret: string }) => Promise<EmbeddedCheckout>;
    };
  }
}

const steps = ["Plan", "Account", "Payment", "Workspace"];

function readPendingSignup(): CheckoutPayload | null {
  try {
    const raw = window.sessionStorage.getItem("mercy.pendingSignupCheckout");
    return raw ? (JSON.parse(raw) as CheckoutPayload) : null;
  } catch {
    return null;
  }
}

export function CheckoutPageClient() {
  const [payload] = useState<CheckoutPayload | null>(() => readPendingSignup());
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkoutRef = useRef<EmbeddedCheckout | null>(null);
  const startedRef = useRef(false);
  const accountType = payload?.accountType === "firm" ? "firm" : "solo";
  const seats = accountType === "firm" ? Math.max(2, Number(payload?.seats || 2)) : 1;
  const total = useMemo(() => 98 * seats, [seats]);
  const publishableKeyConfigured = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

  useEffect(() => {
    if (!payload || startedRef.current) return;
    startedRef.current = true;
    let disposed = false;

    async function loadStripeScript() {
      if (window.Stripe) return;
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>('script[src="https://js.stripe.com/v3/"]');
        if (existing?.dataset.loaded === "true") {
          resolve();
          return;
        }
        if (existing) {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error("Stripe.js could not be loaded.")), { once: true });
          return;
        }
        const script = document.createElement("script");
        script.src = "https://js.stripe.com/v3/";
        script.async = true;
        script.onload = () => {
          script.dataset.loaded = "true";
          resolve();
        };
        script.onerror = () => reject(new Error("Stripe.js could not be loaded."));
        document.head.appendChild(script);
      });
    }

    async function startEmbeddedCheckout() {
      if (!publishableKeyConfigured) {
        setError("Stripe checkout is not configured. Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to show the secure payment form.");
        return;
      }
      setLoadingCheckout(true);
      setError(null);
      try {
        const response = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, seats }),
        });
        const data = (await response.json().catch(() => ({}))) as { clientSecret?: string; publishableKey?: string; error?: string };
        if (!response.ok || !data.clientSecret || !data.publishableKey) {
          throw new Error(data.error || "Stripe checkout could not be started.");
        }
        await loadStripeScript();
        if (!window.Stripe) {
          throw new Error("Stripe.js is unavailable.");
        }
        const stripe = window.Stripe(data.publishableKey);
        const embeddedCheckout = await stripe.initEmbeddedCheckout({ clientSecret: data.clientSecret });
        if (disposed) {
          embeddedCheckout.destroy?.();
          return;
        }
        checkoutRef.current = embeddedCheckout;
        embeddedCheckout.mount("#mercy-embedded-checkout");
      } catch (checkoutError) {
        setError(checkoutError instanceof Error ? checkoutError.message : "Stripe checkout could not be started.");
      } finally {
        setLoadingCheckout(false);
      }
    }

    startEmbeddedCheckout();
    return () => {
      disposed = true;
      checkoutRef.current?.destroy?.();
      checkoutRef.current = null;
    };
  }, [payload, publishableKeyConfigured, seats]);

  if (!payload) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb] px-6 py-12">
        <section className="w-full max-w-xl rounded-lg border bg-white p-8 text-center shadow-[0_24px_80px_rgba(10,20,40,0.08)]">
          <Stepper activeStep="Payment" />
          <h1 className="text-2xl font-semibold text-mercy-navy">No pending signup found</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Return to signup so Mercy can collect account and workspace details before checkout.</p>
          <Button asChild variant="gold" className="mt-6">
            <Link href="/sign-up">Choose a plan</Link>
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-6 py-10 text-slate-950">
      <div className="mx-auto max-w-6xl">
        <Stepper activeStep="Payment" />
        <Button asChild variant="ghost" className="mb-6">
          <Link href={accountType === "firm" ? "/sign-up/firm" : "/sign-up/solo"}>
            <ArrowLeft />
            Back to account details
          </Link>
        </Button>

        <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
          <aside className="rounded-lg border bg-white p-6 shadow-[0_18px_60px_rgba(10,20,40,0.06)]">
            <div className="grid size-12 place-items-center rounded-md bg-[#f5ecd0] text-[#9b740e]">
              <CreditCard className="size-6" />
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-normal text-mercy-navy">Payment</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Review your beta subscription, then complete payment in Stripe&apos;s secure embedded form.
            </p>

            <div className="mt-6 rounded-lg border bg-slate-50 p-5 text-sm text-slate-700">
              <SummaryRow label="Plan" value={accountType === "firm" ? "Mercy Firm" : "Mercy Solo"} />
              <SummaryRow label="Attorney seats" value={`${seats}${accountType === "firm" ? " minimum 2" : ""}`} />
              <SummaryRow label="Monthly total" value={accountType === "firm" ? `$98 x ${seats} = $${total}/month` : "$98/month"} />
            </div>

            <div className="mt-6 space-y-3">
              {[
                "Tenant workspace activation after payment confirmation",
                "Attorney-supervised legal AI workflows",
                "Word and web workspace access during beta",
              ].map((item) => (
                <div key={item} className="flex gap-3 text-sm text-slate-700">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#a37f12]" />
                  {item}
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-md border border-[#C7D2FE] bg-[#EEF2FF] p-4 text-sm leading-6 text-[#4338CA]">
              <div className="mb-1 flex items-center gap-2 font-semibold">
                <ShieldCheck className="size-4" />
                Secure payment
              </div>
              Mercy never stores card numbers. Payment fields are controlled by Stripe.
            </div>

            <p className="mt-5 text-xs leading-5 text-slate-500">
              Questions before subscribing? Contact Mercy support and include the workspace name from this signup.
            </p>
          </aside>

          <section className="rounded-lg border bg-white p-4 shadow-[0_18px_60px_rgba(10,20,40,0.06)] md:p-6">
            <div className="mb-5 flex flex-col justify-between gap-3 border-b pb-5 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-xl font-semibold text-mercy-navy">Confirm and subscribe</h2>
                <p className="mt-1 text-sm text-slate-600">Enter payment information below to start the monthly subscription.</p>
              </div>
              <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                Step 3 of 4
              </span>
            </div>

            {loadingCheckout ? (
              <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-600">
                <Loader2 className="mr-2 size-4 animate-spin" />
                Preparing secure Stripe payment form...
              </div>
            ) : null}
            {error ? <div className="mb-5 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
            <div id="mercy-embedded-checkout" className={loadingCheckout ? "hidden" : "min-h-64"} />
          </section>
        </div>
      </div>
    </main>
  );
}

function Stepper({ activeStep }: { activeStep: "Plan" | "Account" | "Payment" | "Workspace" }) {
  const activeIndex = steps.indexOf(activeStep);
  return (
    <ol className="mb-8 grid gap-2 text-xs font-semibold text-slate-500 sm:grid-cols-4">
      {steps.map((step, index) => (
        <li
          key={step}
          className={`rounded-md border px-3 py-2 ${index <= activeIndex ? "border-[#d4af37]/50 bg-[#fff8df] text-mercy-navy" : "border-slate-200 bg-white"}`}
        >
          <span className="mr-2 text-[#9b740e]">{index + 1}</span>
          {step}
        </li>
      ))}
    </ol>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-200 py-3 first:pt-0 last:border-b-0 last:pb-0">
      <span>{label}</span>
      <strong className="text-right text-mercy-navy">{value}</strong>
    </div>
  );
}
