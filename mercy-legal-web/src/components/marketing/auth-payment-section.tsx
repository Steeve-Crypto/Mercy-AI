import Link from "next/link";
import { CheckCircle2, CreditCard, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { AnimatedShell } from "@/components/marketing/animated-shell";
import { CheckoutButton } from "@/components/marketing/checkout-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authBenefits } from "@/lib/data";

export function AuthPaymentSection() {
  return (
    <section id="account" className="bg-white px-6 py-24 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <AnimatedShell className="rounded-lg border bg-[#fbfcfe] p-7 shadow-[0_18px_60px_rgba(10,20,40,0.06)]">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-md bg-mercy-navy text-white">
              <LockKeyhole className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-mercy-navy">Attorney account</p>
              <p className="text-xs text-muted-foreground">Auth-ready gateway for firm access</p>
            </div>
          </div>
          <h2 className="mt-8 text-4xl font-semibold tracking-normal text-mercy-navy">
            Sign in, subscribe, download, practice.
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            The marketing page now works as the front door for the Word plugin and the web app. New attorneys can create an account, choose a plan, and continue into the workspace.
          </p>
          <div className="mt-7 space-y-3">
            {authBenefits.map((benefit) => (
              <div key={benefit} className="flex items-center gap-3 text-sm text-mercy-navy">
                <CheckCircle2 className="size-4 text-[#a37f12]" />
                {benefit}
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="gold">
              <Link href="/sign-up">
                <Mail />
                Create account
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </div>
        </AnimatedShell>

        <AnimatedShell className="rounded-lg border bg-mercy-navy p-7 text-white shadow-[0_30px_90px_rgba(10,20,40,0.2)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[#f0d46a]">Payment method</p>
              <h3 className="mt-2 text-3xl font-semibold">Secure firm checkout</h3>
            </div>
            <div className="grid size-12 place-items-center rounded-md bg-white text-mercy-navy">
              <CreditCard className="size-5" />
            </div>
          </div>
          <div className="mt-8 rounded-lg border border-white/10 bg-white/8 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input className="border-white/10 bg-white text-mercy-navy" value="4242 4242 4242 4242" readOnly aria-label="Demo card number" />
              <Input className="border-white/10 bg-white text-mercy-navy" value="Small Firm plan" readOnly aria-label="Selected plan" />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Input className="border-white/10 bg-white text-mercy-navy" value="02 / 29" readOnly aria-label="Demo expiration" />
              <Input className="border-white/10 bg-white text-mercy-navy" value="CVC" readOnly aria-label="Demo cvc" />
              <Input className="border-white/10 bg-white text-mercy-navy" value="20001" readOnly aria-label="Demo zip" />
            </div>
            <div className="mt-5 flex items-center gap-2 text-xs text-white/58">
              <ShieldCheck className="size-4 text-[#f0d46a]" />
              Stripe Checkout is wired through `/api/checkout`; missing keys fall back to demo signup.
            </div>
          </div>
          <CheckoutButton plan="small-firm" label="Start Small Firm checkout" featured className="mt-6 w-full" />
        </AnimatedShell>
      </div>
    </section>
  );
}
