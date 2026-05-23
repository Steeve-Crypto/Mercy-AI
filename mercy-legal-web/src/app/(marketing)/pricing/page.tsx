import type { Metadata } from "next";
import { PricingPage } from "@/components/marketing/marketing-site";

export const metadata: Metadata = {
  title: "Pricing | Mercy Legal AI",
  description: "Mercy beta pricing for solo practitioners and small firms. Payment and onboarding come in a later implementation pass.",
};

export default function Page() {
  return <PricingPage />;
}
