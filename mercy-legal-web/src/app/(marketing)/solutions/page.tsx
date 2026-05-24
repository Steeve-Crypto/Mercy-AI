import type { Metadata } from "next";
import { SolutionsOverviewPage } from "@/components/marketing/marketing-site";

export const metadata: Metadata = {
  title: "Solutions | Mercy Legal AI",
  description: "Explore Mercy workflows for litigation, drafting, document review, citation checking, intake, Office, and D.C. research support.",
};

export default function Page() {
  return <SolutionsOverviewPage />;
}
