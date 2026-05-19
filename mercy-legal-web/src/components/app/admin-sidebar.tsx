"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, Gauge, HeartPulse, Shield, UsersRound } from "lucide-react";
import { useMercySession } from "@/components/auth/session-provider";
import { cn } from "@/lib/utils";

const adminItems = [
  { href: "/admin/monitoring", label: "Monitoring", icon: Gauge },
  { href: "/admin/beta-users", label: "Beta Users", icon: UsersRound },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/security", label: "Security", icon: Shield },
  { href: "/admin/system-health", label: "System Health", icon: HeartPulse },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();
  const { session } = useMercySession();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200 bg-slate-950 px-4 py-5 text-white lg:flex lg:flex-col">
      <Link href="/admin/monitoring" className="flex items-center gap-3 rounded-lg px-2 py-2">
        <div className="flex size-10 items-center justify-center rounded-lg bg-[#6B46C1] text-white">
          <Activity className="size-5" />
        </div>
        <div>
          <p className="text-sm font-semibold">Mercy Platform</p>
          <p className="text-xs text-slate-400">Admin operations</p>
        </div>
      </Link>

      <nav className="mt-8 space-y-1">
        {adminItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                active ? "bg-white text-slate-950" : "text-slate-300 hover:bg-slate-800 hover:text-white",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-lg border border-slate-800 bg-slate-900 p-3">
        <p className="text-sm font-semibold">{session.name}</p>
        <p className="mt-1 truncate text-xs text-slate-400">{session.tenantId}</p>
        <p className="mt-2 text-xs text-slate-500">{session.roles.join(", ")}</p>
      </div>

      <Link
        href="/dashboard"
        className="mt-3 rounded-lg border border-slate-800 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-900 hover:text-white"
      >
        Return to attorney app
      </Link>
    </aside>
  );
}
