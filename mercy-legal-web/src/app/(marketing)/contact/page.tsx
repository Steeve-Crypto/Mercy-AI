import type { Metadata } from "next";
import { ContactPage } from "@/components/marketing/marketing-site";

export const metadata: Metadata = {
  title: "Contact | Mercy Legal AI",
  description: "Request a Mercy demo for the Web Workspace, Microsoft Word add-in, Microsoft Outlook add-in, and D.C.-focused beta workflows.",
};

export default function Page() {
  return <ContactPage />;
}
