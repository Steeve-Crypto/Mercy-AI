import type { Metadata } from "next";
import { SecurityPage } from "@/components/marketing/marketing-site";

export const metadata: Metadata = {
  title: "Security | Mercy Legal AI",
  description: "Mercy's beta security posture covers backend-enforced auth, tenant isolation, Office auth, admin provisioning, and attorney review.",
};

export default function Page() {
  return <SecurityPage />;
}
