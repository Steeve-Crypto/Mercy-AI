"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronDown,
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
import { cn } from "@/lib/utils";

const routes = {
  home: "/",
  howItWorks: "/how-it-works",
  useCases: "/use-cases",
  security: "/security",
  resources: "/resources",
  trust: "/trust",
  contact: "/contact",
  signIn: "/sign-in",
  getStarted: "/sign-up",
};

const productLinks = [
  ["Overview", routes.home, "How Mercy’s surfaces work together."],
  ["Mercy Workspace", `${routes.howItWorks}#workspace`, "Matter-centered web workspace."],
  ["Word Add-in", `${routes.howItWorks}#word-addin`, "Draft and review inside Word."],
  ["Outlook Add-in", `${routes.howItWorks}#outlook-addin`, "Work from selected email text."],
  ["Reliability Panel", `${routes.howItWorks}#reliability`, "Citations, grounding, and review signals."],
  ["Matter Intelligence", `${routes.howItWorks}#matter-context`, "Context organized around matters."],
] as const;

const solutionLinks = [
  ["Solo Practitioners", `${routes.useCases}#solo`, "Focused workflows for individual attorneys."],
  ["Small Firms", `${routes.useCases}#firms`, "Tenant workspaces for small teams."],
  ["Drafting", `${routes.useCases}#drafting`, "First drafts with attorney review."],
  ["Document Review", `${routes.useCases}#review`, "Review uploaded and selected text."],
  ["Citation & Source Checking", `${routes.useCases}#citations`, "Source visibility before use."],
  ["Intake & Matter Organization", `${routes.useCases}#intake`, "Structured context from the start."],
] as const;

const resourceLinks = [
  ["Blog", `${routes.resources}#blog`, "Product notes and beta updates."],
  ["Guides", `${routes.resources}#guides`, "Legal AI responsibility resources."],
  ["About / Trust", routes.trust, "Principles behind Mercy."],
  ["Contact Us", routes.contact, "Request a demo or trust packet."],
] as const;

type Feature = {
  title: string;
  description: string;
  icon: LucideIcon;
  href?: string;
  id?: string;
};

function LogoMark() {
  return (
    <Link href={routes.home} className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-sm bg-[#111827] text-white">
        <Scale className="size-5" />
      </span>
      <span className="text-lg font-semibold tracking-normal text-[#111827]">Mercy</span>
    </Link>
  );
}

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f6f4ef] text-[#151515]">
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </div>
  );
}

function MarketingHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const active = (href: string) => {
    const clean = href.split("#")[0] || "/";
    return clean === "/" ? pathname === "/" : pathname.startsWith(clean);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-black/10 bg-[#f6f4ef]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-5 px-5 py-4 lg:px-8">
        <LogoMark />
        <nav className="hidden items-center gap-1 text-sm font-medium text-[#4b4741] lg:flex" aria-label="Marketing navigation">
          <MegaMenu label="Product" items={productLinks} active={active(routes.howItWorks) || pathname === "/"} />
          <MegaMenu label="Solutions" items={solutionLinks} active={active(routes.useCases)} />
          <Link className={navClass(active(routes.useCases))} href={`${routes.useCases}#dc`}>
            Location
          </Link>
          <Link className={navClass(active(routes.security))} href={routes.security}>
            Security
          </Link>
          <MegaMenu label="Resources" items={resourceLinks} active={active(routes.resources) || active(routes.trust) || active(routes.contact)} align="right" />
        </nav>
        <div className="hidden items-center gap-3 lg:flex">
          <Button asChild variant="ghost" size="sm">
            <Link href={routes.signIn}>Login</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="border-[#111827] bg-transparent">
            <Link href={routes.contact}>Request Demo</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={routes.getStarted}>Get Started</Link>
          </Button>
        </div>
        <button
          type="button"
          className="grid size-10 place-items-center rounded-md border border-black/10 bg-white lg:hidden"
          onClick={() => setMobileOpen((value) => !value)}
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {mobileOpen ? <MobileNav onNavigate={() => setMobileOpen(false)} /> : null}
    </header>
  );
}

function navClass(isActive: boolean) {
  return cn("rounded-full px-4 py-2 transition hover:bg-black/5 hover:text-black", isActive && "bg-black text-white hover:bg-black hover:text-white");
}

function MegaMenu({
  label,
  items,
  active,
  align = "left",
}: {
  label: string;
  items: readonly (readonly [string, string, string])[];
  active: boolean;
  align?: "left" | "right";
}) {
  return (
    <div className="group relative">
      <button type="button" className={cn(navClass(active), "inline-flex items-center gap-1")}>
        {label}
        <ChevronDown className="size-4" />
      </button>
      <div
        className={cn(
          "invisible absolute top-full pt-3 opacity-0 transition group-hover:visible group-hover:opacity-100",
          align === "right" ? "right-0" : "left-0",
        )}
      >
        <div className="grid w-[680px] grid-cols-2 gap-2 rounded-lg border border-white/10 bg-[#4b4944]/95 p-4 text-white shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur">
          {items.map(([title, href, description]) => (
            <Link key={title} href={href} className="rounded-md p-4 transition hover:bg-white/10">
              <span className="text-sm font-semibold">{title}</span>
              <span className="mt-2 block text-sm leading-5 text-white/70">{description}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function MobileNav({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="border-t border-black/10 bg-[#f6f4ef] px-5 py-5 lg:hidden">
      <nav className="mx-auto grid max-w-7xl gap-3 text-sm" aria-label="Mobile marketing navigation">
        <MobileGroup title="Product" items={productLinks} onNavigate={onNavigate} />
        <MobileGroup title="Solutions" items={solutionLinks} onNavigate={onNavigate} />
        <Link onClick={onNavigate} className="rounded-md border bg-white px-4 py-3 font-medium" href={`${routes.useCases}#dc`}>
          Location: Washington, DC
        </Link>
        <Link onClick={onNavigate} className="rounded-md border bg-white px-4 py-3 font-medium" href={routes.security}>
          Security
        </Link>
        <MobileGroup title="Resources" items={resourceLinks} onNavigate={onNavigate} />
        <div className="grid gap-2 pt-2 sm:grid-cols-3">
          <Button asChild variant="outline">
            <Link onClick={onNavigate} href={routes.signIn}>Login</Link>
          </Button>
          <Button asChild variant="outline">
            <Link onClick={onNavigate} href={routes.contact}>Request Demo</Link>
          </Button>
          <Button asChild>
            <Link onClick={onNavigate} href={routes.getStarted}>Get Started</Link>
          </Button>
        </div>
      </nav>
    </div>
  );
}

function MobileGroup({ title, items, onNavigate }: { title: string; items: readonly (readonly [string, string, string])[]; onNavigate: () => void }) {
  return (
    <details className="rounded-md border bg-white">
      <summary className="cursor-pointer px-4 py-3 font-semibold">{title}</summary>
      <div className="grid gap-1 border-t px-2 py-2">
        {items.map(([label, href, description]) => (
          <Link key={label} onClick={onNavigate} href={href} className="rounded-md px-3 py-3 hover:bg-slate-50">
            <span className="font-medium">{label}</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
          </Link>
        ))}
      </div>
    </details>
  );
}

function MarketingFooter() {
  const groups = [
    ["Product", [["Workspace", `${routes.howItWorks}#workspace`], ["Word Add-in", `${routes.howItWorks}#word-addin`], ["Outlook Add-in", `${routes.howItWorks}#outlook-addin`], ["Reliability Panel", `${routes.howItWorks}#reliability`]]],
    ["Solutions", [["Solo", `${routes.useCases}#solo`], ["Small Firms", `${routes.useCases}#firms`], ["Drafting", `${routes.useCases}#drafting`], ["Review", `${routes.useCases}#review`], ["D.C.", `${routes.useCases}#dc`]]],
    ["Trust", [["Security", routes.security], ["About / Trust", routes.trust], ["Contact", routes.contact]]],
    ["Resources", [["Guides", `${routes.resources}#guides`], ["Blog", `${routes.resources}#blog`], ["Support", routes.contact]]],
    ["Legal", [["Terms available on request", routes.contact], ["Privacy available on request", routes.contact], ["DPA request", routes.contact]]],
  ] as const;

  return (
    <footer className="border-t border-black/10 bg-[#111827] text-white">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-5 py-14 lg:grid-cols-[1.1fr_2.4fr] lg:px-8">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-sm bg-white text-[#111827]">
              <Scale className="size-5" />
            </span>
            <span className="text-lg font-semibold">Mercy</span>
          </div>
          <p className="mt-6 max-w-sm text-sm leading-6 text-white/68">
            Built for attorney-supervised legal work. Your documents should stay your documents. Currently focused on Washington, DC beta.
          </p>
        </div>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {groups.map(([title, links]) => (
            <div key={title}>
              <h3 className="text-sm font-semibold">{title}</h3>
              <ul className="mt-4 space-y-3 text-sm text-white/64">
                {links.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="hover:text-white">{label}</Link>
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

function HeroSection() {
  return (
    <section className="bg-[#f6f4ef] px-5 py-20 lg:px-8 lg:py-28">
      <div className="mx-auto grid max-w-[1440px] gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6b16]">Legal AI for attorney control</p>
          <h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-normal text-[#111827] md:text-7xl">
            Legal AI for attorneys who need speed without losing control.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-[#5b564e]">
            Mercy combines a secure web workspace, Word and Outlook add-ins, matter-centered context, D.C.-focused workflows, and reliability checks designed for attorney review.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href={routes.getStarted}>Get Started <ArrowRight /></Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-[#111827] bg-transparent">
              <Link href={routes.contact}>Request Demo</Link>
            </Button>
          </div>
        </div>
        <ProductArchitectureVisual />
      </div>
    </section>
  );
}

function ProductArchitectureVisual() {
  return (
    <div className="relative rounded-xl border border-black/10 bg-[#d8d1c2] p-4 shadow-[0_40px_120px_rgba(17,24,39,0.22)]">
      <div className="rounded-lg border border-white/60 bg-[#f8f7f3] p-4">
        <div className="flex items-center justify-between border-b border-black/10 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6b16]">Mercy Workspace</p>
            <h2 className="mt-1 text-xl font-semibold">Matter: Agency response review</h2>
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">Tenant isolated</span>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_0.86fr]">
          <div className="space-y-3">
            <SurfaceMini title="Matter context" meta="Documents, facts, jurisdiction, deadlines" icon={BriefcaseBusiness} />
            <SurfaceMini title="Word Add-in" meta="Selected-text drafting and review" icon={FileText} />
            <SurfaceMini title="Outlook Add-in" meta="Email analysis and response drafting" icon={MailCheck} />
          </div>
          <ReliabilityPanelPreview compact />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Signal label="D.C. grounding" value="Visible" />
          <Signal label="Attorney review" value="Required" />
          <Signal label="Trace ID" value="req_7D4A" />
        </div>
      </div>
    </div>
  );
}

function SurfaceMini({ title, meta, icon: Icon }: { title: string; meta: string; icon: LucideIcon }) {
  return (
    <div className="rounded-md border border-black/10 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <Icon className="mt-1 size-5 text-[#8a6b16]" />
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm leading-5 text-slate-600">{meta}</p>
        </div>
      </div>
    </div>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-black/10 bg-white px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function ReliabilityPanelPreview({ compact = false }: { compact?: boolean }) {
  const rows = [
    ["Citations", "3 visible"],
    ["Confidence", "Review"],
    ["D.C. grounding", "On"],
    ["Attorney-review flag", "Required"],
    ["Unsupported claim warning", "1 item"],
    ["Trace / request ID", "req_7D4A"],
  ];
  return (
    <div className="rounded-md border border-black/10 bg-[#111827] p-4 text-white shadow-sm">
      <div className="flex items-center gap-2">
        <PanelRight className="size-4 text-[#d4af37]" />
        <h3 className="font-semibold">Reliability Panel</h3>
      </div>
      <div className={cn("mt-4 grid gap-2", !compact && "sm:grid-cols-2")}>
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-md bg-white/8 p-3">
            <p className="text-xs text-white/54">{label}</p>
            <p className="mt-1 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6b16]">{eyebrow}</p>
      <h2 className="mt-4 text-4xl font-semibold tracking-normal text-[#111827] md:text-5xl">{title}</h2>
      <p className="mt-5 text-base leading-7 text-[#5b564e] md:text-lg">{description}</p>
    </div>
  );
}

function ProductSurfaceCard({ title, description, icon: Icon, href }: Feature & { href: string }) {
  return (
    <Link href={href} className="rounded-lg border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <Icon className="size-5 text-[#8a6b16]" />
      <h3 className="mt-6 text-xl font-semibold">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[#5b564e]">{description}</p>
      <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">Explore <ArrowRight className="size-4" /></span>
    </Link>
  );
}

function WorkflowCard({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6b16]">{step}</p>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[#5b564e]">{description}</p>
    </div>
  );
}

function CtaBand({ title = "Start building your Mercy workspace.", description = "Create an account, choose Solo or Firm during registration, accept the beta terms, and continue through activation inside the signup flow." }) {
  return (
    <section className="px-5 py-20 lg:px-8">
      <div className="mx-auto max-w-[1440px] rounded-xl bg-[#111827] px-6 py-12 text-white shadow-[0_36px_120px_rgba(17,24,39,0.2)] md:px-10">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="text-3xl font-semibold">{title}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68">{description}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href={routes.getStarted}>Get Started</Link>
            </Button>
            <Button asChild variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
              <Link href={routes.contact}>Request Demo</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HomeMarketingPage() {
  return (
    <MarketingShell>
      <main>
        <HeroSection />
        <section className="bg-white px-5 py-24 lg:px-8">
          <div className="mx-auto max-w-[1440px]">
            <SectionIntro
              eyebrow="Product"
              title="One legal AI workspace. Three places attorneys work."
              description="Mercy is organized around the matter, then brought into the web workspace, Word, and Outlook with reliability signals attached."
            />
            <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <ProductSurfaceCard title="Mercy Workspace" description="Matter-centered workspace for documents, context, drafting, review, and reliability metadata." icon={Monitor} href={`${routes.howItWorks}#workspace`} />
              <ProductSurfaceCard title="Word Add-in" description="Draft, revise, and review selected legal text where documents are already being written." icon={FileText} href={`${routes.howItWorks}#word-addin`} />
              <ProductSurfaceCard title="Outlook Add-in" description="Analyze selected message text and prepare attorney-reviewed responses from Outlook." icon={MailCheck} href={`${routes.howItWorks}#outlook-addin`} />
              <ProductSurfaceCard title="Reliability Panel" description="Inspect citations, confidence, D.C. grounding, review flags, and request trace details." icon={PanelRight} href={`${routes.howItWorks}#reliability`} />
            </div>
          </div>
        </section>
        <section className="px-5 py-24 lg:px-8">
          <div className="mx-auto max-w-[1440px]">
            <SectionIntro
              eyebrow="Solutions"
              title="Built for the workflows where legal AI needs boundaries."
              description="Mercy supports solo attorneys and small firms across drafting, review, citation checking, intake, and D.C.-focused work."
            />
            <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[
                ["Solo practitioners", "A focused workspace for an attorney who needs speed, organization, and review controls.", `${routes.useCases}#solo`, UserCheck],
                ["Small firms", "Tenant-isolated workflows for small teams with firm-aware administration.", `${routes.useCases}#firms`, Building2],
                ["Drafting", "First drafts and revisions that remain subject to attorney review.", `${routes.useCases}#drafting`, Gavel],
                ["Document review", "Upload and selected-text review with reliability signals visible.", `${routes.useCases}#review`, FileCheck2],
                ["Citation/source checking", "Surface source visibility and warnings before final use.", `${routes.useCases}#citations`, SearchCheck],
                ["D.C.-focused workflows", "Focused on Washington, DC for beta, with expansion later.", `${routes.useCases}#dc`, BookOpenCheck],
              ].map(([title, description, href, Icon]) => (
                <ProductSurfaceCard key={title as string} title={title as string} description={description as string} href={href as string} icon={Icon as LucideIcon} />
              ))}
            </div>
          </div>
        </section>
        <section className="bg-white px-5 py-24 lg:px-8">
          <div className="mx-auto max-w-[1440px]">
            <SectionIntro
              eyebrow="Workflow"
              title="From matter context to attorney finalization."
              description="Mercy is designed as a controlled workflow, not a blank prompt box."
            />
            <div className="mt-14 grid gap-4 md:grid-cols-5">
              <WorkflowCard step="01" title="Create or select a matter" description="Start with the client and matter boundary." />
              <WorkflowCard step="02" title="Add documents and context" description="Attach facts, documents, and jurisdiction focus." />
              <WorkflowCard step="03" title="Work in Web, Word, or Outlook" description="Move through normal attorney surfaces." />
              <WorkflowCard step="04" title="Review citations and reliability" description="Inspect grounding, warnings, and trace details." />
              <WorkflowCard step="05" title="Attorney finalizes" description="Counsel verifies, edits, and decides what leaves the firm." />
            </div>
          </div>
        </section>
        <section className="px-5 py-24 lg:px-8">
          <div className="mx-auto grid max-w-[1440px] gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6b16]">Reliability</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-normal md:text-5xl">A review layer for legal AI output.</h2>
              <p className="mt-5 text-base leading-7 text-[#5b564e]">
                Mercy shows citations, confidence, D.C. grounding, attorney-review flags, unsupported-claim warnings, and trace IDs so legal work remains reviewable.
              </p>
            </div>
            <ReliabilityPanelPreview />
          </div>
        </section>
        <section className="bg-white px-5 py-24 lg:px-8">
          <div className="mx-auto max-w-[1440px] rounded-xl border border-black/10 bg-[#f6f4ef] p-8 md:p-12">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6b16]">Location</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-normal">Focused on Washington, DC for beta.</h2>
            <p className="mt-5 max-w-3xl text-base leading-7 text-[#5b564e]">
              Mercy is currently focused on D.C. solo attorneys and small firms. That focus keeps the beta honest about jurisdiction, source visibility, and attorney-supervised review before later expansion.
            </p>
          </div>
        </section>
        <CtaBand />
      </main>
    </MarketingShell>
  );
}

function PageHero({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <section className="px-5 py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-[1440px]">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6b16]">{eyebrow}</p>
        <h1 className="mt-5 max-w-5xl text-5xl font-semibold leading-[1.05] tracking-normal text-[#111827] md:text-7xl">{title}</h1>
        <p className="mt-7 max-w-3xl text-lg leading-8 text-[#5b564e]">{description}</p>
      </div>
    </section>
  );
}

function AnchorSection({ id, eyebrow, title, description, children }: { id: string; eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-black/10 px-5 py-16 lg:px-8">
      <div className="mx-auto grid max-w-[1440px] gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6b16]">{eyebrow}</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-normal">{title}</h2>
          <p className="mt-4 text-sm leading-6 text-[#5b564e]">{description}</p>
        </div>
        <div>{children ?? <ProductArchitectureVisual />}</div>
      </div>
    </section>
  );
}

export function HowItWorksPage() {
  return (
    <MarketingShell>
      <main>
        <PageHero
          eyebrow="How it works"
          title="Matter-centered legal AI across web, Word, and Outlook."
          description="Mercy keeps context, documents, source visibility, and reliability signals connected as attorneys move through their day."
        />
        <AnchorSection id="matter-context" eyebrow="Matter intelligence" title="Start with the matter, not a blank prompt." description="Mercy organizes legal work around tenant, matter, documents, facts, jurisdiction, and attorney-selected context.">
          <FeatureList items={["Tenant and matter boundaries", "Document and fact context", "Jurisdiction focus", "Traceable requests"]} />
        </AnchorSection>
        <AnchorSection id="workspace" eyebrow="Web Workspace" title="The central place for matter work." description="Use the web workspace for matter setup, document upload/review, drafting assistance, intake organization, and reliability inspection.">
          <ProductArchitectureVisual />
        </AnchorSection>
        <AnchorSection id="word-addin" eyebrow="Word Add-in" title="Draft and review where legal documents live." description="The Word add-in supports selected-text workflows for drafting, revision, issue spotting, and attorney-supervised edits.">
          <FeatureList items={["Selected-text review", "Drafting assistance", "Clause and language refinement", "Attorney finalization"]} />
        </AnchorSection>
        <AnchorSection id="outlook-addin" eyebrow="Outlook Add-in" title="Bring controlled AI into attorney communications." description="The Outlook add-in supports selected-text analysis and response drafting without moving email work into a separate generic chat surface.">
          <FeatureList items={["Selected email analysis", "Response drafting", "Matter-aware context", "Attorney review before sending"]} />
        </AnchorSection>
        <AnchorSection id="reliability" eyebrow="Reliability Panel" title="Review signals stay attached to the work." description="Mercy surfaces citations, source status, D.C. grounding, confidence, unsupported-claim warnings, attorney-review flags, and trace IDs.">
          <ReliabilityPanelPreview />
        </AnchorSection>
        <AnchorSection id="attorney-review" eyebrow="Final review" title="AI assists. Attorneys decide." description="Mercy is designed for attorney-supervised legal work. Attorneys remain responsible for reviewing outputs before use.">
          <FeatureList items={["Attorney-review notice", "Source visibility", "Output verification", "Professional judgment preserved"]} />
        </AnchorSection>
        <CtaBand />
      </main>
    </MarketingShell>
  );
}

function FeatureList({ items }: { items: string[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <div key={item} className="flex gap-3 rounded-lg border border-black/10 bg-white p-5 shadow-sm">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#8a6b16]" />
          <span className="text-sm font-medium">{item}</span>
        </div>
      ))}
    </div>
  );
}

export function UseCasesPage() {
  return (
    <MarketingShell>
      <main>
        <PageHero
          eyebrow="Solutions"
          title="Legal workflows where speed matters, but control matters more."
          description="Mercy supports solo practitioners and small firms across drafting, review, source checking, intake, Office workflows, and D.C.-focused beta use."
        />
        <UseCase id="solo" title="Solo practitioners" icon={UserCheck} description="A focused workspace for attorneys who need drafting, review, intake, and source visibility without adding operational complexity." />
        <UseCase id="firms" title="Small firms" icon={UsersRound} description="Shared tenant workspaces and firm-aware administration for small teams using legal AI under attorney supervision." />
        <UseCase id="drafting" title="Drafting" icon={Gavel} description="Create first versions, revise selected language, and move faster while preserving attorney review and final judgment." />
        <UseCase id="review" title="Document review" icon={FileCheck2} description="Review uploaded documents or selected Office text with reliability and source signals visible." />
        <UseCase id="citations" title="Citation and source checking" icon={SearchCheck} description="Inspect source visibility, D.C. grounding, and unsupported-claim warnings before legal output is used." />
        <UseCase id="intake" title="Matter intake and organization" icon={BriefcaseBusiness} description="Capture structured context and keep legal work associated with the right matter from the beginning." />
        <UseCase id="dc" title="Washington, DC" icon={BookOpenCheck} description="Mercy is currently focused on D.C. solo attorneys and small firms for beta, with expansion later." />
        <CtaBand />
      </main>
    </MarketingShell>
  );
}

function UseCase({ id, title, description, icon: Icon }: { id: string; title: string; description: string; icon: LucideIcon }) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-black/10 px-5 py-14 lg:px-8">
      <div className="mx-auto grid max-w-[1440px] gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-center">
        <div className="flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-md bg-white shadow-sm">
            <Icon className="size-6 text-[#8a6b16]" />
          </span>
          <h2 className="text-3xl font-semibold">{title}</h2>
        </div>
        <p className="text-base leading-7 text-[#5b564e]">{description}</p>
      </div>
    </section>
  );
}

export function SecurityPage() {
  const items: Feature[] = [
    { title: "Backend-enforced authentication", description: "Protected legal and admin workflows rely on server-side auth checks rather than UI-only gates.", icon: LockKeyhole },
    { title: "Tenant and firm isolation", description: "Matters stay isolated to the tenant, with firm-aware boundaries where relevant.", icon: Fingerprint },
    { title: "Office auth posture", description: "Microsoft NAA is the primary Office auth approach, with Supabase PKCE fallback where supported.", icon: ShieldCheck },
    { title: "Admin-controlled provisioning", description: "Admin provisioning stays separate from normal signup and is controlled through dedicated workflows.", icon: UserCheck },
    { title: "Operational telemetry boundaries", description: "Raw legal text is excluded from System Map and DevOps telemetry.", icon: Layers3 },
    { title: "Responsible AI", description: "Reliability signals and attorney-review language keep output positioned for supervised legal work.", icon: Scale },
  ];
  return (
    <MarketingShell>
      <main>
        <PageHero
          eyebrow="Security"
          title="Security posture for attorney-supervised legal AI."
          description="Mercy emphasizes authentication, tenant isolation, Office auth, telemetry boundaries, and responsible review signals without claiming certifications that are still on the roadmap."
        />
        <section className="px-5 py-20 lg:px-8">
          <div className="mx-auto grid max-w-[1440px] gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => <InfoCard key={item.title} {...item} />)}
          </div>
        </section>
        <section className="bg-white px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-[1440px] rounded-xl border border-black/10 bg-[#f6f4ef] p-8 md:p-12">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6b16]">Compliance roadmap</p>
            <h2 className="mt-4 text-3xl font-semibold">SOC 2-ready posture, not certification.</h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-[#5b564e]">
              Mercy’s roadmap includes SOC 2 readiness work, security documentation, and DPA/security packet materials available on request. This page does not claim completed certification.
            </p>
          </div>
        </section>
        <CtaBand title="Request the security packet." description="Ask for Mercy’s current security posture, roadmap notes, and Office auth explanation. Do not submit confidential client information." />
      </main>
    </MarketingShell>
  );
}

function InfoCard({ title, description, icon: Icon }: Feature) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-6 shadow-sm">
      <Icon className="size-5 text-[#8a6b16]" />
      <h3 className="mt-5 text-lg font-semibold">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[#5b564e]">{description}</p>
    </div>
  );
}

export function ResourcesPage() {
  const cards = [
    ["Legal AI ethics guide for attorneys", "Coming soon", routes.trust, Scale],
    ["D.C. attorney AI checklist", "Coming soon", routes.security, CheckCircle2],
    ["Using Mercy in Word", "Guide", `${routes.howItWorks}#word-addin`, FileText],
    ["Using Mercy in Outlook", "Guide", `${routes.howItWorks}#outlook-addin`, MailCheck],
    ["Matter-centered AI guide", "Guide", `${routes.howItWorks}#matter-context`, BriefcaseBusiness],
    ["Citation and Reliability Panel guide", "Guide", `${routes.howItWorks}#reliability`, SearchCheck],
    ["Security overview", "Reference", routes.security, ShieldCheck],
  ] as const;
  return (
    <MarketingShell>
      <main>
        <PageHero
          eyebrow="Resources"
          title="A practical hub for attorney-controlled legal AI."
          description="Resources focus on legal AI responsibility, product education, D.C. beta notes, and the review habits Mercy is designed to support."
        />
        <section id="blog" className="scroll-mt-28 px-5 py-16 lg:px-8">
          <div className="mx-auto max-w-[1440px]">
            <SectionIntro eyebrow="Blog / updates" title="Product notes for the beta." description="Updates will cover web workspace, Word, Outlook, reliability, and D.C.-focused workflows." />
          </div>
        </section>
        <section id="guides" className="scroll-mt-28 px-5 pb-20 lg:px-8">
          <div className="mx-auto grid max-w-[1440px] gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cards.map(([title, tag, href, Icon]) => (
              <ResourceCard key={title} title={title} tag={tag} href={href} icon={Icon} />
            ))}
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}

function ResourceCard({ title, tag, href, icon: Icon }: { title: string; tag: string; href: string; icon: LucideIcon }) {
  return (
    <Link href={href} className="rounded-lg border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <Icon className="size-5 text-[#8a6b16]" />
        <span className="rounded-full border bg-[#f6f4ef] px-3 py-1 text-xs font-semibold text-[#5b564e]">{tag}</span>
      </div>
      <h2 className="mt-6 text-xl font-semibold">{title}</h2>
      <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold">Open <ArrowRight className="size-4" /></span>
    </Link>
  );
}

export function TrustPage() {
  return (
    <MarketingShell>
      <main>
        <PageHero
          eyebrow="About / Trust"
          title="Mercy is built for lawyers who want AI assistance without surrendering professional control."
          description="The product is grounded in attorney supervision, matter boundaries, source visibility, and careful handling of legal work."
        />
        <section className="px-5 py-20 lg:px-8">
          <div className="mx-auto grid max-w-[1440px] gap-4 md:grid-cols-2 lg:grid-cols-3">
            <InfoCard title="Mission" description="Make legal AI useful for solo attorneys and small firms while keeping review, context, and final judgment with counsel." icon={Scale} />
            <InfoCard title="Attorney-control principles" description="AI assists, attorneys decide. Mercy is designed around verification and final human review." icon={UserCheck} />
            <InfoCard title="Why D.C. first" description="A focused jurisdiction keeps the beta practical and honest before expansion." icon={BookOpenCheck} />
            <InfoCard title="Responsible AI" description="Mercy uses reliability signals, source visibility, and careful product language for supervised legal work." icon={ShieldCheck} />
            <InfoCard title="Data boundaries" description="Your matters stay isolated to your tenant, and your data never trains our models." icon={Fingerprint} />
            <InfoCard title="Telemetry posture" description="Raw legal text is excluded from operational telemetry." icon={Layers3} />
          </div>
        </section>
        <CtaBand title="Request a trust packet." description="Contact Mercy for security posture notes, roadmap materials, and a product walkthrough." />
      </main>
    </MarketingShell>
  );
}

export function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  return (
    <MarketingShell>
      <main>
        <PageHero
          eyebrow="Contact"
          title="Request a Mercy demo."
          description="Tell us how your practice works and which surfaces matter most: Web Workspace, Word, Outlook, or all three."
        />
        <section className="px-5 py-20 lg:px-8">
          <div className="mx-auto grid max-w-[1440px] gap-8 lg:grid-cols-[1fr_0.7fr]">
            <form
              className="rounded-xl border border-black/10 bg-white p-6 shadow-sm md:p-8"
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
              <label className="mt-5 grid gap-2 text-sm font-medium">
                Interested in
                <select className="h-11 rounded-md border border-black/10 bg-white px-3 text-sm outline-none ring-[#d4af37]/30 focus:ring-2" defaultValue="all">
                  <option value="web">Web Workspace</option>
                  <option value="word">Word Add-in</option>
                  <option value="outlook">Outlook Add-in</option>
                  <option value="all">All Mercy surfaces</option>
                </select>
              </label>
              <label className="mt-5 grid gap-2 text-sm font-medium">
                Message
                <textarea className="min-h-32 rounded-md border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-[#d4af37]/30 focus:ring-2" />
              </label>
              <label className="mt-5 flex items-center gap-3 text-sm text-[#5b564e]">
                <input type="checkbox" className="size-4 rounded border-slate-300" />
                Request live demo
              </label>
              <p className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Do not submit confidential client information through this form.
              </p>
              {submitted ? (
                <p role="status" className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
                  Thank you. This local form state is ready for a backend handoff in a later pass.
                </p>
              ) : null}
              <Button type="submit" className="mt-6">Submit request</Button>
            </form>
            <aside className="space-y-4">
              <InfoCard title="Demo requests" description="Use this page for product walkthroughs across web, Word, Outlook, and reliability workflows." icon={Monitor} />
              <InfoCard title="Trust packet" description="Ask for current security posture, roadmap materials, and DPA/security packet availability." icon={ShieldCheck} />
              <InfoCard title="Beta focus" description="Mercy is currently focused on Washington, DC solo attorneys and small firms." icon={BookOpenCheck} />
            </aside>
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
      <input type={type} placeholder={placeholder} className="h-11 rounded-md border border-black/10 bg-white px-3 text-sm outline-none ring-[#d4af37]/30 focus:ring-2" />
    </label>
  );
}
