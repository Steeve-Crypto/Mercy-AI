"use client";

import { useState } from "react";
import { CreditCard, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type CheckoutButtonProps = {
  plan: string;
  label: string;
  featured?: boolean;
  className?: string;
};

export function CheckoutButton({ plan, label, featured, className }: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);

  async function startCheckout() {
    setLoading(true);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await response.json()) as { url?: string };

      if (data.url) {
        window.location.href = data.url;
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      onClick={startCheckout}
      className={className}
      variant={featured ? "gold" : "outline"}
      size="lg"
      disabled={loading}
    >
      {loading ? <Loader2 className="animate-spin" /> : featured ? <Sparkles /> : <CreditCard />}
      {label}
    </Button>
  );
}
