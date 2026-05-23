import type { Metadata } from "next";
import { ResourcesPage } from "@/components/marketing/marketing-site";

export const metadata: Metadata = {
  title: "Resources | Mercy Legal AI",
  description: "Guides for attorney-supervised legal AI, D.C.-focused workflows, Office add-ins, reliability, and security posture.",
};

export default function Page() {
  return <ResourcesPage />;
}
