"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, CreditCard, Loader2 } from "lucide-react";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accountType = payload?.accountType === "firm" ? "firm" : "solo";
  const seats = accountType === "firm" ? Math.max(2, Number(payload?.seats || 2)) : 1;
  const total = useMemo(() => 98 * seats, [seats]);

  async function continueToStripe() {
    if (!payload) {
      setError("No pending signup details were found. Please return to signup.");
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, seats }),
    });
    const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
    setBusy(false);
    if (!response.ok || !data.url) {
      setError(data.error || "Stripe checkout could not be started.");
      return;
    }
    window.sessionStorage.removeItem("mercy.pendingSignupCheckout");
    window.location.href = data.url;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb] px-6 py-12">
      <section className="w-full max-w-xl rounded-lg border bg-white p-8 shadow-[0_24px_80px_rgba(10,20,40,0.08)]">
        <Button asChild variant="ghost" className="mb-6">
          <Link href={accountType === "firm" ? "/sign-up/firm" : "/sign-up/solo"}>
            <ArrowLeft />
            Back to signup
          </Link>
        </Button>
        <div className="mx-auto grid size-14 place-items-center rounded-md bg-[#f5ecd0] text-[#9b740e]">
          <CreditCard className="size-7" />
        </div>
        <h1 className="mt-6 text-center text-3xl font-semibold text-mercy-navy">Review your beta subscription</h1>
        <div className="mt-6 rounded-lg border bg-slate-50 p-5 text-sm text-slate-700">
          <div className="flex justify-between gap-4">
            <span>Plan</span>
            <strong className="text-mercy-navy">{accountType === "firm" ? "Small Firm" : "Solo Practitioner"}</strong>
          </div>
          <div className="mt-3 flex justify-between gap-4">
            <span>Attorney seats</span>
            <strong className="text-mercy-navy">{seats}</strong>
          </div>
          <div className="mt-3 flex justify-between gap-4">
            <span>Monthly price</span>
            <strong className="text-mercy-navy">{accountType === "firm" ? `$98 x ${seats} = $${total}/month` : "$98/month"}</strong>
          </div>
        </div>
        <p className="mt-5 text-center text-sm leading-6 text-slate-600">
          Payment information is entered on Stripe Checkout. Mercy provisions your workspace after Stripe confirms the subscription.
        </p>
        {error ? <div className="mt-5 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        <Button type="button" variant="gold" className="mt-6 h-12 w-full" onClick={continueToStripe} disabled={busy || !payload}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Continue to secure Stripe Checkout
        </Button>
        {!payload ? <p className="mt-3 text-center text-xs text-slate-500">No pending signup was found in this browser session.</p> : null}
      </section>
    </main>
  );
}
