import type { Metadata } from "next";
import { ProductOverviewPage } from "@/components/marketing/marketing-site";

export const metadata: Metadata = {
  title: "Product | Mercy Legal AI",
  description: "Explore Mercy Workspace, Assistant, Word Add-in, Outlook Add-in, Reliability Panel, and Matter Intelligence.",
};

export default function Page() {
  return <ProductOverviewPage />;
}
