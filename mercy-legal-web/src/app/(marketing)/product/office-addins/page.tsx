import type { Metadata } from "next";
import { OfficeAddinsPage } from "@/components/marketing/marketing-site";

export const metadata: Metadata = {
  title: "Office Add-ins | Mercy Legal AI",
  description: "Mercy Office Add-ins support Word drafting and Outlook selected-text workflows with matter context and attorney review.",
};

export default function Page() {
  return <OfficeAddinsPage />;
}
