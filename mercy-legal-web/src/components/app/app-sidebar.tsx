"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { useMercySession } from "@/components/auth/session-provider";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/mercy", label: "Mercy", icon: Bot, aliases: ["/dashboard", "/chat"] },
  { href: "/history", label: "History", icon: Clock3, aliases: [] },
  { href: "/matters", label: "Matters", icon: BriefcaseBusiness, aliases: [] },
  { href: "/vault", label: "Vault", icon: Files, aliases: [] },
  { href: "/templates", label: "Templates", icon: BookOpenText, aliases: [] },
  { href: "/research", label: "Research", icon: Search, aliases: [] },
] as const;

const settingsItems = [
  { href: "/settings", label: "Account & Profile", icon: UserRound },
  { href: "/billing", label: "Billing & Usage", icon: Receipt },
  { href: "/settings#preferences", label: "Settings", icon: SlidersHorizontal },
  { href: "/settings#support", label: "Help & Support", icon: HelpCircle },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  const { session, signOut } = useMercySession();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
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

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 hidden border-r border-slate-200 bg-white/95 py-4 shadow-sm transition-[width] duration-200 lg:flex lg:flex-col",
        collapsed ? "w-20 px-3" : "w-64 px-4",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Link href="/mercy" className={cn("flex min-w-0 items-center gap-3 rounded-lg px-2 py-2", collapsed ? "justify-center" : "")}>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#4F46E5] text-white">
            <Bot className="size-5" />
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">Mercy Legal AI</p>
              <p className="text-xs text-slate-500">Matter workspace</p>
            </div>
          ) : null}
        </Link>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="hidden size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 lg:flex"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </button>
      </div>

      <div
        className={cn(
          "mt-4 rounded-lg border border-slate-200 bg-slate-50 text-xs leading-5 text-slate-600",
          collapsed ? "flex items-center justify-center p-2" : "p-3",
        )}
        title="D.C. mode active: matter context, source grounding, and attorney review stay visible."
      >
        <div className={cn("flex items-center gap-2 font-medium text-slate-900", collapsed ? "justify-center" : "mb-1")}>
          <ShieldCheck className="size-4 text-[#4F46E5]" />
          {!collapsed ? "D.C. mode active" : null}
        </div>
        {!collapsed ? "Matter context, source grounding, and attorney review stay visible." : null}
      </div>

      <Link
        href="/intake"
        title="New Matter"
        className={cn(
          "mt-3 flex items-center justify-center gap-2 rounded-lg bg-[#4F46E5] px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#4338CA]",
          collapsed ? "px-2" : "",
        )}
      >
        <Receipt className="size-4" />
        {!collapsed ? "New Matter" : null}
      </Link>

      <nav className="mt-5 space-y-1">
        {navItems.map((item) => {
          const routes = [item.href, ...item.aliases];
          const active = routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                collapsed ? "justify-center px-2" : "",
                active
                  ? "bg-[#EEF2FF] text-[#4338CA]"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
              )}
            >
              <item.icon className="size-4" />
              {!collapsed ? item.label : null}
            </Link>
          );
        })}
      </nav>

      <div className={cn("mt-auto rounded-xl border border-slate-200 bg-white p-3", collapsed ? "p-2" : "")}>
        <button
          type="button"
          onClick={() => setUserMenuOpen((open) => !open)}
          aria-expanded={userMenuOpen}
          className={cn("flex w-full items-center justify-between gap-3 rounded-lg text-left", collapsed ? "justify-center" : "")}
          title={`${session.name} · ${session.tenantId}`}
        >
          <span className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
              {initials || "MA"}
            </span>
            {!collapsed ? (
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-950">{session.name}</span>
                <span className="block max-w-36 truncate text-xs text-slate-500">{session.tenantId}</span>
              </span>
            ) : null}
          </span>
          {!collapsed ? <ChevronDown className={cn("size-4 text-slate-400 transition", userMenuOpen ? "rotate-180" : "")} /> : null}
        </button>
        {userMenuOpen && !collapsed ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {settingsItems.map((item) => {
              const active = pathname === item.href || (item.href !== "/settings" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.label}
                  href={item.href as Route}
                  onClick={() => setUserMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium transition",
                    active ? "bg-[#EEF2FF] text-[#4338CA]" : "text-slate-600 hover:bg-white hover:text-slate-950",
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
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-rose-700"
            >
              <LogOut className="size-3.5" />
              Sign Out
            </button>
          </div>
        ) : null}
        <Link
          href="/admin"
          title="Platform admin"
          className={cn(
            "mt-3 flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900",
            collapsed ? "justify-center" : "",
          )}
        >
          <Settings className="size-3.5" />
          {!collapsed ? "Platform admin" : null}
        </Link>
      </div>
    </aside>
  );
}
