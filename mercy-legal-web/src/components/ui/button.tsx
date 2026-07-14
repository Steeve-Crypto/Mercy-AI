import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mercy-gold)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--mercy-brand)] text-white shadow-sm hover:bg-[var(--mercy-brand-soft)]",
        gold:
          "gold-sheen bg-[var(--mercy-brand-gold)] text-[var(--mercy-brand)] shadow-sm hover:brightness-95",
        outline:
          "border border-[var(--mercy-border-strong)] bg-[var(--mercy-card)] text-[var(--mercy-fg-strong)] shadow-sm hover:bg-[var(--mercy-secondary)]",
        ghost: "text-[var(--mercy-fg)] hover:bg-[var(--mercy-secondary)]",
        subtle: "bg-[var(--mercy-secondary)] text-[var(--mercy-fg-strong)] hover:bg-[var(--mercy-muted)]",
        danger:
          "bg-[var(--mercy-danger)] text-white hover:opacity-90",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-5 text-[0.95rem]",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
