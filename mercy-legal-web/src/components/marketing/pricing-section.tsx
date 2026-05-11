import { Check } from "lucide-react";
import { pricingTiers } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { AnimatedShell } from "@/components/marketing/animated-shell";
import { CheckoutButton } from "@/components/marketing/checkout-button";

export function PricingSection() {
  return (
    <section id="pricing" className="bg-[#f7f8fb] px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <AnimatedShell className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a37f12]">Pricing</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-normal text-mercy-navy md:text-5xl">
            Plans sized for small firms.
          </h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Start with the workflow you need today, then expand as Mercy.ai becomes part of your firm operating system.
          </p>
        </AnimatedShell>

        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {pricingTiers.map((tier, index) => (
            <AnimatedShell
              key={tier.name}
              transition={{ delay: index * 0.08, duration: 0.6 }}
              className={`relative rounded-lg border bg-white p-7 shadow-[0_18px_60px_rgba(10,20,40,0.06)] ${tier.featured ? "border-[#d4af37] ring-1 ring-[#d4af37]/40" : ""}`}
            >
              {tier.featured ? (
                <Badge variant="gold" className="absolute right-6 top-6">
                  Recommended
                </Badge>
              ) : null}
              <h3 className="text-xl font-semibold text-mercy-navy">{tier.name}</h3>
              <div className="mt-7 flex items-end gap-2">
                <span className="text-5xl font-semibold tracking-normal text-mercy-navy">{tier.price}</span>
                {tier.price !== "Custom" ? <span className="pb-2 text-sm text-muted-foreground">/mo</span> : null}
              </div>
              <p className="mt-5 min-h-12 text-sm leading-6 text-muted-foreground">{tier.description}</p>
              <ul className="mt-7 space-y-3">
                {tier.features.map((feature) => (
                  <li className="flex items-center gap-3 text-sm text-mercy-navy" key={feature}>
                    <Check className="size-4 text-[#a37f12]" />
                    {feature}
                  </li>
                ))}
              </ul>
              <CheckoutButton
                plan={tier.id}
                label={tier.featured ? "Start checkout" : tier.price === "Custom" ? "Book a Demo" : "Choose plan"}
                featured={tier.featured}
                className="mt-8 w-full"
              />
            </AnimatedShell>
          ))}
        </div>
      </div>
    </section>
  );
}
