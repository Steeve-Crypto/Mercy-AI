import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Surface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mercy-surface", className)} {...props} />;
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mercy-panel p-5", className)} {...props} />;
}

export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mercy-eyebrow", className)} {...props} />;
}

export function SectionTitle({
  className,
  as: Tag = "h2",
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { as?: "h1" | "h2" | "h3" }) {
  return <Tag className={cn("mercy-title text-lg", className)} {...props} />;
}

export function BodyText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mercy-body text-sm", className)} {...props} />;
}

export function Chip({
  className,
  tone = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "default" | "accent" | "success" | "warning" | "danger" | "info" }) {
  return (
    <span
      className={cn(
        "mercy-chip",
        tone === "accent" && "mercy-chip-accent",
        tone === "success" && "mercy-chip-success",
        tone === "warning" && "mercy-chip-warning",
        tone === "danger" && "mercy-chip-danger",
        tone === "info" && "mercy-chip-info",
        className,
      )}
      {...props}
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mercy-empty", className)}>
      {icon ? (
        <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-lg border border-[var(--mercy-border)] bg-[var(--mercy-card)] text-[var(--mercy-gold-deep)]">
          {icon}
        </div>
      ) : null}
      <h3 className="mercy-title text-base">{title}</h3>
      <p className="mx-auto mt-2 max-w-lg mercy-body text-sm">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
  className,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  className?: string;
}) {
  return (
    <div className={cn("mercy-panel p-5", className)}>
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--mercy-fg-muted)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-[var(--mercy-fg-strong)]">{value}</p>
      {detail ? <p className="mt-1 text-xs text-[var(--mercy-fg-muted)]">{detail}</p> : null}
    </div>
  );
}

export function AlertBanner({
  tone = "warning",
  children,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-lg border px-4 py-3 text-sm leading-6",
        tone === "info" && "border-[color-mix(in_srgb,var(--mercy-info)_30%,var(--mercy-border))] bg-[var(--mercy-info-soft)] text-[var(--mercy-info)]",
        tone === "warning" && "border-[color-mix(in_srgb,var(--mercy-warning)_30%,var(--mercy-border))] bg-[var(--mercy-warning-soft)] text-[var(--mercy-warning)]",
        tone === "danger" && "border-[color-mix(in_srgb,var(--mercy-danger)_30%,var(--mercy-border))] bg-[var(--mercy-danger-soft)] text-[var(--mercy-danger)]",
        tone === "success" && "border-[color-mix(in_srgb,var(--mercy-success)_30%,var(--mercy-border))] bg-[var(--mercy-success-soft)] text-[var(--mercy-success)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function WorkspaceFrame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-5 p-4 sm:p-5 lg:p-8", className)}>{children}</div>;
}
