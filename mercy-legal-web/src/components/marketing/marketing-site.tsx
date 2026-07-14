"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  BriefcaseBusiness,
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
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const routes = {
  home: "/",
  product: "/product",
  productOfficeAddins: "/product/office-addins",
  productReliabilityCitations: "/product/reliability-citations",
  productWorkspace: "/product/workspace",
  productAssistant: "/product/assistant",
  productWord: "/product/word-addin",
  productOutlook: "/product/outlook-addin",
  productReliability: "/product/reliability-panel",
  productMatter: "/product/matter-intelligence",
  solutions: "/solutions",
  solutionLitigation: "/solutions/litigation",
  solutionTransactions: "/solutions/transactions",
  solutionResearchCompliance: "/solutions/research-compliance",
  solutionDrafting: "/solutions/drafting",
  solutionReview: "/solutions/document-review",
  solutionCitations: "/solutions/citation-source-checking",
  solutionIntake: "/solutions/intake-matter-organization",
  solutionOffice: "/solutions/office-workflows",
  solutionDcResearch: "/solutions/dc-legal-research",
  howItWorks: "/how-it-works",
  useCases: "/use-cases",
  location: "/location",
  security: "/security",
  resources: "/resources",
  blog: "/resources/blog",
  trust: "/trust",
  contact: "/contact",
  signIn: "/sign-in",
  getStarted: "/sign-up",
} as const;

type MarketingRoute = (typeof routes)[keyof typeof routes];

const productLinks = [
  ["How It Works", routes.howItWorks, "Matter setup to attorney review."],
  ["Office Add-ins", routes.productOfficeAddins, "Word drafting and Outlook selected-text workflows."],
  ["Reliability & Citations", routes.productReliabilityCitations, "Sources, confidence, D.C. grounding, and review flags."],
] as const;

const solutionLinks = [
  ["Litigation", routes.solutionLitigation, "Pleadings, discovery, motions, and evidence review."],
  ["Transactions", routes.solutionTransactions, "Contracts, clauses, negotiation prep, and redlines."],
  ["Research & Compliance", routes.solutionResearchCompliance, "D.C. research support, source checking, and compliance review."],
] as const;

const resourceLinks = [
  ["Blog", routes.blog, "Product notes and beta updates."],
  ["About / Trust", routes.trust, "Principles behind Mercy."],
  ["Contact Us", routes.contact, "Request a demo or trust packet."],
] as const;

const audienceLinks = [
  ["Solo attorneys", routes.useCases, "Matters, Vault, research, drafting, and personal billing without firm-admin noise."],
  ["Small firms", routes.useCases, "Shared matters, seats, firm billing ownership, and workspace isolation."],
] as const;

type Feature = {
  title: string;
  description: string;
  icon: LucideIcon;
  href?: MarketingRoute;
  id?: string;
};

type ProductKey = "workspace" | "assistant" | "word" | "outlook" | "reliability" | "matter";
type SolutionKey = "litigation" | "transactions" | "researchCompliance" | "drafting" | "review" | "citations" | "intake" | "office" | "dcResearch";

const productPages: Record<ProductKey, Feature & { eyebrow: string; workflow: string[]; note: string }> = {
  workspace: {
    eyebrow: "Mercy Workspace",
    title: "A matter command center for legal AI work.",
    description: "Mercy Workspace brings matters, documents, templates, Assistant workflows, and reliability review into one tenant-isolated legal work surface.",
    icon: Monitor,
    workflow: ["Create or select a matter", "Upload documents and organize context", "Ask the Assistant to draft, review, or summarize", "Inspect reliability signals before use"],
    note: "Workspace output remains designed for attorney-supervised review. Mercy does not replace professional judgment.",
  },
  assistant: {
    eyebrow: "Assistant",
    title: "Ask, draft, review, cite, and reason with matter context.",
    description: "Mercy Assistant is positioned around the active matter so prompts, documents, facts, and jurisdiction focus stay connected to the work being reviewed.",
    icon: MessageSquareText,
    workflow: ["Start from the active matter", "Ask a legal-work question or drafting request", "Review the matter-aware response", "Check citations, warnings, and trace details"],
    note: "Assistant responses are reviewable work product inputs, not final legal advice.",
  },
  word: {
    eyebrow: "Word Add-in",
    title: "Draft, revise, and cite inside Word.",
    description: "The Word Add-in supports selected-text workflows for drafting, revision, citation review, and attorney-controlled document editing.",
    icon: FileText,
    workflow: ["Select text in Word", "Ask Mercy to revise, draft, or analyze", "Review suggested language and sources", "Attorney accepts, edits, or rejects"],
    note: "Mercy never asks attorneys to leave final document control behind.",
  },
  outlook: {
    eyebrow: "Outlook Add-in",
    title: "Work from selected email text and message context.",
    description: "The Outlook Add-in helps attorneys analyze selected text, organize correspondence context, and prepare reviewed responses without moving email work into a generic prompt box.",
    icon: MailCheck,
    workflow: ["Select relevant email text", "Ask for analysis or a draft response", "Review matter context and reliability cues", "Attorney finalizes before sending"],
    note: "The attorney remains responsible for what is sent from Outlook.",
  },
  reliability: {
    eyebrow: "Reliability Panel",
    title: "Review citations, confidence, D.C. grounding, and warnings.",
    description: "The Reliability Panel keeps source visibility, confidence labels, unsupported-claim warnings, attorney-review flags, and trace/request IDs close to the work.",
    icon: PanelRight,
    workflow: ["Inspect citations", "Review confidence and grounding", "Check unsupported-claim warnings", "Use trace details for follow-up review"],
    note: "Reliability signals support review; they do not guarantee correctness.",
  },
  matter: {
    eyebrow: "Matter Intelligence",
    title: "Connect answers to the right matter, documents, sources, and context.",
    description: "Matter Intelligence keeps legal AI work organized around the matter boundary, document set, jurisdiction focus, facts, and source context.",
    icon: BriefcaseBusiness,
    workflow: ["Select the correct matter", "Attach documents and facts", "Maintain jurisdiction and source focus", "Keep outputs tied to reviewable context"],
    note: "Matter context helps reduce drift, while attorney verification remains required.",
  },
};

const solutionPages: Record<SolutionKey, Feature & { problem: string; workflow: string[]; sees: string[] }> = {
  litigation: {
    title: "Litigation workflows with matter context and review controls.",
    description: "Mercy supports litigation work with drafting, document review, source checking, Office workflows, and reliability signals.",
    icon: Gavel,
    problem: "Litigation work often moves across pleadings, exhibits, correspondence, rules, and case-specific facts. Mercy helps keep that work organized around the matter.",
    workflow: ["Create the litigation matter", "Add pleadings, exhibits, correspondence, or notes", "Draft or review with Assistant, Word, or Outlook", "Check reliability before attorney finalization"],
    sees: ["Matter context", "Draft/review surfaces", "Citation and warning cues", "Attorney-review status"],
  },
  transactions: {
    title: "Transaction workflows for contracts, clauses, and negotiation prep.",
    description: "Mercy supports contract review, clause drafting, redline preparation, Word workflows, and reliability checks for attorney-supervised transactional work.",
    icon: BriefcaseBusiness,
    problem: "Transactional work moves through document versions, clause libraries, negotiation points, and client-specific constraints. Mercy helps keep the context reviewable.",
    workflow: ["Collect the contract and negotiation context", "Draft or revise clauses in Word", "Prepare issues and negotiation notes", "Review sources and reliability cues before use"],
    sees: ["Contract context", "Clause and redline support", "Negotiation-prep notes", "Source and review signals"],
  },
  researchCompliance: {
    title: "Research and compliance support with D.C. source grounding.",
    description: "Mercy supports D.C. Code-aware workflows, D.C. Superior Court rule awareness, local federal context where applicable, source checking, and compliance review.",
    icon: BookOpenCheck,
    problem: "Research and compliance tasks require jurisdiction focus, source visibility, and attorney judgment. Mercy keeps those review signals near the work.",
    workflow: ["Set the D.C. or local federal context", "Review documents, questions, or compliance issues", "Inspect sources, warnings, and grounding", "Attorney verifies applicability and final judgment"],
    sees: ["D.C. grounding", "Source visibility", "Compliance-review notes", "Attorney-review reminders"],
  },
  drafting: {
    title: "Drafting support that keeps attorneys in control.",
    description: "Mercy helps attorneys create first drafts, revise language, and work through legal documents while preserving review and final judgment.",
    icon: FileText,
    problem: "Legal drafting is repetitive but risk-sensitive. Attorneys need speed without handing control to a black-box drafting surface.",
    workflow: ["Start from a matter or selected text", "Request a draft or revision", "Review sources and reliability signals", "Finalize in the attorney's document workflow"],
    sees: ["Draft language", "Selected-text context", "Source visibility", "Review reminders"],
  },
  review: {
    title: "Document review with source visibility.",
    description: "Mercy supports uploaded-document and selected-text review with reliability cues and attorney-supervised outputs.",
    icon: FileCheck2,
    problem: "Document review requires fast issue spotting without losing sight of the underlying text and matter context.",
    workflow: ["Add or select documents", "Ask Mercy to summarize, flag, or compare", "Inspect source-linked observations", "Attorney verifies before use"],
    sees: ["Document context", "Review notes", "Warnings", "Trace/request details"],
  },
  citations: {
    title: "Citation and source checking for reviewable legal AI.",
    description: "Mercy surfaces citations, source status, D.C. grounding, confidence, and unsupported-claim warnings where available.",
    icon: SearchCheck,
    problem: "AI output is not useful to attorneys unless claims can be checked against sources and reviewed with professional judgment.",
    workflow: ["Generate or review output", "Open the Reliability Panel", "Inspect citations and warnings", "Revise or reject unsupported material"],
    sees: ["Citations", "Confidence labels", "Unsupported-claim warnings", "D.C. grounding indicators"],
  },
  intake: {
    title: "Intake and matter organization from the start.",
    description: "Mercy helps organize facts, documents, and jurisdiction focus before drafting, review, or correspondence begins.",
    icon: BriefcaseBusiness,
    problem: "When intake context is scattered, downstream drafting and review become harder to verify.",
    workflow: ["Create a matter", "Capture facts and documents", "Set jurisdiction focus", "Use context across Workspace, Assistant, Word, and Outlook"],
    sees: ["Matter folders", "Context notes", "Document lists", "Jurisdiction focus"],
  },
  office: {
    title: "Office-first workflows for Word and Outlook.",
    description: "Mercy brings legal AI support into Word and Outlook so attorneys can work from selected text and email context.",
    icon: Layers3,
    problem: "Attorneys live in documents and email. Moving sensitive work into disconnected tools creates friction and context loss.",
    workflow: ["Select text in Word or Outlook", "Request drafting, review, or analysis", "Check matter and source context", "Attorney finalizes in Office"],
    sees: ["Selected text", "Matter context", "Draft suggestions", "Reliability notes"],
  },
  dcResearch: {
    title: "D.C. legal research support with source grounding.",
    description: "Mercy is focused first on D.C. workflows, including D.C. Code-aware work, Superior Court rule awareness, and local federal context where applicable.",
    icon: BookOpenCheck,
    problem: "Jurisdiction matters. Mercy keeps D.C. focus visible instead of treating local legal work as generic content.",
    workflow: ["Set D.C. jurisdiction focus", "Work with matter documents and source context", "Review D.C. grounding cues", "Attorney verifies coverage and applicability"],
    sees: ["D.C. grounding", "Source visibility", "Warnings", "Attorney-review reminders"],
  },
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
    <div className="mercy-marketing min-h-screen">
      <style jsx global>{`
        @keyframes mercy-drift {
          0% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, -8px, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
        @keyframes mercy-grid-pan {
          0% { background-position: 0 0, 0 0; }
          100% { background-position: 64px 32px, 32px 64px; }
        }
        .mercy-hero-grid {
          animation: mercy-grid-pan 36s linear infinite;
        }
        .mercy-float-slow {
          animation: mercy-drift 10s ease-in-out infinite;
        }
        .mercy-float-medium {
          animation: mercy-drift 8s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .mercy-hero-grid,
          .mercy-float-slow,
          .mercy-float-medium {
            animation: none !important;
          }
        }
      `}</style>
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
    <header className="sticky top-0 z-50 border-b border-black/10 bg-[color-mix(in_srgb,#f5f2eb_92%,transparent)] backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-5 px-5 py-3.5 lg:px-8">
        <LogoMark />
        <nav className="hidden items-center gap-1 text-sm font-medium text-[#4b4741] lg:flex" aria-label="Marketing navigation">
          <MegaMenu label="Product" items={productLinks} active={active(routes.product) || active(routes.howItWorks) || pathname === "/"} />
          <MegaMenu label="Solutions" items={solutionLinks} active={active(routes.solutions) || active(routes.useCases)} />
          <Link className={navClass(active(routes.location))} href={routes.location}>
            D.C. focus
          </Link>
          <Link className={navClass(active(routes.security))} href={routes.security}>
            Security
          </Link>
          <MegaMenu label="Resources" items={resourceLinks} active={active(routes.resources) || active(routes.blog) || active(routes.trust) || active(routes.contact)} align="right" />
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <Button asChild variant="ghost" size="sm">
            <Link href={routes.signIn}>Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={routes.getStarted}>Start beta</Link>
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
  return cn("rounded-full px-3.5 py-2 transition hover:bg-black/5 hover:text-black", isActive && "bg-[#111827] text-white hover:bg-[#111827] hover:text-white");
}

function MegaMenu({
  label,
  items,
  active,
  align = "left",
}: {
  label: string;
  items: readonly (readonly [string, MarketingRoute, string])[];
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
          "invisible absolute top-full pt-2 opacity-0 transition group-hover:visible group-hover:opacity-100",
          align === "right" ? "right-0" : "left-0",
        )}
      >
        <div className="grid w-[320px] gap-1 rounded-md border border-[#d4af37]/18 bg-[#0f1724]/96 p-2 text-white shadow-[0_16px_42px_rgba(5,8,15,0.24)] ring-1 ring-white/5 backdrop-blur-md">
          {items.map(([title, href, description]) => (
            <Link key={title} href={href} className="rounded-sm border border-transparent px-2.5 py-2 transition hover:border-[#d4af37]/20 hover:bg-white/[0.07]">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="size-1.5 rounded-full bg-[#d4af37]" />
                {title}
              </span>
              <span className="mt-0.5 block text-[0.72rem] leading-4 text-white/66">{description}</span>
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
        <Link onClick={onNavigate} className="rounded-md border bg-white px-4 py-3 font-medium" href={routes.location}>
          Location: Washington, DC
        </Link>
        <Link onClick={onNavigate} className="rounded-md border bg-white px-4 py-3 font-medium" href={routes.security}>
          Security
        </Link>
        <MobileGroup title="Resources" items={resourceLinks} onNavigate={onNavigate} />
        <div className="grid gap-2 pt-2 sm:grid-cols-2">
          <Button asChild variant="outline">
            <Link onClick={onNavigate} href={routes.signIn}>Login</Link>
          </Button>
          <Button asChild>
            <Link onClick={onNavigate} href={routes.getStarted}>Get Started</Link>
          </Button>
        </div>
      </nav>
    </div>
  );
}

function MobileGroup({ title, items, onNavigate }: { title: string; items: readonly (readonly [string, MarketingRoute, string])[]; onNavigate: () => void }) {
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
    ["Product", [["How It Works", routes.howItWorks], ["Office Add-ins", routes.productOfficeAddins], ["Reliability & Citations", routes.productReliabilityCitations]]],
    ["Solutions", [["Litigation", routes.solutionLitigation], ["Transactions", routes.solutionTransactions], ["Research & Compliance", routes.solutionResearchCompliance]]],
    ["Location", [["Washington, DC", routes.location]]],
    ["Trust", [["Security", routes.security], ["About / Trust", routes.trust], ["Contact", routes.contact]]],
    ["Resources", [["Blog", routes.blog], ["Contact", routes.contact]]],
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
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-6">
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
    <section className="relative overflow-hidden bg-[#f6f4ef] px-5 py-14 lg:px-8 lg:py-[4.5rem]">
      <div className="mercy-hero-grid pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(17,24,39,0.045)_1px,transparent_1px),linear-gradient(180deg,rgba(17,24,39,0.035)_1px,transparent_1px)] bg-[size:72px_72px] opacity-45" />
      <div className="pointer-events-none absolute right-[7%] top-10 hidden h-48 w-72 rounded-[50%] border border-[#d4af37]/20 opacity-40 lg:block" />
      <div className="pointer-events-none absolute right-[12%] top-20 hidden h-24 w-44 border-t border-[#8a6b16]/20 lg:block" />
      <div className="mx-auto grid max-w-[1440px] gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8a6b16]">Mercy Legal AI</p>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-normal text-[#111827] md:text-[3.55rem]">
            Legal AI for attorneys who need speed without losing control.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[#5b564e] md:text-lg">
            Mercy combines a secure workspace, Office add-ins, matter context, D.C.-focused workflows, and a Reliability Panel for citations, source visibility, and attorney review.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-[#111827] text-white hover:bg-[#1f2937]">
              <Link href={routes.getStarted}>Get Started</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-[#111827] bg-transparent">
              <Link href={routes.howItWorks}>See How It Works <ArrowRight /></Link>
            </Button>
          </div>
          <div className="mt-8 grid max-w-xl grid-cols-3 gap-3 text-xs text-[#5b564e]">
            <div className="border-l border-[#d4af37]/55 pl-3">Workspace + Office</div>
            <div className="border-l border-[#8a6b16]/40 pl-3">Assistant layer</div>
            <div className="border-l border-[#111827]/25 pl-3">Source signals</div>
          </div>
        </div>
        <ProductArchitectureVisual />
      </div>
    </section>
  );
}

function ProductArchitectureVisual() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[#d4af37]/25 bg-[#0c111b] p-3 shadow-[0_34px_110px_rgba(5,8,15,0.34)] lg:p-4">
      <div className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-[#d4af37]/70 to-transparent" />
      <div className="mercy-float-slow absolute -right-14 top-8 size-52 rounded-full bg-[#d4af37]/10 blur-3xl" />
      <div className="mercy-float-medium absolute -bottom-24 left-16 size-64 rounded-full bg-white/5 blur-3xl" />
      <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(135deg,transparent_0_46%,#d4af37_46%_47%,transparent_47%_100%)] [background-size:84px_84px]" />
      <div className="relative rounded-lg border border-white/10 bg-[#202632] p-3">
        <div className="grid gap-3 lg:grid-cols-[1fr_0.92fr]">
          <div className="mercy-float-slow rounded-md border border-[#d4af37]/20 bg-[#f8f7f3] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
            <div className="flex items-center justify-between border-b border-black/10 pb-3">
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#8a6b16]">Mercy Workspace</p>
                <h2 className="mt-1 text-lg font-semibold text-[#111827]">Matter: Agency response review</h2>
              </div>
              <span className="rounded-full border border-[#14b8a6]/30 bg-[#14b8a6]/10 px-2.5 py-1 text-[0.68rem] font-semibold text-[#0f766e]">D.C. beta</span>
            </div>
            <div className="mt-3 grid gap-2">
              <SurfaceMini title="Matter context" meta="Documents, facts, jurisdiction" icon={BriefcaseBusiness} />
              <SurfaceMini title="Assistant layer" meta="Draft, review, reason" icon={MessageSquareText} accent="gold" />
              <SurfaceMini title="Office Add-ins" meta="Word + Outlook workflows" icon={Layers3} accent="gold" />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Signal label="Matter" value="Bounded" />
              <Signal label="D.C." value="Grounded" />
              <Signal label="Review" value="Required" />
            </div>
          </div>
          <div className="grid gap-3">
            <div className="mercy-float-medium">
              <ReliabilityPanelPreview compact />
            </div>
            <div className="rounded-md border border-white/10 bg-[#111827] p-3 text-white">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">Source nodes</p>
                <span className="mercy-source-node size-2 rounded-full bg-[#14b8a6] shadow-[0_0_18px_rgba(20,184,166,0.75)]" />
              </div>
              <div className="mt-3 grid gap-2">
                {["D.C. Code source set", "Superior Court rule context", "Local federal context"].map((item, index) => (
                  <div key={item} className="flex items-center gap-2 rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/76">
                    <span className={cn("mercy-source-node size-1.5 rounded-full", index === 0 ? "bg-[#14b8a6]" : index === 1 ? "bg-[#d4af37]" : "bg-[#6d5dfc]")} />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-md border border-white/10 bg-white/[0.04] p-3">
          <div className="grid gap-2 sm:grid-cols-4">
            {["Matter folder", "Document panel", "Assistant trace", "Citation trail"].map((item) => (
              <div key={item} className="rounded border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-medium text-white/72">{item}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SurfaceMini({ title, meta, icon: Icon, accent = "gold" }: { title: string; meta: string; icon: LucideIcon; accent?: "gold" | "navy" }) {
  return (
    <div className="rounded-md border border-black/10 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-1 size-4", accent === "navy" ? "text-[#111827]" : "text-[#8a6b16]")} />
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">{meta}</p>
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

function TrustStrip() {
  const items = [
    ["Tenant isolation", "Your matters stay isolated to your tenant."],
    ["Backend-enforced auth", "Protected workflows depend on server checks."],
    ["Office-aware auth", "Microsoft NAA primary Office auth with PKCE fallback."],
    ["Telemetry boundaries", "Raw legal text is excluded from operational telemetry."],
    ["Attorney supervision", "Attorney review remains required."],
  ] as const;

  return (
    <section className="bg-[#0f1724] px-5 py-16 text-white lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-8 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d4af37]">Trust signals</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">Security and supervision are product features, not footnotes.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-5">
          {items.map(([title, description]) => (
            <div key={title} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
              <span className="block h-1 w-10 rounded-full bg-[#d4af37]" />
              <h3 className="mt-5 text-sm font-semibold">{title}</h3>
              <p className="mt-3 text-xs leading-5 text-white/64">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a6b16]">{eyebrow}</p>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#111827] md:text-4xl">{title}</h2>
      <p className="mt-4 text-base leading-7 text-[#5b564e]">{description}</p>
    </div>
  );
}

function ProductSurfaceCard({ title, description, icon: Icon, href }: Feature & { href: MarketingRoute }) {
  return (
    <Link href={href} className="group flex min-h-[230px] flex-col rounded-lg border border-black/10 bg-[#fffdf7] p-6 shadow-[0_14px_45px_rgba(17,24,39,0.06)] transition hover:-translate-y-0.5 hover:border-[#d4af37]/35 hover:shadow-[0_24px_70px_rgba(17,24,39,0.12)]">
      <div className="flex items-center justify-between">
        <span className="grid size-10 place-items-center rounded-md border border-[#d4af37]/20 bg-white">
          <Icon className="size-5 text-[#8a6b16]" />
        </span>
        <span className="h-px w-12 bg-gradient-to-r from-[#d4af37]/50 to-transparent" />
      </div>
      <h3 className="mt-6 text-xl font-semibold leading-snug">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[#5b564e]">{description}</p>
      <span className="mt-auto pt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#111827]">Explore <ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></span>
    </Link>
  );
}

function AttorneyControlSection() {
  return (
    <section className="bg-[#111827] px-5 py-20 text-white lg:px-8">
      <div className="mx-auto grid max-w-[1440px] gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#d4af37]">Attorney control</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-normal md:text-5xl">The work stays reviewable before it leaves the firm.</h2>
          <p className="mt-5 max-w-2xl text-base leading-7 text-white/68">
            Mercy is built around matter context, source visibility, and attorney final review. The product helps attorneys move faster without treating AI output as a finished legal answer.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {([
            ["Matter context", "Facts, documents, jurisdiction, and source context remain attached.", BriefcaseBusiness, "gold"],
            ["Source visibility", "Citations, warnings, and request trace details stay near the output.", SearchCheck, "teal"],
            ["Final review", "Attorney judgment remains required before legal output is used.", UserCheck, "purple"],
          ] as const).map(([title, description, Icon, accent]) => (
            <div key={title as string} className="rounded-lg border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.18)]">
              <Icon className={cn("size-5", accent === "gold" ? "text-[#d4af37]" : accent === "teal" ? "text-[#14b8a6]" : "text-[#8b7cf6]")} />
              <h3 className="mt-5 text-lg font-semibold">{title as string}</h3>
              <p className="mt-3 text-sm leading-6 text-white/64">{description as string}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DcIntelligenceSection() {
  return (
    <section className="relative overflow-hidden bg-white px-5 py-20 lg:px-8">
      <div className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(30deg,transparent_0_48%,#8a6b16_48%_49%,transparent_49%_100%)] [background-size:96px_96px]" />
      <div className="mx-auto grid max-w-[1440px] gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6b16]">D.C.-focused intelligence</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-normal md:text-5xl">Built first around Washington, D.C. legal work.</h2>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[#5b564e]">
            Mercy keeps D.C. jurisdiction focus visible through D.C. Code-aware workflows, Superior Court rule awareness, and D.C. Circuit or local federal context where applicable.
          </p>
          <Button asChild variant="outline" className="mt-7 border-[#111827] bg-transparent">
            <Link href={routes.location}>Explore D.C. focus</Link>
          </Button>
        </div>
        <DcMapVisual />
      </div>
    </section>
  );
}

function DcMapVisual() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[#d4af37]/25 bg-[#f6f4ef] p-5 shadow-[0_24px_80px_rgba(17,24,39,0.12)]">
      <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(90deg,rgba(17,24,39,0.08)_1px,transparent_1px),linear-gradient(180deg,rgba(17,24,39,0.06)_1px,transparent_1px)] [background-size:38px_38px]" />
      <div className="relative rounded-lg border border-black/10 bg-white/78 p-5 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a6b16]">Washington, D.C.</p>
            <h3 className="mt-2 text-2xl font-semibold text-[#111827]">Local source context</h3>
          </div>
          <span className="rounded-full bg-[#14b8a6]/10 px-3 py-1 text-xs font-semibold text-[#0f766e]">Grounding visible</span>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {["D.C. Code-aware workflows", "Superior Court rule awareness", "Local federal context"].map((item, index) => (
            <div key={item} className="rounded-md border border-black/10 bg-[#fffdf7] p-4">
              <span className={cn("block h-1 w-10 rounded-full", index === 0 ? "bg-[#14b8a6]" : index === 1 ? "bg-[#d4af37]" : "bg-[#6d5dfc]")} />
              <p className="mt-4 text-sm font-semibold leading-5 text-[#111827]">{item}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 h-20 rounded-md border border-[#d4af37]/20 bg-[#111827] p-4 text-white">
          <div className="flex h-full items-end gap-2">
            {[28, 42, 58, 36, 64, 48, 74].map((height, index) => (
              <span key={index} className="w-full rounded-t bg-[#d4af37]/40" style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
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

function CtaBand({ title = "See how Mercy fits your practice.", description = "Start registration or contact Mercy for a focused walkthrough of the workspace, Office workflows, and reliability layer." }) {
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
              <Link href={routes.contact}>Contact Us</Link>
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
        <section className="bg-white px-5 py-16 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-[1440px]">
            <SectionIntro
              eyebrow="Product system"
              title="One connected legal operating environment."
              description="Mercy Workspace, Office add-ins, Vault documents, research, drafting, and reliability review share the same matter, tenant, and attorney-control model."
            />
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              <ProductSurfaceCard title="How It Works" description="Matter setup, workspace context, Assistant support, Office workflows, and attorney final review." icon={Monitor} href={routes.howItWorks} />
              <ProductSurfaceCard title="Office Add-ins" description="Draft and revise inside Word, then analyze selected text and email context in Outlook." icon={Layers3} href={routes.productOfficeAddins} />
              <ProductSurfaceCard title="Reliability & Citations" description="Citations, source visibility, confidence, D.C. grounding, warnings, and trace/request IDs." icon={PanelRight} href={routes.productReliabilityCitations} />
            </div>
          </div>
        </section>
        <section className="border-y border-black/10 bg-[#f8f5ee] px-5 py-16 lg:px-8">
          <div className="mx-auto max-w-[1440px]">
            <SectionIntro
              eyebrow="Built for practice"
              title="Solo clarity. Firm structure."
              description="The same product model adapts to individual attorneys and small firms without inventing separate products—or exposing platform-admin controls to customers."
            />
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              {audienceLinks.map(([title, href, description]) => (
                <Link
                  key={title}
                  href={href}
                  className="rounded-xl border border-black/10 bg-white p-7 shadow-[0_12px_40px_rgba(17,24,39,0.05)] transition hover:border-[#d4af37]/35"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6b16]">{title}</p>
                  <p className="mt-4 text-base leading-7 text-[#5b564e]">{description}</p>
                  <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#111827]">
                    Explore use cases <ArrowRight className="size-4" />
                  </span>
                </Link>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/sign-up/solo">Solo signup</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/sign-up/firm">Firm signup</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href={routes.security}>Security posture</Link>
              </Button>
            </div>
          </div>
        </section>
        <AttorneyControlSection />
        <DcIntelligenceSection />
        <section className="px-5 py-16 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-[1440px]">
            <SectionIntro
              eyebrow="Solutions"
              title="Litigation, transactions, and research with review boundaries."
              description="Mercy is organized around practice workflows that require source visibility, matter context, and attorney judgment—not generic chat."
            />
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {[
                ["Litigation", "Pleadings, discovery, motion drafting, document/evidence review, citations, and attorney final review.", routes.solutionLitigation, Gavel],
                ["Transactions", "Contracts, clauses, document review, negotiation prep, redline support, and Word workflows.", routes.solutionTransactions, FileText],
                ["Research & Compliance", "D.C. source grounding, rule awareness, source checking, compliance review, and attorney judgment.", routes.solutionResearchCompliance, BookOpenCheck],
              ].map(([title, description, href, Icon]) => (
                <ProductSurfaceCard key={title as string} title={title as string} description={description as string} href={href as MarketingRoute} icon={Icon as LucideIcon} />
              ))}
            </div>
          </div>
        </section>
        <TrustStrip />
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
          title="A legal AI workflow built around matters, documents, and attorney review."
          description="Mercy keeps context, documents, source visibility, and reliability signals connected as attorneys move from workspace to Assistant to Office surfaces."
        />
        <section className="px-5 pb-16 lg:px-8">
          <div className="mx-auto max-w-[1440px]">
            <WorkflowRail />
          </div>
        </section>
        <section className="border-t border-black/10 bg-white px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-[1440px]">
            <SectionIntro
              eyebrow="Workflow"
              title="From matter setup to attorney finalization."
              description="The product flow is designed around the work attorneys repeat: context, drafting, review, source checking, and final judgment."
            />
            <div className="mt-14 grid gap-4 md:grid-cols-3">
              <WorkflowCard step="01" title="Create or select a matter" description="Begin inside a specific tenant and matter boundary." />
              <WorkflowCard step="02" title="Add documents and context" description="Attach files, facts, jurisdiction focus, and attorney-selected context." />
              <WorkflowCard step="03" title="Ask the Assistant" description="Analyze, draft, cite, or review with the matter context attached." />
              <WorkflowCard step="04" title="Continue in Office" description="Use Word and Outlook add-ins for selected-text workflows." />
              <WorkflowCard step="05" title="Check reliability" description="Review citations, confidence, D.C. grounding, warnings, and trace IDs." />
              <WorkflowCard step="06" title="Attorney finalizes" description="Counsel verifies, edits, and decides what is ready to use." />
            </div>
          </div>
        </section>
        <AnchorSection id="workspace" eyebrow="Web Workspace" title="The central place for matter work." description="Use the web workspace for matter setup, document upload/review, drafting assistance, intake organization, and reliability inspection.">
          <ProductArchitectureVisual />
        </AnchorSection>
        <AnchorSection id="assistant" eyebrow="Assistant" title="Ask, draft, review, and reason with matter context." description="Mercy Assistant works from the selected matter and helps attorneys move from questions to reviewable legal work without losing source visibility.">
          <FeatureList items={["Matter-aware prompts", "Drafting and revision support", "Document and fact review", "Attorney-supervised outputs"]} />
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
        <AnchorSection id="matter-intelligence" eyebrow="Matter intelligence" title="Start with the matter, not a blank prompt." description="Mercy organizes legal work around tenant, matter, documents, facts, jurisdiction, and attorney-selected context.">
          <FeatureList items={["Tenant and matter boundaries", "Document and fact context", "Jurisdiction focus", "Traceable requests", "Attorney-review notice", "Professional judgment preserved"]} />
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
          title="Mercy supports the legal work attorneys repeat every week."
          description="Mercy supports litigation, drafting, document review, source checking, intake, Office workflows, and D.C.-focused research support with attorney review required."
        />
        <UseCase id="litigation" title="Litigation" icon={Gavel} description="Support litigation workflows with drafting, document review, source checking, matter context, and reviewable output for attorney finalization." />
        <UseCase id="drafting" title="Drafting" icon={FileText} description="Create first versions, revise selected language, and move faster while preserving attorney review and final judgment." />
        <UseCase id="review" title="Document review" icon={FileCheck2} description="Review uploaded documents or selected Office text with reliability and source signals visible." />
        <UseCase id="citations" title="Citation and source checking" icon={SearchCheck} description="Inspect source visibility, D.C. grounding, and unsupported-claim warnings before legal output is used." />
        <UseCase id="intake" title="Matter intake and organization" icon={BriefcaseBusiness} description="Capture structured context and keep legal work associated with the right matter from the beginning." />
        <UseCase id="office" title="Office workflows" icon={Layers3} description="Continue work inside Word and Outlook with selected-text drafting, analysis, and attorney-reviewed correspondence support." />
        <UseCase id="dc-research" title="D.C. legal research support" icon={BookOpenCheck} description="Use D.C.-focused source and reliability signals for D.C. Code-aware workflows, Superior Court rule awareness, and local federal context where applicable." />
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
              Mercy&apos;s roadmap includes SOC 2 readiness work, security documentation, retention/deletion controls, and DPA/security packet materials available on request. This page does not claim completed certification.
            </p>
          </div>
        </section>
        <CtaBand title="Request the security packet." description="Ask for Mercy's current security posture, roadmap notes, and Office auth explanation. Do not submit confidential client information." />
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

function ProductPageVisual({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="rounded-xl border border-[#d4af37]/20 bg-[#171b24] p-5 text-white shadow-[0_34px_100px_rgba(5,8,15,0.26)]">
      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-md bg-[#d4af37]/12 text-[#d4af37]">
              <Icon className="size-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-white/50">Mercy product surface</p>
              <h2 className="mt-1 text-xl font-semibold">{title}</h2>
            </div>
          </div>
          <span className="rounded-full bg-[#14b8a6]/12 px-3 py-1 text-xs font-semibold text-[#5eead4]">Reviewable</span>
        </div>
        <div className="mt-5 grid gap-3">
          <div className="rounded-md border border-white/10 bg-white/[0.05] p-4">
            <p className="text-xs text-white/50">Matter context</p>
            <p className="mt-2 text-sm font-medium">Documents, facts, jurisdiction, and selected sources remain attached.</p>
          </div>
          <ReliabilityPanelPreview compact />
        </div>
      </div>
    </div>
  );
}

function WorkflowRail() {
  const steps = [
    ["Matter", BriefcaseBusiness],
    ["Documents", FileText],
    ["Assistant", MessageSquareText],
    ["Office", Layers3],
    ["Reliability", PanelRight],
    ["Attorney review", UserCheck],
  ] as const;

  return (
    <div className="rounded-xl border border-black/10 bg-white p-5 shadow-[0_20px_70px_rgba(17,24,39,0.08)]">
      <div className="grid gap-3 md:grid-cols-6">
        {steps.map(([label, Icon], index) => (
          <div key={label} className="mercy-float-slow relative rounded-lg border border-black/10 bg-[#fffdf7] p-4">
            {index < steps.length - 1 ? <span className="absolute right-[-14px] top-1/2 hidden h-px w-7 bg-[#d4af37]/50 md:block" /> : null}
            <Icon className={cn("size-5", index === 2 ? "text-[#6d5dfc]" : index === 4 ? "text-[#14b8a6]" : "text-[#8a6b16]")} />
            <p className="mt-4 text-sm font-semibold">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function OfficeAddinsVisual() {
  return (
    <div className="rounded-xl border border-[#d4af37]/20 bg-[#171b24] p-4 text-white shadow-[0_34px_100px_rgba(5,8,15,0.26)]">
      <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <div className="rounded-lg border border-white/10 bg-[#f8f7f3] p-4 text-[#111827]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6b16]">Word</p>
          <h3 className="mt-2 text-lg font-semibold">Draft revision</h3>
          <div className="mt-4 space-y-2">
            <div className="h-2 rounded bg-slate-300" />
            <div className="h-2 w-4/5 rounded bg-slate-200" />
            <div className="h-2 w-2/3 rounded bg-[#d4af37]/30" />
          </div>
        </div>
        <div className="grid size-16 place-items-center rounded-full border border-[#6d5dfc]/30 bg-[#6d5dfc]/15 text-[#c4b5fd]">
          <MessageSquareText className="size-6" />
        </div>
        <div className="rounded-lg border border-white/10 bg-[#202632] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">Outlook</p>
          <h3 className="mt-2 text-lg font-semibold">Selected-text analysis</h3>
          <div className="mt-4 rounded-md border border-[#14b8a6]/20 bg-[#14b8a6]/10 px-3 py-2 text-xs text-[#99f6e4]">Reliability signal connected</div>
        </div>
      </div>
    </div>
  );
}

function ReliabilityShowcase() {
  return (
    <div className="rounded-xl border border-[#d4af37]/20 bg-[#0c111b] p-4 text-white shadow-[0_34px_100px_rgba(5,8,15,0.28)]">
      <div className="grid gap-3 md:grid-cols-2">
        {([
          ["Citation", "D.C. source visible", SearchCheck, "teal"],
          ["Confidence", "Review before use", ShieldCheck, "gold"],
          ["Warning", "Unsupported claim flagged", FileCheck2, "purple"],
          ["Trace ID", "req_7D4A", Fingerprint, "teal"],
        ] as const).map(([title, value, Icon, accent]) => (
          <div key={title as string} className="rounded-md border border-white/10 bg-white/[0.05] p-4">
            <Icon className={cn("size-5", accent === "gold" ? "text-[#d4af37]" : accent === "purple" ? "text-[#8b7cf6]" : "text-[#14b8a6]")} />
            <p className="mt-4 text-xs uppercase tracking-[0.14em] text-white/45">{title as string}</p>
            <p className="mt-1 text-sm font-semibold">{value as string}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SolutionFlowVisual({ solution }: { solution: SolutionKey }) {
  const flows: Record<SolutionKey, string[]> = {
    litigation: ["Matter file", "Discovery docs", "Argument draft", "Citation check", "Reliability review"],
    transactions: ["Contract", "Clause extraction", "Risk flags", "Redline support", "Negotiation prep"],
    researchCompliance: ["D.C. question", "Local sources", "Cited answer", "Compliance review", "Attorney judgment"],
    drafting: ["Matter", "Draft", "Revise", "Review", "Finalize"],
    review: ["Document", "Issues", "Sources", "Warnings", "Review"],
    citations: ["Output", "Citations", "Grounding", "Warnings", "Trace"],
    intake: ["Intake", "Facts", "Documents", "Context", "Matter"],
    office: ["Word", "Outlook", "Assistant", "Sources", "Finalize"],
    dcResearch: ["D.C. question", "Code", "Rules", "Citations", "Review"],
  };

  return (
    <div className="rounded-xl border border-black/10 bg-[#fffdf7] p-5 shadow-[0_20px_70px_rgba(17,24,39,0.08)]">
      <div className="grid gap-3 md:grid-cols-5">
        {flows[solution].map((label, index) => (
          <div key={label} className="relative rounded-lg border border-black/10 bg-white p-4">
            {index < flows[solution].length - 1 ? <span className="absolute right-[-14px] top-1/2 hidden h-px w-7 bg-[#d4af37]/50 md:block" /> : null}
            <span className={cn("block h-1 w-8 rounded-full", index === 3 ? "bg-[#14b8a6]" : index === 2 ? "bg-[#6d5dfc]" : "bg-[#d4af37]")} />
            <p className="mt-4 text-sm font-semibold">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProductOverviewPage() {
  return (
    <MarketingShell>
      <main>
        <PageHero
          eyebrow="Product"
          title="One Mercy system across the surfaces where attorneys work."
          description="Mercy connects the Web Workspace, Assistant, Word Add-in, Outlook Add-in, Reliability Panel, and Matter Intelligence around attorney-supervised legal work."
        />
        <section className="px-5 py-20 lg:px-8">
          <div className="mx-auto grid max-w-[1440px] gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ProductSurfaceCard title="How It Works" description="The full Mercy workflow from matter setup through attorney review." icon={Monitor} href={routes.howItWorks} />
            <ProductSurfaceCard title="Office Add-ins" description="Word drafting and Outlook selected-text workflows connected to matter context." icon={Layers3} href={routes.productOfficeAddins} />
            <ProductSurfaceCard title="Reliability & Citations" description="Source visibility, confidence, D.C. grounding, warnings, and trace IDs." icon={PanelRight} href={routes.productReliabilityCitations} />
          </div>
        </section>
        <CtaBand title="See the Mercy product system." description="Request a walkthrough of Workspace, Assistant, Office add-ins, and Reliability Panel review flows." />
      </main>
    </MarketingShell>
  );
}

export function ProductDetailPage({ product }: { product: ProductKey }) {
  const item = productPages[product];
  return (
    <MarketingShell>
      <main>
        <section className="px-5 py-20 lg:px-8 lg:py-24">
          <div className="mx-auto grid max-w-[1440px] gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6b16]">{item.eyebrow}</p>
              <h1 className="mt-5 text-5xl font-semibold leading-[1.05] tracking-normal text-[#111827] md:text-7xl">{item.title}</h1>
              <p className="mt-7 max-w-3xl text-lg leading-8 text-[#5b564e]">{item.description}</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild><Link href={routes.contact}>Request Demo</Link></Button>
                <Button asChild variant="outline" className="border-[#111827] bg-transparent"><Link href={routes.getStarted}>Get Started</Link></Button>
              </div>
            </div>
            <ProductPageVisual icon={item.icon} title={item.eyebrow} />
          </div>
        </section>
        <section className="bg-white px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-[1440px]">
            <SectionIntro eyebrow="Workflow" title="A controlled workflow, not a loose prompt." description="Each product surface keeps the matter, documents, and review signals close to the work." />
            <div className="mt-14 grid gap-4 md:grid-cols-4">
              {item.workflow.map((step, index) => (
                <WorkflowCard key={step} step={`0${index + 1}`} title={step} description="Mercy keeps this step tied to matter context and attorney review." />
              ))}
            </div>
          </div>
        </section>
        <section className="px-5 py-20 lg:px-8">
          <div className="mx-auto grid max-w-[1440px] gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6b16]">Attorney review</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-normal">Built to assist legal work under attorney supervision.</h2>
              <p className="mt-5 text-base leading-7 text-[#5b564e]">{item.note}</p>
            </div>
            <ReliabilityPanelPreview />
          </div>
        </section>
        <CtaBand />
      </main>
    </MarketingShell>
  );
}

export function OfficeAddinsPage() {
  return (
    <MarketingShell>
      <main>
        <section className="px-5 py-20 lg:px-8 lg:py-24">
          <div className="mx-auto grid max-w-[1440px] gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6b16]">Office Add-ins</p>
              <h1 className="mt-5 text-5xl font-semibold leading-[1.05] tracking-normal text-[#111827] md:text-6xl">Legal AI inside Word and Outlook.</h1>
              <p className="mt-7 max-w-3xl text-lg leading-8 text-[#5b564e]">
                Mercy supports drafting and revision inside Word, plus selected-text and email-context workflows in Outlook, while keeping matter context and attorney review close.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild><Link href={routes.contact}>Request Demo</Link></Button>
                <Button asChild variant="outline" className="border-[#111827] bg-transparent"><Link href={routes.getStarted}>Get Started</Link></Button>
              </div>
            </div>
            <OfficeAddinsVisual />
          </div>
        </section>
        <section className="bg-white px-5 py-20 lg:px-8">
          <div className="mx-auto grid max-w-[1440px] gap-4 md:grid-cols-2">
            <InfoCard title="Word drafting and revision" description="Draft, revise, cite, and review selected legal text where documents are already being written." icon={FileText} />
            <InfoCard title="Outlook selected-text support" description="Analyze selected message text and prepare attorney-reviewed responses with email context in view." icon={MailCheck} />
          </div>
        </section>
        <section className="px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-[1440px]">
            <SectionIntro eyebrow="Workflow" title="Office-first without losing matter context." description="Mercy is designed to support normal attorney work surfaces rather than forcing sensitive work into a disconnected tool." />
            <div className="mt-14 grid gap-4 md:grid-cols-4">
              <WorkflowCard step="01" title="Select text" description="Start from Word content or Outlook message context." />
              <WorkflowCard step="02" title="Ask Mercy" description="Request drafting, revision, analysis, or response support." />
              <WorkflowCard step="03" title="Review signals" description="Check citations, source visibility, warnings, and grounding." />
              <WorkflowCard step="04" title="Attorney finalizes" description="Counsel edits, verifies, and decides what is used or sent." />
            </div>
          </div>
        </section>
        <CtaBand />
      </main>
    </MarketingShell>
  );
}

export function ReliabilityCitationsPage() {
  return (
    <MarketingShell>
      <main>
        <section className="px-5 py-20 lg:px-8 lg:py-24">
          <div className="mx-auto grid max-w-[1440px] gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6b16]">Reliability & Citations</p>
              <h1 className="mt-5 text-5xl font-semibold leading-[1.05] tracking-normal text-[#111827] md:text-6xl">A review layer for source-aware legal AI.</h1>
              <p className="mt-7 max-w-3xl text-lg leading-8 text-[#5b564e]">
                Mercy surfaces citations, source visibility, confidence, D.C. grounding, unsupported-claim warnings, attorney-review flags, and trace/request IDs.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild><Link href={routes.contact}>Request Demo</Link></Button>
                <Button asChild variant="outline" className="border-[#111827] bg-transparent"><Link href={routes.howItWorks}>See How It Works</Link></Button>
              </div>
            </div>
            <ReliabilityShowcase />
          </div>
        </section>
        <section className="bg-white px-5 py-20 lg:px-8">
          <div className="mx-auto grid max-w-[1440px] gap-4 md:grid-cols-3">
            <InfoCard title="Source visibility" description="Citations and source indicators stay near the work so attorneys can inspect support before use." icon={SearchCheck} />
            <InfoCard title="D.C. grounding" description="D.C.-focused source grounding is visible where applicable to the workflow and source set." icon={BookOpenCheck} />
            <InfoCard title="Attorney-review flags" description="Warnings and review reminders keep outputs positioned for supervised legal work." icon={UserCheck} />
          </div>
        </section>
        <CtaBand />
      </main>
    </MarketingShell>
  );
}

export function SolutionsOverviewPage() {
  return (
    <MarketingShell>
      <main>
        <PageHero
          eyebrow="Solutions"
          title="Legal workflows where Mercy adds structure, speed, and reviewability."
          description="Mercy is organized around repeatable legal workflows: litigation, drafting, review, citation checking, intake, Office work, and D.C. research support."
        />
        <section className="px-5 py-20 lg:px-8">
          <div className="mx-auto grid max-w-[1440px] gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ProductSurfaceCard title="Litigation" description={solutionPages.litigation.description} icon={Gavel} href={routes.solutionLitigation} />
            <ProductSurfaceCard title="Transactions" description={solutionPages.transactions.description} icon={BriefcaseBusiness} href={routes.solutionTransactions} />
            <ProductSurfaceCard title="Research & Compliance" description={solutionPages.researchCompliance.description} icon={BookOpenCheck} href={routes.solutionResearchCompliance} />
          </div>
        </section>
        <CtaBand title="Map Mercy to your workflow." description="Request a walkthrough of the legal workflows Mercy supports today." />
      </main>
    </MarketingShell>
  );
}

export function SolutionDetailPage({ solution }: { solution: SolutionKey }) {
  const item = solutionPages[solution];
  return (
    <MarketingShell>
      <main>
        <PageHero eyebrow="Solution" title={item.title} description={item.description} />
        <section className="px-5 pb-12 lg:px-8">
          <div className="mx-auto max-w-[1440px]">
            <SolutionFlowVisual solution={solution} />
          </div>
        </section>
        <section className="px-5 py-20 lg:px-8">
          <div className="mx-auto grid max-w-[1440px] gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <InfoCard title="Problem Mercy helps solve" description={item.problem} icon={item.icon} />
            <div className="rounded-xl border border-black/10 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-semibold">Mercy workflow</h2>
              <div className="mt-6 grid gap-3 md:grid-cols-2">
                {item.workflow.map((step, index) => (
                  <WorkflowCard key={step} step={`0${index + 1}`} title={step} description="Structured for matter context, source visibility, and attorney review." />
                ))}
              </div>
            </div>
          </div>
        </section>
        <section className="bg-white px-5 py-20 lg:px-8">
          <div className="mx-auto grid max-w-[1440px] gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6b16]">What the attorney sees</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-normal">A reviewable workspace, not a black box.</h2>
              <div className="mt-8">
                <FeatureList items={item.sees} />
              </div>
              <p className="mt-6 text-sm leading-6 text-[#5b564e]">Mercy assists attorney-supervised legal work. Attorneys remain responsible for reviewing outputs before use.</p>
            </div>
            <ReliabilityPanelPreview />
          </div>
        </section>
        <CtaBand />
      </main>
    </MarketingShell>
  );
}

export function LocationPage() {
  return (
    <MarketingShell>
      <main>
        <section className="relative overflow-hidden px-5 py-20 lg:px-8 lg:py-24">
          <div className="mercy-hero-grid pointer-events-none absolute inset-0 opacity-[0.22] [background-image:linear-gradient(90deg,rgba(17,24,39,0.08)_1px,transparent_1px),linear-gradient(180deg,rgba(17,24,39,0.06)_1px,transparent_1px)] [background-size:64px_64px]" />
          <div className="mx-auto grid max-w-[1440px] gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6b16]">Location</p>
              <h1 className="mt-5 max-w-5xl text-5xl font-semibold leading-[1.05] tracking-normal text-[#111827] md:text-7xl">Built first for Washington, D.C. legal work.</h1>
              <p className="mt-7 max-w-3xl text-lg leading-8 text-[#5b564e]">
                Mercy is focused first on Washington, D.C. so the beta can be explicit about jurisdiction, source grounding, and attorney review before expanding to additional jurisdictions.
              </p>
            </div>
            <DcMapVisual />
          </div>
        </section>
        <section className="px-5 py-20 lg:px-8">
          <div className="mx-auto grid max-w-[1440px] gap-4 md:grid-cols-2 lg:grid-cols-3">
            <InfoCard title="D.C.-focused beta" description="Mercy is being shaped around D.C. workflows first, with measured expansion planned later." icon={BookOpenCheck} />
            <InfoCard title="D.C. Code-aware workflows" description="Product flows can preserve D.C. jurisdiction focus and surface source grounding for attorney review." icon={Scale} />
            <InfoCard title="Superior Court awareness" description="Mercy is designed to keep D.C. Superior Court rule awareness visible where applicable, without replacing attorney verification." icon={Gavel} />
            <InfoCard title="Local federal context" description="D.C. Circuit and local federal context can be considered where applicable to the matter and source set." icon={SearchCheck} />
            <InfoCard title="Source grounding" description="Reliability signals help attorneys inspect citations, warnings, and trace details before use." icon={PanelRight} />
            <InfoCard title="Attorney review required" description="Mercy assists supervised legal work. Attorneys remain responsible for reviewing outputs." icon={UserCheck} />
          </div>
        </section>
        <section className="bg-white px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-[1440px] rounded-xl border border-black/10 bg-[#f6f4ef] p-8 md:p-12">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6b16]">D.C. legal workflow layer</p>
            <h2 className="mt-4 text-3xl font-semibold">Practical local work, organized for attorney review.</h2>
            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {["Litigation support", "Landlord-tenant", "Small business and contracts", "Estate planning", "Family law", "Administrative matters"].map((item) => (
                <div key={item} className="flex gap-3 rounded-lg border border-black/10 bg-white p-5 shadow-sm">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#8a6b16]" />
                  <span className="text-sm font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="px-5 py-20 lg:px-8">
          <div className="mx-auto grid max-w-[1440px] gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6b16]">Reliability + attorney review</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-normal">D.C. grounding signals, not guaranteed answers.</h2>
              <p className="mt-5 text-base leading-7 text-[#5b564e]">
                Mercy surfaces source visibility, D.C. grounding signals, unsupported-claim warnings, and review reminders. Attorney review remains required, and additional jurisdictions come later.
              </p>
            </div>
            <ReliabilityPanelPreview />
          </div>
        </section>
        <section className="bg-white px-5 py-16 lg:px-8">
          <div className="mx-auto max-w-[1440px] rounded-xl border border-[#d4af37]/20 bg-[#fffdf7] p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6b16]">Expansion later</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-normal">Washington, D.C. first for beta.</h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-[#5b564e]">
              Mercy is intentionally focused on D.C. workflows before expanding to additional jurisdictions. This page does not claim complete D.C. law coverage or guaranteed legal accuracy.
            </p>
          </div>
        </section>
        <CtaBand title="Discuss D.C.-focused workflows." description="Request a walkthrough of how Mercy handles matter context, source grounding, and attorney review for Washington, DC legal work." />
      </main>
    </MarketingShell>
  );
}

export function ResourcesPage() {
  const cards = [
    ["Legal AI ethics guide for attorneys", "Coming soon", routes.trust, Scale],
    ["D.C. attorney AI checklist", "Coming soon", routes.security, CheckCircle2],
    ["Using Mercy in Office", "Guide", routes.productOfficeAddins, Layers3],
    ["Matter-centered AI guide", "Guide", routes.howItWorks, BriefcaseBusiness],
    ["Citation and Reliability Panel guide", "Guide", routes.productReliabilityCitations, SearchCheck],
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

export function BlogPage() {
  return (
    <MarketingShell>
      <main>
        <PageHero
          eyebrow="Blog"
          title="Product notes for attorney-supervised legal AI."
          description="Mercy's blog will cover product updates, D.C.-focused workflows, Office add-ins, reliability review, and responsible legal AI habits."
        />
        <section className="px-5 py-20 lg:px-8">
          <div className="mx-auto grid max-w-[1440px] gap-4 md:grid-cols-3">
            <ResourceCard title="D.C. attorney AI checklist" tag="Coming soon" href={routes.location} icon={BookOpenCheck} />
            <ResourceCard title="Using Mercy in Office" tag="Coming soon" href={routes.productOfficeAddins} icon={Layers3} />
            <ResourceCard title="Citation and Reliability Panel guide" tag="Coming soon" href={routes.productReliabilityCitations} icon={PanelRight} />
          </div>
        </section>
        <CtaBand title="Have a resource request?" description="Contact Mercy for product education, trust materials, or a focused walkthrough." />
      </main>
    </MarketingShell>
  );
}

function ResourceCard({ title, tag, href, icon: Icon }: { title: string; tag: string; href: MarketingRoute; icon: LucideIcon }) {
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
          description="Tell us how your practice works and which surfaces matter most: Workspace, Assistant, Word, Outlook, or all Mercy surfaces."
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
                <MarketingField label="Number of attorneys" type="number" />
                <MarketingField label="Practice area" />
              </div>
              <label className="mt-5 grid gap-2 text-sm font-medium">
                Interested in
                <select className="h-11 rounded-md border border-black/10 bg-white px-3 text-sm outline-none ring-[#d4af37]/30 focus:ring-2" defaultValue="all">
                  <option value="workspace">Workspace</option>
                  <option value="assistant">Assistant</option>
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
