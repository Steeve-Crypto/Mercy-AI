import type { Metadata } from "next";
import { HomeMarketingPage } from "@/components/marketing/marketing-site";

export const metadata: Metadata = {
  title: "Mercy Legal AI | Attorney-Controlled Legal AI",
  description: "Legal AI for attorneys who need speed without losing control across the Mercy Web Workspace, Word, and Outlook.",
};

export default function MarketingPage() {
  return <HomeMarketingPage />;
}
