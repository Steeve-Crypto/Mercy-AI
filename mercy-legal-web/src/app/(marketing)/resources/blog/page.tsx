import type { Metadata } from "next";
import { BlogPage } from "@/components/marketing/marketing-site";

export const metadata: Metadata = {
  title: "Blog | Mercy Legal AI",
  description: "Product notes and beta updates for Mercy Legal AI.",
};

export default function Page() {
  return <BlogPage />;
}
