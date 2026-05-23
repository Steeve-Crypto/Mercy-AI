"use client";

import Link from "next/link";
import type React from "react";
import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  BriefcaseBusiness,
  Building2,
  Check,
  FileCheck2,
  FileText,
  Fingerprint,
  Gavel,
  Layers3,
  LockKeyhole,
  MailCheck,
  Menu,
  MessageSquareText,
  Monitor,
  PanelRight,
  Scale,
  SearchCheck,
  ShieldCheck,
  UserCheck,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const routes = {
  home: "/",
  howItWorks: "/how-it-works",
  useCases: "/use-cases",
  security: "/security",
  pricing: "/pricing",
  resources: "/resources",
  trust: "/trust",
  contact: "/contact",
  signIn: "/sign-in",
  getStarted: "/sign-up",
};

const navItems = [
  ["Home", routes.home],
  ["How it works", routes.howItWorks],
  ["Use cases", routes.useCases],
  ["Security", routes.security],
  ["Pricing", routes.pricing],
  ["Resources", routes.resources],
  ["Trust", routes.trust],
  ["Contact / Demo", routes.contact],
] as const;

type MarketingShellProps = {
  children: React.ReactNode;
};

type IconType = LucideIcon;

type FeatureItem = {
  title: string;
  description: string;
  icon: IconType;
};

function LogoMark() {
  return (
    <Link href={routes.home} className="flex items-center gap-3">
      <span className="flex size-10 items-center justify-center rounded-md bg-mercy-navy text-white shadow-sm">
        <Scale className="size-5" />
      </span>
      <span>
        <span className="block text-base font-semibold text-mercy-navy">Mercy</span>
        <span className="block text-xs text-slate-500">Legal AI</span>
      </span>
    </Link>
  );
}

export function MarketingShell({ children }: MarketingShellProps) {
  return (
    <div className="min-h-screen bg-[#f7f8fb] text-mercy-navy">
      <MarketingHeader />
      {children}
      <Footer />
    </div>
  );
}

function MarketingHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === routes.home ? pathname === routes.home : pathname.startsWith(href));
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/92 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
        <LogoMark />
        <nav className="hidden items-center gap-5 text-sm text-slate-600 xl:flex" aria-label="Marketing navigation">
          {navItems.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn("rounded-md px-2 py-1 transition hover:text-mercy-navy", isActive(href) && "bg-slate-100 font-semibold text-mercy-navy")}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href={routes.signIn}>Sign in</Link>
          </Button>
          <Button asChild variant="gold" size="sm" className="hidden sm:inline-flex">
            <Link href={routes.getStarted}>Get started</Link>
          </Button>
          <button
            type="button"
            aria-label={open ? "Close marketing menu" : "Open marketing menu"}
            aria-expanded={open}
            className="inline-flex size-10 items-center justify-center rounded-md border border-slate-200 bg-white xl:hidden"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open ? (
        <div className="border-t border-slate-200 bg-white px-5 py-4 shadow-lg xl:hidden">
          <nav className="mx-auto grid max-w-7xl gap-2" aria-label="Mobile marketing navigation">
            {[...navItems, ["Sign in", routes.signIn], ["Get started", routes.getStarted]].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn("rounded-md px-3 py-3 text-sm text-slate-700", isActive(href) && "bg-slate-100 font-semibold text-mercy-navy")}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}

function Footer() {
  const groups = [
    ["Product", [["How it Works", routes.howItWorks], ["Use Cases", routes.useCases], ["Pricing", routes.pricing]]],
    ["Trust", [["Security", routes.security], ["Trust", routes.trust], ["Contact", routes.contact]]],
    ["Resources", [["Guides", routes.resources], ["Support", routes.contact], ["Updates", routes.resources]]],
    ["Legal", [["Terms request", routes.contact], ["Privacy request", routes.contact], ["DPA request", routes.contact]]],
  ] as const;
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 lg:grid-cols-[1.2fr_2fr] lg:px-8">
        <div>
          <LogoMark />
          <p className="mt-5 max-w-sm text-sm leading-6 text-slate-600">
            Secure legal AI workflows for attorneys who need speed, source visibility, and control across web, Word, and Outlook.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <TrustBadge>Built for attorney-supervised legal work</TrustBadge>
            <TrustBadge>Your documents should stay your documents</TrustBadge>
          </div>
        </div>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map(([title, links]) => (
            <div key={title}>
              <h3 className="text-sm font-semibold">{title}</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                {links.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="hover:text-mercy-navy">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}

function TrustBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
      <BadgeCheck className="size-3.5 text-[#a37f12]" />
      {children}
    </span>
  );
}

function Hero({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-mercy-navy text-white">
      <div className="navy-grid absolute inset-0 opacity-60" aria-hidden />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#f0df9b]">{eyebrow}</p>
          <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-tight tracking-normal md:text-6xl">{title}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/76">{description}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="gold" size="lg">
              <Link href={routes.getStarted}>
                Get started
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-white/18 bg-white/8 text-white hover:bg-white/14">
              <Link href={routes.contact}>Request demo</Link>
            </Button>
          </div>
        </div>
        {children ?? <ProductPreview />}
      </div>
    </section>
  );
}

function ProductPreview() {
  return (
    <div className="rounded-lg border border-white/12 bg-white/[0.08] p-3 shadow-[0_32px_90px_rgba(0,0,0,0.28)] backdrop-blur">
      <div className="grid gap-3 rounded-md bg-[#f8fafc] p-3 text-mercy-navy">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Matter workspace</p>
            <h2 className="mt-1 text-xl font-semibold">Smith v. District Agency</h2>
          </div>
          <span className="rounded-md bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">Tenant scoped</span>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_0.8fr]">
          <div className="space-y-3">
            {["Draft first version", "Review selected Word text", "Check citation/source visibility"].map((item) => (
              <div key={item} className="rounded-md border border-slate-200 bg-white p-4 text-sm shadow-sm">
                <div className="flex items-center gap-2 font-medium">
                  <Check className="size-4 text-[#a37f12]" />
                  {item}
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <PanelRight className="size-4 text-[#a37f12]" />
              Reliability Panel
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              {["Citations visible", "D.C. grounding noted", "Attorney review required", "Trace ID attached"].map((item) => (
                <div key={item} className="flex items-center justify-between gap-3">
                  <span>{item}</span>
                  <span className="size-2 rounded-full bg-[#d4af37]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a37f12]">{eyebrow}</p>
      <h2 className="mt-4 text-3xl font-semibold tracking-normal text-mercy-navy md:text-5xl">{title}</h2>
      <p className="mt-5 text-base leading-7 text-slate-600 md:text-lg">{description}</p>
    </div>
  );
}

function FeatureGrid({ items, columns = "lg:grid-cols-4" }: { items: FeatureItem[]; columns?: string }) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-2", columns)}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.title} className="rounded-md">
            <CardContent className="p-6">
              <Icon className="size-5 text-[#a37f12]" />
              <h3 className="mt-5 text-lg font-semibold">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function CtaBand({ title = "Bring Mercy into your legal workflow.", description = "Start with the beta workspace, then connect Word and Outlook for attorney-supervised matter work." }) {
  return (
    <section className="px-5 py-20 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-lg bg-mercy-navy px-6 py-12 text-white shadow-[0_28px_90px_rgba(10,20,40,0.2)] md:px-10">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="text-3xl font-semibold">{title}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">{description}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="gold">
              <Link href={routes.getStarted}>Get started</Link>
            </Button>
            <Button asChild variant="outline" className="border-white/20 bg-white/8 text-white hover:bg-white/14">
              <Link href={routes.contact}>Request demo</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

const problemItems: FeatureItem[] = [
  { title: "Matter overload", description: "Keep requests tied to a matter instead of scattering context across disconnected chats.", icon: BriefcaseBusiness },
  { title: "Drafting and review bottlenecks", description: "Move faster on first versions, issue spotting, and document review while preserving attorney judgment.", icon: FileText },
  { title: "Citation and source trust", description: "Expose citations, source status, D.C. grounding, and review flags instead of hiding uncertainty.", icon: SearchCheck },
  { title: "Office workflow fragmentation", description: "Use Mercy from the Web Workspace, Microsoft Word, and Microsoft Outlook.", icon: Layers3 },
];

const workflowSteps = [
  "Create or select a matter",
  "Add documents and context",
  "Work in Web, Word, or Outlook",
  "Review the Reliability Panel",
  "Attorney finalizes",
];

export function HomeMarketingPage() {
  return (
    <MarketingShell>
      <main>
        <Hero
          eyebrow="D.C.-focused legal AI beta"
          title="Legal AI for attorneys who need speed without losing control."
          description="Mercy combines a secure web workspace with Word and Outlook add-ins, matter-centered context, D.C.-focused legal workflows, and reliability checks designed for attorney review."
        />
        <section className="px-5 py-16 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
            {[
              ["Web Workspace", "Matter-centered chat, drafting, document review, templates, and reliability metadata."],
              ["Word Add-in", "Draft and review selected text inside normal Word workflows."],
              ["Outlook Add-in", "Analyze selected message text and draft attorney-reviewed responses from Outlook."],
            ].map(([title, description]) => (
              <Card key={title} className="rounded-md">
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold">{title}</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
        <section className="bg-white px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionIntro
              eyebrow="Why Mercy"
              title="Built around the points where legal AI usually loses control."
              description="Mercy keeps the workflow matter-centered, attorney-supervised, and visible across the places lawyers already work."
            />
            <div className="mt-12">
              <FeatureGrid items={problemItems} />
            </div>
          </div>
        </section>
        <WorkflowPreview />
        <ReliabilityPreview />
        <section className="px-5 py-20 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 rounded-lg border border-slate-200 bg-white p-8 shadow-sm lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a37f12]">Beta pricing</p>
              <h2 className="mt-3 text-3xl font-semibold">Solo and small-firm plans without checkout on the homepage.</h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
                Solo practitioners start at $98/month. Small firms use the same attorney-seat price with a two-seat minimum.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href={routes.pricing}>
                View pricing
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
        <CtaBand />
      </main>
    </MarketingShell>
  );
}

function WorkflowPreview() {
  return (
    <section className="px-5 py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionIntro
          eyebrow="How Mercy works"
          title="A practical workflow from matter setup to attorney approval."
          description="Mercy is designed to support legal work without removing the final professional decision from counsel."
        />
        <div className="mt-12 grid gap-3 md:grid-cols-5">
          {workflowSteps.map((step, index) => (
            <Link key={step} href={routes.howItWorks} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#d4af37] hover:shadow-md">
              <span className="text-xs font-semibold text-[#a37f12]">0{index + 1}</span>
              <p className="mt-3 text-sm font-semibold leading-6">{step}</p>
            </Link>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Button asChild variant="outline">
            <Link href={routes.howItWorks}>
              See the full workflow
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function ReliabilityPreview() {
  return (
    <section className="bg-white px-5 py-20 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a37f12]">Reliability Panel</p>
          <h2 className="mt-4 text-3xl font-semibold md:text-5xl">Review signals before client-facing use.</h2>
          <p className="mt-5 text-base leading-7 text-slate-600">
            Mercy surfaces reliability details so attorneys can verify output instead of accepting a black-box answer.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {["Citations", "Confidence", "D.C. grounding", "Attorney-review flag", "Trace/request ID", "Source visibility"].map((item) => (
            <Link key={item} href={routes.security} className="rounded-md border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:border-[#d4af37] hover:bg-white">
              <p className="text-sm font-semibold">{item}</p>
            </Link>
          ))}
        </div>
        <div className="lg:col-start-2">
          <Button asChild variant="outline">
            <Link href={routes.security}>
              Review security and reliability posture
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function HowItWorksPage() {
  const steps: FeatureItem[] = [
    { title: "1. Create or select a matter", description: "Start from the workspace so requests stay tied to the right tenant, matter, and context.", icon: BriefcaseBusiness },
    { title: "2. Upload or attach documents", description: "Bring in relevant materials for review, drafting, and source-aware work.", icon: FileCheck2 },
    { title: "3. Ask Mercy to work", description: "Analyze, draft, cite, review, or organize legal content with attorney review required.", icon: MessageSquareText },
    { title: "4. Use Office add-ins", description: "Move between Web, Word, and Outlook without abandoning normal attorney workflow.", icon: Monitor },
    { title: "5. Check reliability", description: "Review citations, grounding, confidence, trace IDs, and flags before relying on output.", icon: PanelRight },
    { title: "6. Attorney finalizes", description: "Mercy assists. The attorney verifies, edits, and approves.", icon: UserCheck },
  ];
  return (
    <MarketingShell>
      <main>
        <Hero
          eyebrow="Workflow"
          title="How Mercy keeps legal AI inside attorney-controlled work."
          description="Mercy connects matter context, documents, Web Workspace actions, Word drafting, Outlook review, and reliability signals into one workflow."
        />
        <section className="px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <FeatureGrid items={steps} columns="lg:grid-cols-3" />
          </div>
        </section>
        <SurfaceSections />
        <section className="px-5 py-16 lg:px-8">
          <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
            {[
              ["Explore use cases", routes.useCases],
              ["Read security posture", routes.security],
              ["View beta pricing", routes.pricing],
            ].map(([label, href]) => (
              <Link key={href} href={href} className="rounded-md border border-slate-200 bg-white p-5 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:border-[#d4af37] hover:shadow-md">
                {label}
                <ArrowRight className="mt-4 size-4 text-[#a37f12]" />
              </Link>
            ))}
          </div>
        </section>
        <CtaBand />
      </main>
    </MarketingShell>
  );
}

function SurfaceSections() {
  const surfaces: FeatureItem[] = [
    { title: "Web Workspace", description: "Create matters, organize context, use templates, chat through legal drafting and review, and inspect reliability metadata.", icon: Monitor },
    { title: "Word Add-in", description: "Work with selected text in Word for drafting assistance, review, citation checking, and attorney-supervised edits.", icon: FileText },
    { title: "Outlook Add-in", description: "Use selected email text for analysis, drafting, and review where attorney communications already happen.", icon: MailCheck },
    { title: "Reliability Panel", description: "View citations, source visibility, D.C. grounding, confidence, review flags, and request trace details.", icon: PanelRight },
  ];
  return (
    <section className="bg-white px-5 py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionIntro
          eyebrow="Surfaces"
          title="One product across web, Word, and Outlook."
          description="Mercy is not a detached chatbot. It is designed around the practical places attorneys read, write, review, and communicate."
        />
        <div className="mt-12">
          <FeatureGrid items={surfaces} columns="lg:grid-cols-4" />
        </div>
      </div>
    </section>
  );
}

export function UseCasesPage() {
  const useCases: FeatureItem[] = [
    { title: "Matter intake and organization", description: "Capture structured context and keep work associated with the correct matter.", icon: BriefcaseBusiness },
    { title: "Document review", description: "Review uploaded or selected documents with attorney-facing reliability signals.", icon: FileCheck2 },
    { title: "Drafting first versions", description: "Generate starting points that attorneys can edit, verify, and finalize.", icon: FileText },
    { title: "Citation and source checking", description: "Surface citation/source visibility and review prompts instead of hiding uncertainty.", icon: SearchCheck },
    { title: "D.C. legal research support", description: "Support D.C.-focused beta workflows with careful grounding language.", icon: BookOpenCheck },
    { title: "Word drafting assistance", description: "Use Mercy from Microsoft Word when drafting and revising legal language.", icon: Gavel },
    { title: "Outlook selected-text analysis", description: "Analyze selected email text and draft attorney-reviewed responses.", icon: MailCheck },
    { title: "Small firm collaboration", description: "Support shared tenant workspaces and firm/admin provisioning for small teams.", icon: UsersRound },
  ];
  return (
    <MarketingShell>
      <main>
        <Hero
          eyebrow="Use cases"
          title="Legal workflows where speed matters, but control matters more."
          description="Mercy supports the daily work of solo practitioners and small firms without positioning AI as a substitute for counsel."
        />
        <section className="px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <FeatureGrid items={useCases} />
          </div>
        </section>
        <section className="bg-white px-5 py-20 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2">
            <AudienceCard title="Solo practitioners" icon={UserCheck} points={["One-seat workspace", "Matter-centered drafting and review", "Word and Outlook support", "Reliability Panel for final review"]} />
            <AudienceCard title="Small firms" icon={Building2} points={["Shared tenant workspace", "Firm/admin provisioning", "Minimum two attorney seats", "Matter collaboration with tenant isolation"]} />
          </div>
          <div className="mx-auto mt-10 flex max-w-7xl flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild variant="gold">
              <Link href={routes.pricing}>Compare beta pricing</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={routes.contact}>Request demo</Link>
            </Button>
          </div>
        </section>
        <CtaBand />
      </main>
    </MarketingShell>
  );
}

function AudienceCard({ title, icon: Icon, points }: { title: string; icon: IconType; points: string[] }) {
  return (
    <Card className="rounded-md">
      <CardContent className="p-8">
        <Icon className="size-6 text-[#a37f12]" />
        <h2 className="mt-5 text-2xl font-semibold">{title}</h2>
        <ul className="mt-6 space-y-3 text-sm text-slate-600">
          {points.map((point) => (
            <li key={point} className="flex gap-3">
              <Check className="mt-0.5 size-4 shrink-0 text-[#a37f12]" />
              {point}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function SecurityPage() {
  const items: FeatureItem[] = [
    { title: "Backend-enforced auth", description: "Protected legal and admin APIs rely on backend authorization, not UI-only gates.", icon: LockKeyhole },
    { title: "Tenant and firm isolation", description: "Firm users use firm-specific authorization where appropriate, while tenant ID remains the universal workspace boundary.", icon: Fingerprint },
    { title: "Office auth posture", description: "Microsoft NAA is the primary Office path, with Supabase PKCE fallback for supported flows.", icon: ShieldCheck },
    { title: "Admin-controlled provisioning", description: "Beta Microsoft identity provisioning is manual and admin-controlled.", icon: UserCheck },
    { title: "Telemetry data safety", description: "Operational metadata is separated from raw legal text where applicable, including System Map and DevOps telemetry posture.", icon: Layers3 },
    { title: "Responsible AI", description: "Attorney review, reliability signals, and source visibility are built into the product posture.", icon: Scale },
  ];
  return (
    <MarketingShell>
      <main>
        <Hero
          eyebrow="Security"
          title="Security and control for attorney-supervised AI."
          description="Mercy is built around backend-enforced authentication, tenant isolation, careful Office auth, and review signals for legal work."
        />
        <section className="px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <FeatureGrid items={items} columns="lg:grid-cols-3" />
          </div>
        </section>
        <CtaBand title="Request a security and demo packet." description="We can walk through Mercy's beta security posture, Office auth model, and admin provisioning approach without asking you to submit client confidential information." />
      </main>
    </MarketingShell>
  );
}

export function PricingPage() {
  return (
    <MarketingShell>
      <main>
        <Hero
          eyebrow="Beta pricing"
          title="Simple beta pricing for solo attorneys and small firms."
          description="Payment and onboarding are planned for a later pass. For now, pricing CTAs route to sign-up or demo request."
        />
        <section className="px-5 py-20 lg:px-8">
          <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-2">
            <PricingCard
              title="Solo Practitioner"
              price="$98"
              note="/month"
              description="For a solo attorney using Mercy across the Web Workspace, Word, and Outlook."
              features={["1 seat", "Mercy Web Workspace", "Word Add-in", "Outlook Add-in", "Matter-centered AI", "Reliability Panel", "D.C.-focused beta workflows"]}
            />
            <PricingCard
              title="Small Firm"
              price="$98"
              note="/attorney seat/month"
              description="For firms that need a shared tenant workspace and admin-controlled provisioning."
              features={["Minimum 2 seats", "Starts at $196/month", "Shared tenant workspace", "Firm/admin provisioning", "Word and Outlook add-ins", "Matter collaboration", "Reliability Panel"]}
              featured
            />
          </div>
          <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-6 text-slate-600">
            Payment checkout and production onboarding are intentionally not implemented in this marketing pass.
          </p>
        </section>
        <CtaBand />
      </main>
    </MarketingShell>
  );
}

function PricingCard({ title, price, note, description, features, featured = false }: { title: string; price: string; note: string; description: string; features: string[]; featured?: boolean }) {
  return (
    <Card className={cn("rounded-md", featured && "border-[#d4af37] ring-1 ring-[#d4af37]/40")}>
      <CardContent className="p-8">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <div className="mt-7 flex flex-wrap items-end gap-2">
          <span className="text-5xl font-semibold">{price}</span>
          <span className="pb-2 text-sm text-slate-500">{note}</span>
        </div>
        <p className="mt-5 text-sm leading-6 text-slate-600">{description}</p>
        <ul className="mt-7 space-y-3 text-sm">
          {features.map((feature) => (
            <li key={feature} className="flex gap-3">
              <Check className="mt-0.5 size-4 shrink-0 text-[#a37f12]" />
              {feature}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild variant={featured ? "gold" : "default"}>
            <Link href={routes.getStarted}>Get started</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={routes.contact}>Request demo</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ResourcesPage() {
  const resources = [
    { title: "Legal AI ethics guide for attorneys", description: "A practical guide to attorney-supervised AI work and review duties.", icon: Scale, href: routes.trust, cta: "Read trust principles" },
    { title: "D.C. attorney AI checklist", description: "A checklist for using AI carefully in D.C.-focused workflows.", icon: Check, href: routes.security, cta: "Review safety posture" },
    { title: "Using Mercy in Word", description: "How Mercy supports drafting and selected-text review in Microsoft Word.", icon: FileText, href: routes.howItWorks, cta: "See workflow" },
    { title: "Using Mercy in Outlook", description: "How selected email text can become an attorney-reviewed workflow.", icon: MailCheck, href: routes.howItWorks, cta: "See workflow" },
    { title: "Matter-centered AI guide", description: "Why context should start from the matter, not a blank prompt box.", icon: BriefcaseBusiness, href: routes.useCases, cta: "Explore use cases" },
    { title: "Security overview", description: "How Mercy describes auth, tenant isolation, and admin provisioning.", icon: ShieldCheck, href: routes.security, cta: "Open security" },
    { title: "Citation and reliability guide", description: "How to read citations, source visibility, confidence, and review flags.", icon: SearchCheck, href: routes.security, cta: "View reliability" },
  ];
  return (
    <MarketingShell>
      <main>
        <Hero
          eyebrow="Resources"
          title="Guides for attorney-controlled legal AI."
          description="Mercy's resource library is designed to help attorneys use AI with source awareness, client-data care, and final human review."
        />
        <section className="px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {resources.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.title} href={item.href} className="rounded-md border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[#d4af37] hover:shadow-md">
                    <Icon className="size-5 text-[#a37f12]" />
                    <h2 className="mt-5 text-lg font-semibold">{item.title}</h2>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
                    <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-mercy-navy">
                      {item.cta}
                      <ArrowRight className="size-4 text-[#a37f12]" />
                    </span>
                  </Link>
                );
              })}
            </div>
            <div className="mt-12 rounded-md border border-slate-200 bg-white p-8 text-center shadow-sm">
              <h2 className="text-2xl font-semibold">Product updates for the beta</h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Request updates on Word, Outlook, onboarding, and security packet availability. Do not submit confidential client information.
              </p>
              <Button asChild variant="gold" className="mt-6">
                <Link href={routes.contact}>Request updates</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}

export function TrustPage() {
  const pillars: FeatureItem[] = [
    { title: "AI assists, attorney decides", description: "Mercy is designed for supervised work where counsel verifies and finalizes.", icon: UserCheck },
    { title: "Citations and reliability matter", description: "Source visibility and reliability metadata should be part of the workflow.", icon: SearchCheck },
    { title: "Client data must stay protected", description: "The product posture emphasizes tenant isolation and careful telemetry boundaries.", icon: LockKeyhole },
    { title: "Office workflows matter", description: "Word and Outlook are first-class places where legal work already happens.", icon: MailCheck },
    { title: "Authentication", description: "Mercy uses backend-enforced auth for protected legal and admin workflows.", icon: ShieldCheck },
    { title: "Admin provisioning", description: "Beta identity provisioning is controlled by admin workflows.", icon: Fingerprint },
  ];
  return (
    <MarketingShell>
      <main>
        <Hero
          eyebrow="Trust"
          title="Practical, affordable, controlled legal AI for attorneys and small firms."
          description="Mercy's mission is to make legal AI useful without asking attorneys to give up judgment, verification, or workflow control."
        />
        <section className="px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <FeatureGrid items={pillars} columns="lg:grid-cols-3" />
          </div>
        </section>
        <CtaBand title="Request the beta trust packet." description="Ask for roadmap notes, security posture details, and a product walkthrough tailored to solo or small-firm practice." />
      </main>
    </MarketingShell>
  );
}

export function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  return (
    <MarketingShell>
      <main>
        <Hero
          eyebrow="Contact"
          title="Request a Mercy demo."
          description="Tell us how your practice works and which surfaces matter most: Web Workspace, Word, Outlook, or all three."
        />
        <section className="px-5 py-20 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_0.8fr]">
            <Card className="rounded-md">
              <CardContent className="p-8">
                <form
                  className="grid gap-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setSubmitted(true);
                  }}
                >
                  <div className="grid gap-5 md:grid-cols-2">
                    <MarketingField label="Name" />
                    <MarketingField label="Work email" type="email" />
                    <MarketingField label="Firm name" />
                    <MarketingField label="Solo or firm" placeholder="Solo practitioner or small firm" />
                    <MarketingField label="Number of attorneys" type="number" />
                    <MarketingField label="Practice area" />
                  </div>
                  <label className="grid gap-2 text-sm font-medium">
                    Interested in
                    <select className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none ring-[#d4af37]/30 focus:ring-2" defaultValue="all">
                      <option value="web">Web Workspace</option>
                      <option value="word">Word Add-in</option>
                      <option value="outlook">Outlook Add-in</option>
                      <option value="all">All Mercy surfaces</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    Message
                    <textarea className="min-h-32 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-[#d4af37]/30 focus:ring-2" />
                  </label>
                  <label className="flex items-center gap-3 text-sm text-slate-700">
                    <input type="checkbox" className="size-4 rounded border-slate-300" />
                    Request live demo
                  </label>
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Do not submit confidential client information through this form.
                  </p>
                  {submitted ? (
                    <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
                      Demo request captured for the next implementation pass. No message was sent to a backend yet.
                    </p>
                  ) : null}
                  <Button type="submit" variant="gold" className="w-fit">
                    Submit request
                  </Button>
                </form>
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Card className="rounded-md">
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold">Support and contact</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Use this page for demo requests, security packet questions, and beta onboarding interest.
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-md">
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold">Ready to sign up?</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Get started routes to the existing sign-up page. Payment and provisioning automation come later.
                  </p>
                  <Button asChild variant="outline" className="mt-5">
                    <Link href={routes.getStarted}>Go to sign up</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}

function MarketingField({ label, type = "text", placeholder }: { label: string; type?: string; placeholder?: string }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input type={type} placeholder={placeholder} className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none ring-[#d4af37]/30 focus:ring-2" />
    </label>
  );
}
