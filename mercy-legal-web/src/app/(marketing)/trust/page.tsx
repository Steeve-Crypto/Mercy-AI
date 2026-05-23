import type { Metadata } from "next";
import { TrustPage } from "@/components/marketing/marketing-site";

export const metadata: Metadata = {
  title: "Trust | Mercy Legal AI",
  description: "Mercy's attorney-control principles for practical, affordable, controlled legal AI for attorneys and small firms.",
};

export default function Page() {
  return <TrustPage />;
}
