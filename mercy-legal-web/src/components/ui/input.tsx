import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-[var(--mercy-border-strong)] bg-[var(--mercy-card)] px-3 py-2 text-sm text-[var(--mercy-fg-strong)] shadow-sm transition-colors placeholder:text-[var(--mercy-fg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mercy-brand-gold)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
