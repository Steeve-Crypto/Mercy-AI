"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Gauge,
  HeartPulse,
  Menu,
  Shield,
  UserCog,
  UsersRound,
  X,
} from "lucide-react";
import { useMercySession } from "@/components/auth/session-provider";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

const adminItems = [
  { href: "/admin", label: "Overview", icon: Activity, exact: true },
  { href: "/admin/monitoring", label: "Monitoring", icon: Gauge },
  { href: "/admin/beta-users", label: "Beta Users", icon: UsersRound },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/provisioning", label: "Provisioning", icon: UserCog },
  { href: "/admin/security", label: "Security", icon: Shield },
  { href: "/admin/system-health", label: "System Health", icon: HeartPulse },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();
  const { session } = useMercySession();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = (
    <>
      <Link href="/admin/monitoring" className="flex items-center gap-3 rounded-lg px-2 py-2">
        <div className="flex size-10 items-center justify-center rounded-md border border-white/10 bg-white/10 text-white">
          <Activity className="size-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Mercy Platform</p>
          <p className="text-xs text-white/55">Internal operations</p>
        </div>
      </Link>

      <div className="mt-5 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[11px] leading-5 text-amber-100">
        Platform administration is separate from firm admin. Customer tenants never see these controls.
      </div>

      <nav className="mt-6 space-y-1" aria-label="Platform administration">
        {adminItems.map((item) => {
          const active = "exact" in item && item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition",
                active ? "bg-white text-[var(--mercy-navy)]" : "text-white/70 hover:bg-white/8 hover:text-white",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3">
        <ThemeToggle className="w-full border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white" />
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <p className="text-sm font-semibold text-white">{session.name}</p>
          <p className="mt-1 truncate text-xs text-white/50">{session.tenantId}</p>
          <p className="mt-2 text-xs text-white/40">{session.roles.join(", ") || "platform role"}</p>
        </div>
        <Link
          href="/dashboard"
          className="flex items-center justify-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm font-medium text-white/75 hover:bg-white/8 hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Return to workspace
        </Link>
      </div>
    </>
  );

  return (
    <>
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--mercy-border)] bg-[var(--mercy-card)] px-4 py-3 lg:hidden">
        <div>
          <p className="text-sm font-semibold text-[var(--mercy-fg-strong)]">Platform admin</p>
          <p className="text-xs text-[var(--mercy-fg-muted)]">Mercy operations</p>
        </div>
        <button
          type="button"
          className="grid size-9 place-items-center rounded-md border border-[var(--mercy-border)]"
          onClick={() => setMobileOpen((value) => !value)}
          aria-label={mobileOpen ? "Close admin navigation" : "Open admin navigation"}
        >
          {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <aside
            className="absolute inset-y-0 left-0 flex w-[min(20rem,90vw)] flex-col bg-[#0b1426] px-4 py-5 text-white"
            onClick={(event) => event.stopPropagation()}
          >
            {nav}
          </aside>
        </div>
      ) : null}

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col bg-[#0b1426] px-4 py-5 text-white lg:flex">
        {nav}
      </aside>
    </>
  );
}
