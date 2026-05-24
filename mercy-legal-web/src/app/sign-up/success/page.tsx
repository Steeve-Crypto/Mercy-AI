import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabaseServerConfigured } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const steps = ["Plan", "Account", "Payment", "Workspace"];

async function hasActiveWorkspace() {
  if (!supabaseServerConfigured()) return false;
  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // Success page only reads auth state.
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const metadata = user?.app_metadata || {};
  return Boolean(metadata.tenant_id && ACTIVE_SUBSCRIPTION_STATUSES.has(String(metadata.subscription_status || "")));
}

export default async function SignupSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  const activeWorkspace = await hasActiveWorkspace();
  const checkoutSessionId = typeof sessionId === "string" && sessionId.startsWith("cs_") ? sessionId : null;
  const hasCheckoutSession = Boolean(checkoutSessionId);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb] px-6 py-12">
      <section className="w-full max-w-xl rounded-lg border bg-white p-8 text-center shadow-[0_24px_80px_rgba(10,20,40,0.08)]">
        <Stepper />
        <div className="mx-auto grid size-14 place-items-center rounded-md bg-[#f5ecd0] text-[#9b740e]">
          {hasCheckoutSession ? <CheckCircle2 className="size-7" /> : <AlertCircle className="size-7" />}
        </div>
        <h1 className="mt-6 text-3xl font-semibold text-mercy-navy">
          {hasCheckoutSession ? "Subscription processing" : "We could not confirm a checkout session."}
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          {hasCheckoutSession
            ? "Mercy is confirming your subscription. This can take a few moments."
            : "Please return to signup and complete Stripe Checkout before opening the workspace."}
        </p>
        {hasCheckoutSession ? (
          <div className="mt-6 flex items-center justify-center gap-2 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
            <Loader2 className="size-4 animate-spin" />
            Workspace activation may take a few moments.
          </div>
        ) : null}
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {activeWorkspace ? (
            <Button asChild variant="gold">
              <Link href="/dashboard">Go to workspace</Link>
            </Button>
          ) : null}
          <Button asChild variant={activeWorkspace ? "outline" : "gold"}>
            <Link href={checkoutSessionId ? `/sign-up/success?session_id=${encodeURIComponent(checkoutSessionId)}` : "/sign-up"}>
              <RefreshCw />
              Check activation
            </Link>
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
