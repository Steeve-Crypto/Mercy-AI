import type { Metadata } from "next";
import { SolutionDetailPage } from "@/components/marketing/marketing-site";

export const metadata: Metadata = {
  title: "Litigation | Mercy Legal AI",
  description: "Mercy supports litigation workflows with matter context, drafting, review, source checking, and attorney finalization.",
};

export default function Page() {
  return <SolutionDetailPage solution="litigation" />;
}
