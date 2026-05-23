import type { Metadata } from "next";
import { HowItWorksPage } from "@/components/marketing/marketing-site";

export const metadata: Metadata = {
  title: "How Mercy Works | Mercy Legal AI",
  description: "See how Mercy supports matter-centered work across the Web Workspace, Microsoft Word, Microsoft Outlook, and the Reliability Panel.",
};

export default function Page() {
  return <HowItWorksPage />;
}
