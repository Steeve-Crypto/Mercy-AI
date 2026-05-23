"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type CheckoutButtonProps = {
  plan: string;
  label: string;
  featured?: boolean;
  className?: string;
};

export function CheckoutButton({ plan, label, featured, className }: CheckoutButtonProps) {
  return (
    <Button
      asChild
      className={className}
      variant={featured ? "gold" : "outline"}
      size="lg"
    >
      <Link href={plan === "small-firm" || plan === "firm" ? "/sign-up/firm" : "/sign-up/solo"}>
        <Sparkles />
        {label}
      </Link>
    </Button>
  );
}
