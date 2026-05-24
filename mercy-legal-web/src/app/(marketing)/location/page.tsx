import type { Metadata } from "next";
import { LocationPage } from "@/components/marketing/marketing-site";

export const metadata: Metadata = {
  title: "Washington, DC Focus | Mercy Legal AI",
  description: "Mercy is built first for Washington, DC legal work with D.C.-focused workflows, source grounding, and attorney review.",
};

export default function Page() {
  return <LocationPage />;
}
