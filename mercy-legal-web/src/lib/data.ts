import { Archive, BookOpen, BrainCircuit, BriefcaseBusiness, FileCheck2, Gauge, MessageSquareText } from "lucide-react";

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
