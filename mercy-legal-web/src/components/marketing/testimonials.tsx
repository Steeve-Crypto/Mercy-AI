import { Quote } from "lucide-react";
import { testimonials } from "@/lib/data";
import { AnimatedShell } from "@/components/marketing/animated-shell";

export function Testimonials() {
  return (
    <section id="testimonials" className="bg-white px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <AnimatedShell className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a37f12]">Early firm feedback</p>
            <h2 className="mt-4 max-w-2xl text-4xl font-semibold tracking-normal text-mercy-navy">
              Built for attorneys who need leverage, not complexity.
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">
            Placeholder testimonials for the launch site, written in the voice of DC small firm attorneys.
          </p>
        </AnimatedShell>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {testimonials.map((testimonial, index) => (
            <AnimatedShell
              key={testimonial.name}
              transition={{ delay: index * 0.08, duration: 0.6 }}
              className="rounded-lg border bg-[#fbfcfe] p-7 shadow-[0_16px_50px_rgba(10,20,40,0.05)]"
            >
              <Quote className="size-6 text-[#b48b13]" />
              <p className="mt-7 text-lg leading-8 text-mercy-navy">{testimonial.quote}</p>
              <div className="mt-8">
                <p className="font-semibold text-mercy-navy">{testimonial.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{testimonial.role}</p>
              </div>
            </AnimatedShell>
          ))}
        </div>
      </div>
    </section>
  );
}
