import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SignupCheckoutPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb] px-6 py-12">
      <section className="w-full max-w-xl rounded-lg border bg-white p-8 text-center shadow-[0_24px_80px_rgba(10,20,40,0.08)]">
        <div className="mx-auto grid size-14 place-items-center rounded-md bg-[#f5ecd0] text-[#9b740e]">
          <CreditCard className="size-7" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold text-mercy-navy">Checkout starts from signup</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Choose Solo or Small Firm first so Mercy can collect the required workspace, seat, and beta acknowledgment details before opening Stripe Checkout.
        </p>
        <Button asChild variant="gold" className="mt-7">
          <Link href="/sign-up">Choose a plan</Link>
        </Button>
      </section>
    </main>
  );
}
