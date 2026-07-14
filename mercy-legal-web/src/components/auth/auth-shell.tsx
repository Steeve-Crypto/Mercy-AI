"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Scale, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeInternalNextPath } from "@/lib/auth/safe-next";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

type AuthShellProps = {
  mode: "sign-in" | "sign-up";
};

export function AuthShell({ mode }: AuthShellProps) {
  const isSignUp = mode === "sign-up";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firmName, setFirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const next = safeInternalNextPath(searchParams.get("next"));

    if (!isSupabaseConfigured()) {
      router.push(next as Route);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase Auth is not configured for this environment.");
      return;
    }

    setBusy(true);
    const response = isSignUp
      ? await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              firm_name: firmName,
            },
          },
        })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);

    if (response.error) {
      setError(response.error.message);
      return;
    }
    // Prefer dashboard for local work; honor safe internal next paths.
    const destination = next && next !== "/dashboard" ? next : "/dashboard";
    router.push(destination as Route);
    router.refresh();
  }

  return (
    <main className="grid min-h-screen bg-[#f7f8fb] lg:grid-cols-[0.9fr_1.1fr]">
      <section className="relative hidden overflow-hidden bg-mercy-navy p-10 text-white lg:block">
        <div className="navy-grid absolute inset-0 opacity-60" aria-hidden />
        <Link href="/" className="relative z-10 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-white text-mercy-navy">
            <Scale className="size-5" />
          </span>
          <span className="text-lg font-semibold">Mercy.ai</span>
        </Link>
        <div className="relative z-10 mt-28 max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#f0d46a]">
            Secure firm access
          </p>
          <h1 className="mt-5 text-5xl font-semibold leading-tight tracking-normal">
            Enter the DC legal AI workspace.
          </h1>
          <p className="mt-5 text-sm leading-7 text-white/68">
            Auth pages are ready for Clerk/Auth.js connection. The current experience keeps the flow visible while provider keys are added.
          </p>
          <div className="mt-8 space-y-4">
            {["Matter-isolated workspace", "Word plugin download access", "Stripe subscription checkout"].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-white/78">
                <CheckCircle2 className="size-4 text-[#f0d46a]" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Button asChild variant="ghost" className="mb-8">
            <Link href="/">
              <ArrowLeft />
              Back to home
            </Link>
          </Button>
          <div className="rounded-lg border bg-white p-7 shadow-[0_24px_80px_rgba(10,20,40,0.08)]">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-md bg-[#f5ecd0] text-[#9b740e]">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-mercy-navy">
                  {isSignUp ? "Create your account" : "Welcome back"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {isSignUp ? "Start with Mercy.ai in private beta." : "Sign in to continue to your matters."}
                </p>
              </div>
            </div>

            <form onSubmit={submit} className="mt-8 space-y-4">
              {isSignUp ? (
                <label className="block text-sm font-medium text-mercy-navy">
                  Firm name
                  <Input
                    value={firmName}
                    onChange={(event) => setFirmName(event.target.value)}
                    className="mt-2 h-11"
                    placeholder="Capitol Hill Legal"
                  />
                </label>
              ) : null}
              <label className="block text-sm font-medium text-mercy-navy">
                Work email
                <Input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 h-11"
                  placeholder="attorney@firm.com"
                  type="email"
                  required
                />
              </label>
              <label className="block text-sm font-medium text-mercy-navy">
                Password
                <Input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 h-11"
                  placeholder="Enter password"
                  type="password"
                  required
                />
              </label>
              {error ? <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
              <Button type="submit" variant="gold" className="w-full" disabled={busy}>
                {busy ? "Working..." : isSignUp ? "Create account" : "Sign in"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {isSignUp ? "Already have an account?" : "New to Mercy.ai?"}{" "}
              <Link className="font-medium text-mercy-navy underline underline-offset-4" href={isSignUp ? "/sign-in" : "/sign-up"}>
                {isSignUp ? "Sign in" : "Create account"}
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
