"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Scale, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/surface";
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
    router.push(next as Route);
    router.refresh();
  }

  return (
    <main className="grid min-h-screen bg-[var(--mercy-bg)] lg:grid-cols-[0.95fr_1.05fr]">
      <section className="relative hidden overflow-hidden bg-[var(--mercy-navy)] p-10 text-white lg:block dark:bg-[#070c14]">
        <div className="navy-grid absolute inset-0 opacity-50" aria-hidden />
        <Link href="/" className="relative z-10 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-white text-[var(--mercy-navy)]">
            <Scale className="size-5" />
          </span>
          <span className="text-lg font-semibold">Mercy Legal AI</span>
        </Link>
        <div className="relative z-10 mt-24 max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--mercy-gold)]">Secure attorney access</p>
          <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
            Enter the D.C. legal AI workspace.
          </h1>
          <p className="mt-5 text-sm leading-7 text-white/70">
            Sign in to matter-scoped research, drafting, Vault documents, citations, and attorney-review controls. Workspace access requires an active provisioned account.
          </p>
          <div className="mt-8 space-y-3">
            {[
              "Server-owned tenant and firm authorization",
              "Matter isolation with attorney-review signals",
              "Word and Outlook workflows on the same account model",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-white/80">
                <CheckCircle2 className="size-4 text-[var(--mercy-gold)]" />
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
          <div className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-7 shadow-[var(--mercy-shadow-lg)]">
            <div className="flex items-start gap-3">
              <div className="grid size-11 place-items-center rounded-md border border-[var(--mercy-border)] bg-[var(--mercy-gold-soft)] text-[var(--mercy-gold-deep)]">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-[var(--mercy-fg-strong)]">
                  {isSignUp ? "Create your account" : "Welcome back"}
                </h2>
                <p className="mt-1 text-sm text-[var(--mercy-fg-muted)]">
                  {isSignUp
                    ? "Start Mercy beta signup. Paid plans and admin provisioning activate the workspace."
                    : "Sign in to continue to your matters and Vault."}
                </p>
              </div>
            </div>

            {!isSupabaseConfigured() ? (
              <div className="mt-5">
                <Chip tone="warning">Local auth mode — provider not configured</Chip>
              </div>
            ) : null}

            <form onSubmit={submit} className="mt-8 space-y-4">
              {isSignUp ? (
                <label className="block text-sm font-medium text-[var(--mercy-fg-strong)]">
                  Display firm / practice name
                  <Input
                    value={firmName}
                    onChange={(event) => setFirmName(event.target.value)}
                    className="mt-2 h-11"
                    placeholder="Capitol Hill Legal"
                  />
                </label>
              ) : null}
              <label className="block text-sm font-medium text-[var(--mercy-fg-strong)]">
                Work email
                <Input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 h-11"
                  placeholder="attorney@firm.com"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
              <label className="block text-sm font-medium text-[var(--mercy-fg-strong)]">
                Password
                <Input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 h-11"
                  placeholder="Enter password"
                  type="password"
                  required
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                />
              </label>
              {error ? (
                <div className="rounded-md border border-[color-mix(in_srgb,var(--mercy-danger)_30%,var(--mercy-border))] bg-[var(--mercy-danger-soft)] p-3 text-sm text-[var(--mercy-danger)]">
                  {error}
                </div>
              ) : null}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Working..." : isSignUp ? "Continue" : "Sign in"}
              </Button>
            </form>

            <div className="mt-6 space-y-3 text-center text-sm text-[var(--mercy-fg-muted)]">
              <p>
                {isSignUp ? "Already have an account?" : "New to Mercy?"}{" "}
                <Link className="font-medium text-[var(--mercy-fg-strong)] underline underline-offset-4" href={isSignUp ? "/sign-in" : "/sign-up"}>
                  {isSignUp ? "Sign in" : "Create account"}
                </Link>
              </p>
              {isSignUp ? (
                <p>
                  Prefer plan selection first?{" "}
                  <Link className="font-medium text-[var(--mercy-fg-strong)] underline underline-offset-4" href="/sign-up/solo">
                    Solo
                  </Link>
                  {" · "}
                  <Link className="font-medium text-[var(--mercy-fg-strong)] underline underline-offset-4" href="/sign-up/firm">
                    Firm
                  </Link>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
