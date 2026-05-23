import type { Metadata } from "next";
import { UseCasesPage } from "@/components/marketing/marketing-site";

export const metadata: Metadata = {
  title: "Use Cases | Mercy Legal AI",
  description: "Matter intake, document review, drafting, source checking, D.C. research support, and Office-first legal AI workflows.",
};

export default function Page() {
  return <UseCasesPage />;
}
