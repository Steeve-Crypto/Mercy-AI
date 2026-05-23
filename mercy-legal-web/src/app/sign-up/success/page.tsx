import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SignupSuccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb] px-6 py-12">
      <section className="w-full max-w-xl rounded-lg border bg-white p-8 text-center shadow-[0_24px_80px_rgba(10,20,40,0.08)]">
        <div className="mx-auto grid size-14 place-items-center rounded-md bg-[#f5ecd0] text-[#9b740e]">
          <CheckCircle2 className="size-7" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold text-mercy-navy">Payment received</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Mercy is confirming your Stripe subscription and provisioning your tenant workspace. Once the webhook updates your account, sign in and continue to the workspace.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
          <Loader2 className="size-4 animate-spin" />
          Workspace activation may take a few moments.
        </div>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild variant="gold">
            <Link href="/dashboard">Go to workspace</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
