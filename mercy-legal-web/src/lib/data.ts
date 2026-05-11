import {
  Archive,
  BookOpen,
  BrainCircuit,
  BriefcaseBusiness,
  FileCheck2,
  FileText,
  Gauge,
  Landmark,
  MessageSquareText,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export const features = [
  {
    icon: BrainCircuit,
    title: "DC-aware legal AI",
    description:
      "Ask questions across matters, drafts, and local clause guidance with context tuned for small Washington DC practices.",
  },
  {
    icon: FileCheck2,
    title: "Contract risk review",
    description:
      "Spot risky clauses, missing protections, and negotiation points with concise attorney-ready summaries.",
  },
  {
    icon: Archive,
    title: "Organized document vault",
    description:
      "Upload, tag, and retrieve client documents without leaving the assistant workflow.",
  },
  {
    icon: BookOpen,
    title: "Clause library",
    description:
      "Search DC-specific clauses, explanations, and practical drafting notes in one polished workspace.",
  },
];

export const testimonials = [
  {
    quote:
      "Mercy gives our tiny team the leverage of a larger research department without forcing us into enterprise software.",
    name: "Amara C.",
    role: "Managing Attorney, Dupont Circle",
  },
  {
    quote:
      "The contract review flow is fast, calm, and clear. It lets me get to judgment instead of wrestling with tools.",
    name: "Jonathan R.",
    role: "Solo Business Counsel, Capitol Hill",
  },
  {
    quote:
      "I finally have a legal AI workspace that feels built for the way small DC firms actually practice.",
    name: "Priya S.",
    role: "Partner, Boutique Litigation Firm",
  },
];

export const pricingTiers = [
  {
    id: "solo",
    name: "Solo",
    price: "$129",
    description: "For individual attorneys building an AI-assisted practice.",
    features: ["1 attorney seat", "25 document analyses", "DC clause library", "Matter history"],
  },
  {
    id: "small-firm",
    name: "Small Firm",
    price: "$349",
    description: "For lean teams that need shared matters and document workflows.",
    features: ["5 attorney seats", "150 document analyses", "Shared vault", "Priority onboarding"],
    featured: true,
  },
  {
    id: "practice",
    name: "Practice",
    price: "Custom",
    description: "For firms ready to standardize AI across practice groups.",
    features: ["Custom seats", "Firm playbooks", "Admin controls", "Dedicated support"],
  },
];

export const pluginFeatures = [
  "Real-time risk highlighting inside Word",
  "Explain this clause with DC context",
  "Insert DC standard clauses from the library",
  "Sidebar chat for the active matter",
  "Generate risk reports into the document",
];

export const authBenefits = [
  "Firm workspace with matter isolation",
  "Attorney-controlled document vault",
  "Subscription checkout for solo and small firm plans",
];

export const navItems = [
  { label: "Assistant", icon: MessageSquareText },
  { label: "Document Vault", icon: Archive },
  { label: "Contract Analyzer", icon: FileCheck2 },
  { label: "Clause Library", icon: BookOpen },
  { label: "Matters", icon: BriefcaseBusiness },
  { label: "Activity", icon: Gauge },
];

export const documents = [
  { name: "Lease Amendment - Shaw Retail", type: "Contract", matter: "Dawson v. Mercer", status: "Analyzed" },
  { name: "Operating Agreement v4", type: "LLC", matter: "North Capitol Holdings", status: "Needs review" },
  { name: "Discovery Responses", type: "Litigation", matter: "Banneker Labs", status: "Summarized" },
];

export const clauses = [
  {
    title: "DC Tenant Estoppel Certificate",
    category: "Real Estate",
    risk: "Medium",
    summary: "Clarifies lease status, defaults, and representations before assignment or financing.",
  },
  {
    title: "Non-Compete Savings Clause",
    category: "Employment",
    risk: "High",
    summary: "Flags enforceability concerns and points counsel toward narrower confidentiality language.",
  },
  {
    title: "Prompt Payment Act Interest",
    category: "Commercial",
    risk: "Low",
    summary: "Adds statutory interest and fee language for qualifying DC construction or public payment matters.",
  },
];

export const matters = [
  { client: "North Capitol Holdings", matter: "LLC operating agreement", status: "Drafting", next: "Revise transfer clause" },
  { client: "Banneker Labs", matter: "Commercial dispute", status: "Discovery", next: "Summarize RFP responses" },
  { client: "Dawson Retail", matter: "Lease amendment", status: "Negotiation", next: "Review indemnity markup" },
];

export const activity = [
  { icon: Sparkles, label: "AI summary created", detail: "Discovery Responses, 14 pages", time: "8 min ago" },
  { icon: ShieldCheck, label: "Risk score updated", detail: "Operating Agreement v4 moved to 72", time: "28 min ago" },
  { icon: FileText, label: "Document uploaded", detail: "Lease Amendment - Shaw Retail", time: "1 hr ago" },
  { icon: Landmark, label: "DC clause copied", detail: "Prompt Payment Act Interest", time: "Yesterday" },
];

export const analysisBreakdown = [
  { label: "Ambiguous indemnity scope", score: 82, tone: "High" },
  { label: "Missing DC venue language", score: 64, tone: "Medium" },
  { label: "Strong confidentiality baseline", score: 22, tone: "Low" },
  { label: "Termination notice needs detail", score: 57, tone: "Medium" },
];

export const dashboardStats = [
  { label: "Active matters", value: "18", icon: BriefcaseBusiness },
  { label: "Docs reviewed", value: "247", icon: FileCheck2 },
  { label: "Risk items", value: "31", icon: Scale },
  { label: "Hours saved", value: "86", icon: Sparkles },
];
