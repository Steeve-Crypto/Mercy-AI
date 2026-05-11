import Link from "next/link";
import { ArrowLeft, CheckCircle2, Scale, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AuthShellProps = {
  mode: "sign-in" | "sign-up";
};

export function AuthShell({ mode }: AuthShellProps) {
  const isSignUp = mode === "sign-up";

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

            <form className="mt-8 space-y-4">
              {isSignUp ? (
                <label className="block text-sm font-medium text-mercy-navy">
                  Firm name
                  <Input
                    className="mt-2 h-11"
                    placeholder="Capitol Hill Legal"
                  />
                </label>
              ) : null}
              <label className="block text-sm font-medium text-mercy-navy">
                Work email
                <Input
                  className="mt-2 h-11"
                  placeholder="attorney@firm.com"
                  type="email"
                />
              </label>
              <label className="block text-sm font-medium text-mercy-navy">
                Password
                <Input
                  className="mt-2 h-11"
                  placeholder="Enter password"
                  type="password"
                />
              </label>
              <Button asChild variant="gold" className="w-full">
                <Link href="/dashboard">{isSignUp ? "Create account" : "Sign in"}</Link>
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
