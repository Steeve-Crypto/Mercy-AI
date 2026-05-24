import type { Metadata } from "next";
import { ReliabilityCitationsPage } from "@/components/marketing/marketing-site";

export const metadata: Metadata = {
  title: "Reliability & Citations | Mercy Legal AI",
  description: "Mercy surfaces citations, source visibility, confidence, D.C. grounding, warnings, review flags, and trace details.",
};

export default function Page() {
  return <ReliabilityCitationsPage />;
}
