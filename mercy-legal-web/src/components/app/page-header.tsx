import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
  className?: string;
  dense?: boolean;
};

export function PageHeader({
  eyebrow = "Mercy Legal AI",
  title,
  description,
  children,
  className,
  dense = false,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "border-b border-[var(--mercy-border)] bg-[color-mix(in_srgb,var(--mercy-card)_92%,transparent)] backdrop-blur",
        dense ? "px-4 py-4 lg:px-8" : "px-4 py-5 sm:px-5 lg:px-8",
        className,
      )}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mercy-title mt-2 text-2xl md:text-[1.75rem]">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--mercy-fg-muted)]">{description}</p>
        </div>
        {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
      </div>
    </header>
  );
}
