"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ArrowLeft, Building2, CheckCircle2, Loader2, Scale, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

type AccountType = "solo" | "firm";

type SignupFormProps = {
  accountType: AccountType;
};

const practicePlaceholder = "Contract review, civil litigation, landlord-tenant...";

function priceFor(accountType: AccountType, seats: number) {
  return accountType === "firm" ? `$98 x ${seats} seats = $${98 * seats}/month` : "$98/month";
}

export function SignupPlanSelection() {
  return (
    <main className="min-h-screen bg-[#f7f8fb] px-6 py-10 text-slate-950">
      <div className="mx-auto max-w-5xl">
        <Button asChild variant="ghost">
          <Link href="/">
            <ArrowLeft />
            Back to Mercy.ai
          </Link>
        </Button>
        <div className="mt-10 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a37f12]">Beta signup</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-normal text-mercy-navy md:text-5xl">
            Choose your Mercy workspace.
          </h1>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            Mercy assists attorney-supervised legal work. Attorneys remain responsible for reviewing outputs.
          </p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <PlanCard
            href="/sign-up/solo"
            icon={<UserRound className="size-5" />}
            title="Solo Practitioner"
            price="$98/month"
            detail="One attorney seat, one tenant workspace, and admin access for your own practice."
            points={["1 included attorney seat", "Tenant workspace created after payment", "No firm profile required"]}
          />
          <PlanCard
            href="/sign-up/firm"
            icon={<Building2 className="size-5" />}
            title="Small Firm"
            price="$98/seat/month"
            detail="A shared tenant workspace plus firm profile for teams with at least two attorney seats."
            points={["Minimum 2 attorney seats", "Starts at $196/month", "Firm admin access after payment"]}
          />
        </div>
      </div>
    </main>
  );
}

function PlanCard({
  href,
  icon,
  title,
  price,
  detail,
  points,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  price: string;
  detail: string;
  points: string[];
}) {
  return (
    <section className="rounded-lg border bg-white p-7 shadow-[0_18px_60px_rgba(10,20,40,0.06)]">
      <div className="grid size-12 place-items-center rounded-md bg-[#f5ecd0] text-[#9b740e]">{icon}</div>
      <h2 className="mt-5 text-2xl font-semibold text-mercy-navy">{title}</h2>
      <p className="mt-2 text-3xl font-semibold text-mercy-navy">{price}</p>
      <p className="mt-4 text-sm leading-6 text-slate-600">{detail}</p>
      <ul className="mt-6 space-y-3">
        {points.map((point) => (
          <li key={point} className="flex items-center gap-3 text-sm text-slate-700">
            <CheckCircle2 className="size-4 text-[#a37f12]" />
            {point}
          </li>
        ))}
      </ul>
      <Button asChild variant="gold" className="mt-7 w-full">
        <Link href={href}>Continue</Link>
      </Button>
    </section>
  );
}

export function SignupForm({ accountType }: SignupFormProps) {
  const isFirm = accountType === "firm";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [firmName, setFirmName] = useState("");
  const [seats, setSeats] = useState(isFirm ? 2 : 1);
  const [practiceAreas, setPracticeAreas] = useState("");
  const [jurisdictionFocus, setJurisdictionFocus] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [responsibilityAccepted, setResponsibilityAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const price = useMemo(() => priceFor(accountType, seats), [accountType, seats]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!fullName.trim() || !email.trim() || !password || !tenantName.trim() || !practiceAreas.trim() || !jurisdictionFocus.trim()) {
      setError("Please complete all required fields.");
      return;
    }
    if (isFirm && (!firmName.trim() || seats < 2)) {
      setError("Firm signup requires a firm name and at least 2 attorney seats.");
      return;
    }
    if (!termsAccepted || !responsibilityAccepted) {
      setError("Please accept the beta terms and AI responsibility acknowledgments.");
      return;
    }
    if (!isSupabaseConfigured()) {
      setError("Supabase Auth must be configured before beta signup can create a paid workspace.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase Auth is not configured for this environment.");
      return;
    }

    setBusy(true);
    const authResponse = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          pending_signup_account_type: accountType,
        },
      },
    });

    if (authResponse.error || !authResponse.data.user) {
      setBusy(false);
      setError(authResponse.error?.message || "Could not create your Mercy account.");
      return;
    }

    const checkoutResponse = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountType,
        userId: authResponse.data.user.id,
        email,
        fullName,
        tenantName,
        firmName,
        seats: isFirm ? seats : 1,
        practiceAreas,
        jurisdictionFocus,
      }),
    });
    const checkout = (await checkoutResponse.json().catch(() => ({}))) as { url?: string; error?: string };
    setBusy(false);

    if (!checkoutResponse.ok || !checkout.url) {
      setError(checkout.error || "Checkout failed. Please try again.");
      return;
    }
    window.location.href = checkout.url;
  }

  return (
    <main className="grid min-h-screen bg-[#f7f8fb] lg:grid-cols-[0.82fr_1.18fr]">
      <section className="relative hidden overflow-hidden bg-mercy-navy p-10 text-white lg:block">
        <div className="navy-grid absolute inset-0 opacity-60" aria-hidden />
        <Link href="/" className="relative z-10 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-white text-mercy-navy">
            <Scale className="size-5" />
          </span>
          <span className="text-lg font-semibold">Mercy.ai</span>
        </Link>
        <div className="relative z-10 mt-24 max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#f0d46a]">
            {isFirm ? "Small firm beta" : "Solo beta"}
          </p>
          <h1 className="mt-5 text-5xl font-semibold leading-tight tracking-normal">
            {isFirm ? "Create a paid firm workspace." : "Create your paid solo workspace."}
          </h1>
          <p className="mt-5 text-sm leading-7 text-white/72">
            Payment happens before Mercy Workspace access. Tenant and firm IDs are created by the server after Stripe confirms the subscription.
          </p>
          <div className="mt-8 rounded-lg border border-white/12 bg-white/8 p-5">
            <p className="text-sm text-white/70">Beta price</p>
            <p className="mt-2 text-3xl font-semibold text-white">{price}</p>
          </div>
        </div>
      </section>

      <section className="flex justify-center px-6 py-10">
        <div className="w-full max-w-2xl">
          <Button asChild variant="ghost" className="mb-8">
            <Link href="/sign-up">
              <ArrowLeft />
              Back to plan selection
            </Link>
          </Button>
          <div className="rounded-lg border bg-white p-6 shadow-[0_24px_80px_rgba(10,20,40,0.08)] md:p-8">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-md bg-[#f5ecd0] text-[#9b740e]">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-mercy-navy">
                  {isFirm ? "Small Firm signup" : "Solo Practitioner signup"}
                </h2>
                <p className="text-sm text-slate-600">{price}</p>
              </div>
            </div>

            <form onSubmit={submit} className="mt-8 grid gap-4 md:grid-cols-2">
              {isFirm ? (
                <Field label="Firm name" value={firmName} onChange={setFirmName} placeholder="Capitol Hill Legal" required />
              ) : null}
              <Field label={isFirm ? "Firm admin full name" : "Full name"} value={fullName} onChange={setFullName} placeholder="Alex Carter" required />
              <Field label={isFirm ? "Firm admin work email" : "Work email"} value={email} onChange={setEmail} placeholder="attorney@firm.com" type="email" required />
              <Field label="Password" value={password} onChange={setPassword} placeholder="Create a password" type="password" required />
              <Field label="Workspace name" value={tenantName} onChange={setTenantName} placeholder={isFirm ? "Capitol Hill workspace" : "Alex Carter Legal"} required />
              {isFirm ? (
                <label className="block text-sm font-medium text-mercy-navy">
                  Attorney seats
                  <Input
                    className="mt-2 h-11"
                    min={2}
                    type="number"
                    value={seats}
                    onChange={(event) => setSeats(Math.max(2, Number(event.target.value || 2)))}
                    required
                  />
                </label>
              ) : null}
              <Field label="Practice areas" value={practiceAreas} onChange={setPracticeAreas} placeholder={practicePlaceholder} required wide />
              <Field label="Jurisdiction focus" value={jurisdictionFocus} onChange={setJurisdictionFocus} placeholder="District of Columbia" required wide />

              <label className="flex gap-3 rounded-md border bg-slate-50 p-3 text-sm text-slate-700 md:col-span-2">
                <input className="mt-1 size-4" type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} required />
                <span>I agree to Mercy&apos;s Terms, Privacy Policy, and beta AI responsibility notice.</span>
              </label>
              <label className="flex gap-3 rounded-md border bg-slate-50 p-3 text-sm text-slate-700 md:col-span-2">
                <input className="mt-1 size-4" type="checkbox" checked={responsibilityAccepted} onChange={(event) => setResponsibilityAccepted(event.target.checked)} required />
                <span>Mercy assists attorney-supervised legal work. Attorneys remain responsible for reviewing outputs.</span>
              </label>
              {error ? <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 md:col-span-2">{error}</div> : null}
              <Button type="submit" variant="gold" className="h-12 w-full md:col-span-2" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {busy ? "Opening checkout..." : "Continue to payment"}
              </Button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  wide,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
  wide?: boolean;
}) {
  return (
    <label className={`block text-sm font-medium text-mercy-navy ${wide ? "md:col-span-2" : ""}`}>
      {label}
      <Input
        className="mt-2 h-11"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}
