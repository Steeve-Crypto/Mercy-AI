"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText,
  Bot,
  BriefcaseBusiness,
  ChevronDown,
  Files,
  Gauge,
  HelpCircle,
  LogOut,
  MessageSquareText,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/chat", label: "Ask Agent X", icon: MessageSquareText },
  { href: "/matters", label: "Matters", icon: BriefcaseBusiness },
  { href: "/templates", label: "Templates", icon: BookOpenText },
  { href: "/intake", label: "Intake", icon: Receipt },
  { href: "/research", label: "Research", icon: Search },
  { href: "/vault", label: "Vault", icon: Files },
] as const;

const settingsItems = [
  { label: "Account", icon: UserRound },
  { label: "Billing", icon: Receipt },
  { label: "Help", icon: HelpCircle },
  { label: "Sign Out", icon: LogOut },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200 bg-white/95 px-4 py-5 shadow-sm lg:flex lg:flex-col">
      <Link href="/dashboard" className="flex items-center gap-3 rounded-lg px-2 py-2">
        <div className="flex size-10 items-center justify-center rounded-lg bg-[#4F46E5] text-white">
          <Bot className="size-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-950">Mercy Legal AI</p>
          <p className="text-xs text-slate-500">Agent X workspace</p>
        </div>
      </Link>

      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
        <div className="mb-1 flex items-center gap-2 font-medium text-slate-900">
          <ShieldCheck className="size-4 text-[#4F46E5]" />
          D.C. attorney mode
        </div>
        Routed through Agent X with review, grounding, and guardrail metadata.
      </div>

      <Link
        href="/intake"
        className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-[#4F46E5] px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#4338CA]"
      >
        <Receipt className="size-4" />
        New Intake
      </Link>

      <nav className="mt-6 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-[#EEF2FF] text-[#4338CA]"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-xl border border-slate-200 bg-white p-3">
        <button className="flex w-full items-center justify-between gap-3 text-left">
          <span className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
              MW
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-950">Mercy Attorney</span>
              <span className="block text-xs text-slate-500">local-dev-tenant</span>
            </span>
          </span>
          <ChevronDown className="size-4 text-slate-400" />
        </button>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {settingsItems.map((item) => (
            <button
              key={item.label}
              className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-medium text-slate-600 hover:border-[#C7D2FE] hover:bg-[#EEF2FF] hover:text-[#4338CA]"
            >
              <item.icon className="size-3.5" />
              {item.label}
            </button>
          ))}
        </div>
        <Link
          href="/admin"
          className="mt-3 flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <Settings className="size-3.5" />
          Platform admin
        </Link>
      </div>
    </aside>
  );
}
