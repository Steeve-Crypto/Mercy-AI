import { ArrowUpRight, Scale } from "lucide-react";
import { features } from "@/lib/data";
import { AnimatedShell } from "@/components/marketing/animated-shell";

export function FeatureShowcase() {
  return (
    <section id="features" className="bg-[#f7f8fb] px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <AnimatedShell className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a37f12]">Platform</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-normal text-mercy-navy md:text-5xl">
            Powerful legal AI, shaped for the pace of small firm practice.
          </h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Mercy.ai keeps the interface quiet while giving attorneys fast access to document intelligence, clause support, and matter memory.
          </p>
        </AnimatedShell>

        <div className="mt-14 grid gap-4 md:grid-cols-2">
          {features.map((feature, index) => (
            <AnimatedShell
              key={feature.title}
              transition={{ delay: index * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="group rounded-lg border bg-white p-7 shadow-[0_18px_60px_rgba(10,20,40,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_80px_rgba(10,20,40,0.1)]"
            >
              <div className="flex items-start justify-between gap-6">
                <div className="flex size-12 items-center justify-center rounded-md bg-[#f5ecd0] text-[#9b740e]">
                  <feature.icon className="size-5" />
                </div>
                <ArrowUpRight className="size-5 text-muted-foreground transition group-hover:text-[#9b740e]" />
              </div>
              <h3 className="mt-8 text-xl font-semibold text-mercy-navy">{feature.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{feature.description}</p>
            </AnimatedShell>
          ))}
        </div>

        <AnimatedShell className="mt-16 overflow-hidden rounded-lg bg-mercy-navy text-white shadow-[0_30px_90px_rgba(10,20,40,0.18)]">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
            <div className="p-8 lg:p-10">
              <div className="flex size-12 items-center justify-center rounded-md bg-white text-mercy-navy">
                <Scale className="size-5" />
              </div>
              <h3 className="mt-7 text-3xl font-semibold">Designed around attorney judgment.</h3>
              <p className="mt-4 max-w-xl text-sm leading-7 text-white/70">
                The product highlights reasoning, source context, and risk signals so lawyers can move faster without losing control of the work.
              </p>
            </div>
            <div className="border-t border-white/10 p-4 lg:border-l lg:border-t-0">
              <div className="grid gap-3 sm:grid-cols-3">
                {["Question", "Evidence", "Draft"].map((label, index) => (
                  <div key={label} className="rounded-md border border-white/10 bg-white/8 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#f0d46a]">Step {index + 1}</p>
                    <p className="mt-14 text-lg font-medium">{label}</p>
                    <p className="mt-2 text-xs leading-5 text-white/58">
                      Matter-aware support with clean citations and practical next actions.
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </AnimatedShell>
      </div>
    </section>
  );
}
