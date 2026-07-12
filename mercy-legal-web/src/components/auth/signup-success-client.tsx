"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ActivationResponse = {
  active?: boolean;
  tenantId?: string | null;
  subscriptionStatus?: string | null;
  error?: string;
};

type SignupSuccessClientProps = {
  checkoutSessionId: string | null;
};

const steps = ["Plan", "Register", "Payment", "Confirmation"];

export function SignupSuccessClient({ checkoutSessionId }: SignupSuccessClientProps) {
  const [checking, setChecking] = useState(Boolean(checkoutSessionId));
  const [activeWorkspace, setActiveWorkspace] = useState(false);
  const [message, setMessage] = useState(
    checkoutSessionId
      ? "Mercy is confirming your subscription and preparing your workspace."
      : "Please return to signup and complete Stripe Checkout before continuing.",
  );
  const [error, setError] = useState<string | null>(checkoutSessionId ? null : "We could not confirm a checkout session.");

  const checkActivation = useCallback(async () => {
    if (!checkoutSessionId) return;
    setChecking(true);
    setError(null);
    try {
      const response = await fetch(`/api/signup/activation?session_id=${encodeURIComponent(checkoutSessionId)}`, {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as ActivationResponse;
      if (!response.ok) {
        throw new Error(data.error || "Workspace activation could not be confirmed yet.");
      }
      if (!data.active) {
        setMessage("Stripe is confirmed, but Mercy is still finishing workspace activation.");
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const refresh = await supabase?.auth.refreshSession();
      if (refresh?.error) {
        throw new Error("Workspace is active, but your browser session could not be refreshed. Please sign in again.");
      }
      setActiveWorkspace(true);
      setMessage("Your Mercy workspace is active. Session state has been refreshed for the workspace.");
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : "Workspace activation could not be confirmed yet.");
      setMessage("Payment may be complete, but workspace access is not ready.");
    } finally {
      setChecking(false);
    }
  }, [checkoutSessionId]);

  useEffect(() => {
    checkActivation();
  }, [checkActivation]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb] px-6 py-12">
      <section className="w-full max-w-xl rounded-lg border bg-white p-8 text-center shadow-[0_24px_80px_rgba(10,20,40,0.08)]">
        <Stepper />
        <div className={`mx-auto grid size-14 place-items-center rounded-md ${activeWorkspace ? "bg-emerald-50 text-emerald-700" : "bg-[#f5ecd0] text-[#9b740e]"}`}>
          {activeWorkspace ? <CheckCircle2 className="size-7" /> : error ? <AlertCircle className="size-7" /> : <Loader2 className="size-7 animate-spin" />}
        </div>
        <h1 className="mt-6 text-3xl font-semibold text-mercy-navy">
          {activeWorkspace ? "Workspace activated" : checkoutSessionId ? "Payment received" : "We could not confirm a checkout session."}
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">{message}</p>
        {checking ? (
          <div className="mt-6 flex items-center justify-center gap-2 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
            <Loader2 className="size-4 animate-spin" />
            Refreshing account and tenant status...
          </div>
        ) : null}
        {error ? <div className="mt-6 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {activeWorkspace ? (
            <Button asChild variant="gold">
              <Link href="/dashboard">Enter Mercy</Link>
            </Button>
          ) : null}
          <Button type="button" variant={activeWorkspace ? "outline" : "gold"} onClick={checkActivation} disabled={!checkoutSessionId || checking}>
            <RefreshCw />
            Check activation
          </Button>
          <Button asChild variant="outline">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}

function Stepper() {
  return (
    <ol className="mb-8 grid gap-2 text-left text-xs font-semibold text-slate-500 sm:grid-cols-4">
      {steps.map((step, index) => (
        <li key={step} className="rounded-md border border-[#d4af37]/50 bg-[#fff8df] px-3 py-2 text-mercy-navy">
          <span className="mr-2 text-[#9b740e]">{index + 1}</span>
          {step}
        </li>
      ))}
    </ol>
  );
}
