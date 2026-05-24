import type { Metadata } from "next";
import { SolutionDetailPage } from "@/components/marketing/marketing-site";

export const metadata: Metadata = {
  title: "Research & Compliance | Mercy Legal AI",
  description: "D.C. source grounding, source checking, compliance review, and attorney-supervised research support.",
};

export default function Page() {
  return <SolutionDetailPage solution="researchCompliance" />;
}
