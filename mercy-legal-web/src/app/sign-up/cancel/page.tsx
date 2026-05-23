import Link from "next/link";
import { ArrowLeft, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SignupCancelPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb] px-6 py-12">
      <section className="w-full max-w-xl rounded-lg border bg-white p-8 text-center shadow-[0_24px_80px_rgba(10,20,40,0.08)]">
        <div className="mx-auto grid size-14 place-items-center rounded-md bg-[#f5ecd0] text-[#9b740e]">
          <CreditCard className="size-7" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold text-mercy-navy">Payment canceled</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Your Mercy workspace was not activated because checkout did not complete. You can return to plan selection when you are ready.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild variant="gold">
            <Link href="/sign-up">Return to signup</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft />
              Back to home
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
