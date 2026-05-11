import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  LockKeyhole,
  MessageSquareText,
  MonitorDown,
  Scale,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function HeroSection() {
  return (
    <section className="relative min-h-[92vh] overflow-hidden bg-mercy-navy text-white">
      <div className="navy-grid absolute inset-0 opacity-70" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#f7f8fb] to-transparent" aria-hidden />
      <div className="absolute left-1/2 top-24 h-[560px] w-[920px] -translate-x-1/2 rounded-[40px] border border-white/10 bg-white/[0.04] shadow-[0_40px_160px_rgba(0,0,0,0.35)] backdrop-blur-sm" aria-hidden />
      <div className="absolute right-16 top-40 hidden h-40 w-40 rounded-full border border-[#d4af37]/20 bg-[#d4af37]/8 blur-sm lg:block" aria-hidden />

      <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-md bg-white text-mercy-navy shadow-lg">
            <Scale className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-normal">Mercy.ai</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-white/74 md:flex">
          <a className="transition hover:text-white" href="#features">
            Platform
          </a>
          <a className="transition hover:text-white" href="#download">
            Plugin
          </a>
          <a className="transition hover:text-white" href="#testimonials">
            Firms
          </a>
          <a className="transition hover:text-white" href="#pricing">
            Pricing
          </a>
        </nav>
        <Button asChild variant="gold" size="sm">
          <Link href="/sign-in">
            Sign in
            <ArrowRight />
          </Link>
        </Button>
      </header>

      <div className="relative z-10 mx-auto grid max-w-7xl px-6 pb-24 pt-14 lg:px-8">
        <div className="max-w-4xl">
          <Badge variant="gold" className="mb-6 border-white/10 bg-white/10 text-[#f5df8a] backdrop-blur">
            Built for Washington DC small firms
          </Badge>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] tracking-normal text-white md:text-7xl">
            AI legal workbench and Word plugin for DC small firms
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/72 md:text-xl">
            Mercy.ai gives solo attorneys and boutique teams a premium legal AI workspace plus a Microsoft Word plugin for DC-focused drafting, review, and matter context.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="gold" size="lg">
              <a href="#download">
                Download Plugin
                <MonitorDown />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-white/18 bg-white/8 text-white hover:bg-white/14">
              <Link href="/sign-up">
                Try for Free
                <Sparkles />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="lg" className="text-white/80 hover:bg-white/10 hover:text-white">
              <Link href="#pricing">
                Book a Demo
                <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap gap-4 text-sm text-white/68">
            {["Word-native drafting", "Attorney-controlled", "Stripe checkout ready"].map((item) => (
              <span className="flex items-center gap-2" key={item}>
                <CheckCircle2 className="size-4 text-[#f0d46a]" />
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="relative mt-16 min-h-[280px] lg:min-h-[360px]" aria-label="Mercy.ai product preview">
          <div className="absolute left-0 top-2 w-full max-w-5xl rounded-lg border border-white/12 bg-white/[0.08] p-3 shadow-[0_35px_100px_rgba(0,0,0,0.34)] backdrop-blur-xl lg:left-24">
            <div className="grid gap-3 lg:grid-cols-[240px_1fr_300px]">
              <div className="rounded-md border border-white/10 bg-[#081124]/90 p-4">
                <div className="mb-5 h-2 w-24 rounded-full bg-white/16" />
                {["Word Plugin", "Assistant", "Document Vault", "DC Clauses"].map((item, index) => (
                  <div
                    key={item}
                    className={`mb-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm ${index === 0 ? "bg-white text-mercy-navy" : "text-white/68"}`}
                  >
                    <span className="size-2 rounded-full bg-[#d4af37]" />
                    {item}
                  </div>
                ))}
              </div>
              <div className="rounded-md border border-white/10 bg-white p-5 text-mercy-navy">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Matter AI</p>
                    <h2 className="mt-2 text-2xl font-semibold">Word clause risk review</h2>
                  </div>
                  <Badge variant="risk">Risk 72</Badge>
                </div>
                <div className="mt-6 space-y-3">
                  {["Live Word risk highlight", "DC venue clause suggestion", "Report generated into document"].map((item) => (
                    <div className="flex items-start gap-3 rounded-md border bg-[#fbfcfe] p-3" key={item}>
                      <FileText className="mt-0.5 size-4 text-[#b48b13]" />
                      <p className="text-sm leading-6 text-[#2c3650]">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-white/10 bg-[#f7f8fb] p-4 text-mercy-navy">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MessageSquareText className="size-4 text-[#b48b13]" />
                  Assistant
                </div>
                <div className="mt-5 rounded-md bg-white p-3 text-sm leading-6 shadow-sm">
                  The proposed amendment is workable, but counsel should narrow indemnity to tenant-controlled acts and add DC venue language.
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <LockKeyhole className="size-3.5" />
                  Firm data stays compartmentalized
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
