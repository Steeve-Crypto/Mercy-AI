import type { Metadata } from "next";
import { SolutionDetailPage } from "@/components/marketing/marketing-site";

export const metadata: Metadata = {
  title: "Transactions | Mercy Legal AI",
  description: "Mercy supports contracts, clauses, document review, negotiation prep, redline support, and reliability checks.",
};

export default function Page() {
  return <SolutionDetailPage solution="transactions" />;
}
