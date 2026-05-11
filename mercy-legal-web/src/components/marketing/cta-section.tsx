import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CtaSection() {
  return (
    <section className="bg-white px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-lg bg-mercy-navy px-8 py-14 text-white shadow-[0_30px_100px_rgba(10,20,40,0.22)] lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <div className="flex size-12 items-center justify-center rounded-md bg-white text-mercy-navy">
              <ShieldCheck className="size-5" />
            </div>
            <h2 className="mt-7 max-w-3xl text-4xl font-semibold tracking-normal md:text-5xl">
              Bring AI into your DC practice without making the work feel heavier.
            </h2>
          </div>
          <div className="lg:justify-self-end">
            <p className="max-w-md text-sm leading-7 text-white/70">
              Launch the product workspace, review the dashboard, and see how the document vault, assistant, and analyzer work together.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="gold" size="lg">
                <Link href="/sign-up">
                  Create account
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="border-white/18 bg-white/8 text-white hover:bg-white/14">
                <a href="mailto:demo@mercy.ai">Book a Demo</a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
