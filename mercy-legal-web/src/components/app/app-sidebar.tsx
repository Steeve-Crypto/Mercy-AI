"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpenText,
  Bot,
  BriefcaseBusiness,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Files,
  HelpCircle,
  LogOut,
  Menu,
  Plus,
  Receipt,
  Scale,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  TreePine,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useMercySession } from "@/components/auth/session-provider";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { workspacePresentation } from "@/lib/workspace-context";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/mercy", label: "Mercy", icon: Bot, aliases: ["/dashboard", "/chat"] },
  { href: "/matters", label: "Matters", icon: BriefcaseBusiness, aliases: [] },
  { href: "/vault", label: "Vault", icon: Files, aliases: [] },
  { href: "/research", label: "Research", icon: Search, aliases: [] },
  { href: "/lars", label: "LARS", icon: TreePine, aliases: [] },
  { href: "/templates", label: "Templates", icon: BookOpenText, aliases: [] },
  { href: "/history", label: "History", icon: Clock3, aliases: [] },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  const { session, signOut } = useMercySession();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const presentation = useMemo(
    () =>
      workspacePresentation({
        roles: session.roles,
        firmId: session.firmId,
        firmName: session.firm,
        tenantId: session.tenantId,
      }),
    [session.firm, session.firmId, session.roles, session.tenantId],
  );

  const settingsItems = useMemo(() => {
    const items: { href: string; label: string; icon: typeof UserRound }[] = [
      { href: "/settings", label: "Account & Profile", icon: UserRound },
      { href: "/billing", label: "Billing & Usage", icon: Receipt },
      { href: "/settings#preferences", label: "Preferences", icon: SlidersHorizontal },
      { href: "/settings#support", label: "Help & Support", icon: HelpCircle },
    ];
    if (presentation.showTeamManagement) {
      items.splice(1, 0, { href: "/settings#team", label: "Team & seats", icon: UsersRound });
    }
    return items;
  }, [presentation.showTeamManagement]);

  const initials = session.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("mercy-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
    setUserMenuOpen(false);
  }

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("mercy-sidebar-collapsed") === "1");
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  const nav = (
    <>
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/mercy"
          className={cn("flex min-w-0 items-center gap-3 rounded-lg px-2 py-2", collapsed ? "justify-center" : "")}
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--mercy-navy)] text-white dark:bg-[var(--mercy-gold)] dark:text-[var(--mercy-bg)]">
            <Scale className="size-4" />
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--mercy-fg-strong)]">Mercy</p>
              <p className="truncate text-[11px] text-[var(--mercy-fg-muted)]">{presentation.label}</p>
            </div>
          ) : null}
        </Link>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="hidden size-8 shrink-0 items-center justify-center rounded-md border border-[var(--mercy-border)] text-[var(--mercy-fg-muted)] hover:bg-[var(--mercy-secondary)] lg:flex"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </button>
      </div>

      <div
        className={cn(
          "mt-4 rounded-lg border border-[var(--mercy-border)] bg-[var(--mercy-secondary)] text-xs leading-5 text-[var(--mercy-fg-muted)]",
          collapsed ? "flex items-center justify-center p-2" : "p-3",
        )}
        title="D.C. mode: matter context, source grounding, and attorney review stay visible."
      >
        <div className={cn("flex items-center gap-2 font-medium text-[var(--mercy-fg-strong)]", collapsed ? "justify-center" : "mb-1")}>
          <ShieldCheck className="size-4 text-[var(--mercy-gold-deep)]" />
          {!collapsed ? "D.C. grounded mode" : null}
        </div>
        {!collapsed ? (
          <p>
            {presentation.isFirm
              ? "Firm workspace with shared matters, seats, and attorney review."
              : "Solo workspace for matters, documents, research, and drafting."}
          </p>
        ) : null}
      </div>

      <Link
        href="/intake"
        title="New Matter"
        className={cn(
          "mt-3 flex items-center justify-center gap-2 rounded-md bg-[var(--mercy-navy)] px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--mercy-navy-soft)] dark:bg-[var(--mercy-gold)] dark:text-[var(--mercy-bg)] dark:hover:opacity-90",
          collapsed ? "px-2" : "",
        )}
      >
        <Plus className="size-4" />
        {!collapsed ? "New Matter" : null}
      </Link>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
        <p className={cn("mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--mercy-fg-muted)]", collapsed && "sr-only")}>
          Workspace
        </p>
        <nav className="space-y-1" aria-label="Attorney workspace">
          {navItems.map((item) => {
            const routes = [item.href, ...item.aliases];
            const active = routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition",
                  collapsed ? "justify-center px-2" : "",
                  active
                    ? "bg-[var(--mercy-navy)] text-white dark:bg-[var(--mercy-gold-soft)] dark:text-[var(--mercy-fg-strong)]"
                    : "text-[var(--mercy-fg-muted)] hover:bg-[var(--mercy-secondary)] hover:text-[var(--mercy-fg-strong)]",
                )}
              >
                <item.icon className="size-4" />
                {!collapsed ? item.label : null}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className={cn("mt-3 shrink-0 rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-3", collapsed ? "p-2" : "")}>
        <div className={cn("mb-2 flex items-center", collapsed ? "justify-center" : "justify-between")}>
          <ThemeToggle compact />
          {!collapsed ? <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--mercy-fg-muted)]">{presentation.accountKind}</span> : null}
        </div>
        <button
          type="button"
          onClick={() => setUserMenuOpen((open) => !open)}
          aria-expanded={userMenuOpen}
          className={cn("flex w-full items-center justify-between gap-3 rounded-lg text-left", collapsed ? "justify-center" : "")}
          title={`${session.name} · ${presentation.scopeLabel}`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--mercy-border)] bg-[var(--mercy-secondary)] text-sm font-semibold text-[var(--mercy-fg-strong)]">
              {initials || "MA"}
            </span>
            {!collapsed ? (
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[var(--mercy-fg-strong)]">{session.name}</span>
                <span className="block truncate text-xs text-[var(--mercy-fg-muted)]">{presentation.scopeLabel}</span>
              </span>
            ) : null}
          </span>
          {!collapsed ? (
            <ChevronDown className={cn("size-4 shrink-0 text-[var(--mercy-fg-muted)] transition", userMenuOpen ? "rotate-180" : "")} />
          ) : null}
        </button>
        {userMenuOpen ? (
          <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-[var(--mercy-border)] bg-[var(--mercy-secondary)] p-1">
            {settingsItems.map((item) => {
              const active = pathname === item.href || (item.href.includes("#") ? pathname === "/settings" : pathname.startsWith(item.href));
              return (
                <Link
                  key={item.label}
                  href={item.href as Route}
                  onClick={() => setUserMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium transition",
                    active
                      ? "bg-[var(--mercy-card)] text-[var(--mercy-fg-strong)]"
                      : "text-[var(--mercy-fg-muted)] hover:bg-[var(--mercy-card)] hover:text-[var(--mercy-fg-strong)]",
                  )}
                >
                  <item.icon className="size-3.5" />
                  {item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={signOut}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium text-[var(--mercy-fg-muted)] transition hover:bg-[var(--mercy-card)] hover:text-[var(--mercy-danger)]"
            >
              <LogOut className="size-3.5" />
              Sign Out
            </button>
          </div>
        ) : null}
        {presentation.showPlatformAdminLink ? (
          <Link
            href="/admin"
            title="Platform admin"
            className={cn(
              "mt-3 flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-[var(--mercy-fg-muted)] hover:bg-[var(--mercy-secondary)] hover:text-[var(--mercy-fg-strong)]",
              collapsed ? "justify-center" : "",
            )}
          >
            <Settings className="size-3.5" />
            {!collapsed ? "Platform admin" : null}
          </Link>
        ) : null}
      </div>
    </>
  );

  return (
    <>
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--mercy-border)] bg-[var(--mercy-card)] px-4 py-3 lg:hidden">
        <Link href="/mercy" className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md bg-[var(--mercy-navy)] text-white dark:bg-[var(--mercy-gold)] dark:text-[var(--mercy-bg)]">
            <Scale className="size-4" />
          </span>
          <span className="text-sm font-semibold text-[var(--mercy-fg-strong)]">Mercy</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle compact />
          <button
            type="button"
            className="grid size-9 place-items-center rounded-md border border-[var(--mercy-border)]"
            onClick={() => setMobileOpen((value) => !value)}
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setMobileOpen(false)}>
          <aside
            className="absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col border-r border-[var(--mercy-border)] bg-[var(--mercy-card)] p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            {nav}
          </aside>
        </div>
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden border-r border-[var(--mercy-border)] bg-[var(--mercy-card)] py-4 shadow-[var(--mercy-shadow)] transition-[width] duration-200 lg:flex lg:flex-col",
          collapsed ? "w-20 px-3" : "w-64 px-4",
        )}
      >
        {nav}
      </aside>
    </>
  );
}
