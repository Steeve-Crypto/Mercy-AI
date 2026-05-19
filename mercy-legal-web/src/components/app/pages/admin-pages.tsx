import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import type { CoreBetaAnalytics, CoreMonitoringMetrics } from "@/lib/core-client";

function valueFrom(record: Record<string, unknown> | undefined, keys: string[], fallback = "—"): string {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return fallback;
}

function JsonCard({ title, data }: { title: string; data: unknown }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 text-xs leading-6 text-slate-100">
        {JSON.stringify(data ?? { status: "unavailable" }, null, 2)}
      </pre>
    </div>
  );
}

export function AdminHome() {
  const links = [
    ["/admin/monitoring", "Monitoring"],
    ["/admin/beta-users", "Beta Users"],
    ["/admin/analytics", "Analytics"],
    ["/admin/security", "Security"],
    ["/admin/system-health", "System Health"],
  ] as const;
  return (
    <>
      <PageHeader title="Platform admin" description="Operational views for Mercy beta readiness, monitoring, security, and system health." />
      <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3 lg:p-8">
        {links.map(([href, label]) => (
          <Link key={href} href={href} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-[#A5B4FC]">
            <span className="text-lg font-semibold text-slate-950">{label}</span>
            <span className="mt-2 block text-sm text-slate-500">Open {label.toLowerCase()} controls.</span>
          </Link>
        ))}
      </div>
    </>
  );
}

export function MonitoringAdminPage({ metrics, error }: { metrics: CoreMonitoringMetrics | null; error: string | null }) {
  const cards = [
    { label: "Cost state", value: valueFrom(metrics?.costs, ["estimated_cost_usd", "total_cost_usd", "daily_cost_usd"]) },
    { label: "RAGAS health", value: valueFrom(metrics?.ragas, ["overall_score", "overall", "status"]) },
    { label: "Guardrails", value: valueFrom(metrics?.guardrails, ["block_count", "warn_count", "status"]) },
    { label: "Errors", value: valueFrom(metrics?.errors, ["error_rate", "count", "status"]) },
  ];
  return (
    <>
      <PageHeader title="Monitoring" description="Usage, costs, RAGAS, guardrails, error rates, and alert state." />
      <div className="space-y-5 p-5 lg:p-8">
        {error ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div> : null}
        <section className="grid gap-4 md:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className="mt-3 text-2xl font-semibold text-slate-950">{card.value}</p>
            </div>
          ))}
        </section>
        <JsonCard title="Raw monitoring metrics" data={metrics} />
      </div>
    </>
  );
}

export function BetaUsersAdminPage({ analytics, error }: { analytics: CoreBetaAnalytics | null; error: string | null }) {
  return (
    <>
      <PageHeader title="Beta users" description="Invite-only beta state, feedback, waitlist, and model quota activity." />
      <div className="space-y-5 p-5 lg:p-8">
        {error ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div> : null}
        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Active users</p><p className="mt-3 text-2xl font-semibold">{analytics?.active_users ?? "—"}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Waitlist</p><p className="mt-3 text-2xl font-semibold">{analytics?.waitlist_count ?? "—"}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Invites</p><p className="mt-3 text-2xl font-semibold">{analytics?.invite_count ?? "—"}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Feedback</p><p className="mt-3 text-2xl font-semibold">{analytics?.feedback.count ?? "—"}</p></div>
        </section>
        <JsonCard title="Beta analytics" data={analytics} />
      </div>
    </>
  );
}

export function AnalyticsAdminPage({ analytics, metrics }: { analytics: CoreBetaAnalytics | null; metrics: CoreMonitoringMetrics | null }) {
  return (
    <>
      <PageHeader title="Analytics" description="Product usage, template adoption, cost trend, and grounding health." />
      <div className="grid gap-5 p-5 xl:grid-cols-2 lg:p-8">
        <JsonCard title="Beta analytics" data={analytics} />
        <JsonCard title="Monitoring metrics" data={metrics} />
      </div>
    </>
  );
}

export function SecurityAdminPage({ metrics }: { metrics: CoreMonitoringMetrics | null }) {
  return (
    <>
      <PageHeader title="Security" description="Security posture, tenant isolation, audit, rate limit, and deletion readiness." />
      <div className="p-5 lg:p-8">
        <JsonCard title="Security and alert signals" data={{ alerts: metrics?.alerts, quotas: metrics?.quotas, generated_at: metrics?.generated_at }} />
      </div>
    </>
  );
}

export function SystemHealthAdminPage({ metrics }: { metrics: CoreMonitoringMetrics | null }) {
  return (
    <>
      <PageHeader title="System health" description="Core health, RAGAS health, Agent X execution posture, and backend status." />
      <div className="p-5 lg:p-8">
        <JsonCard title="System metrics" data={metrics} />
      </div>
    </>
  );
}
