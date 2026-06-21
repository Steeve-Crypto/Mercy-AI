"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  listMicrosoftIdentityMappings,
  updateMicrosoftIdentityMappingStatus,
  upsertMicrosoftIdentityMapping,
  type CoreBetaAnalytics,
  type CoreMicrosoftIdentityMapping,
  type CoreMonitoringMetrics,
} from "@/lib/core-client";

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
    ["/admin/provisioning", "Provisioning"],
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

type ProvisioningForm = {
  accountType: "solo" | "firm";
  workspaceName: string;
  firmName: string;
  email: string;
  mercyUserId: string;
  tenantId: string;
  firmId: string;
  roles: string;
  status: "pending" | "trialing" | "active" | "suspended" | "canceled";
  attorneySeatLimit: string;
};

const emptyProvisioningForm: ProvisioningForm = {
  accountType: "solo",
  workspaceName: "",
  firmName: "",
  email: "",
  mercyUserId: "",
  tenantId: "",
  firmId: "",
  roles: "attorney",
  status: "pending",
  attorneySeatLimit: "1",
};

function slug(value: string, fallback: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized || fallback;
}

function pendingUserId(email: string) {
  return email.trim() ? `pending:${email.trim().toLowerCase()}` : "";
}

function statusBadgeClass(status: string) {
  if (status === "active" || status === "trialing") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

export function ProvisioningAdminPage() {
  const [mappings, setMappings] = useState<CoreMicrosoftIdentityMapping[]>([]);
  const [form, setForm] = useState<ProvisioningForm>(emptyProvisioningForm);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const firmMode = form.accountType === "firm";
  const normalizedSeatLimit = useMemo(() => {
    const parsed = Number.parseInt(form.attorneySeatLimit, 10);
    if (Number.isNaN(parsed)) return firmMode ? 2 : 1;
    return parsed;
  }, [firmMode, form.attorneySeatLimit]);
  const tenantId = form.tenantId.trim() || `tenant-${slug(form.workspaceName || form.email, "beta-workspace")}`;
  const firmId = firmMode ? form.firmId.trim() || `firm-${slug(form.firmName || form.workspaceName || form.email, "beta-firm")}` : "";
  const mercyUserId = form.mercyUserId.trim() || pendingUserId(form.email);
  const microsoftTenantId = firmMode ? firmId : tenantId;
  const microsoftObjectId = mercyUserId;

  async function refresh() {
    const result = await listMicrosoftIdentityMappings();
    if (result.ok && result.data) {
      setMappings(result.data.mappings);
      setError(null);
    } else {
      setError(result.error);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function update<K extends keyof ProvisioningForm>(key: K, value: ProvisioningForm[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "accountType") {
        next.attorneySeatLimit = value === "firm" ? "2" : "1";
        if (value === "solo") next.firmId = "";
        if (value === "solo") next.firmName = "";
      }
      return next;
    });
  }

  async function submit() {
    setLoading(true);
    setError(null);
    setNotice(null);
    const result = await upsertMicrosoftIdentityMapping({
      microsoft_tenant_id: microsoftTenantId,
      microsoft_object_id: microsoftObjectId,
      email: form.email.trim() || undefined,
      mercy_user_id: mercyUserId,
      tenant_id: tenantId,
      firm_id: firmMode ? firmId : undefined,
      roles: form.roles.split(",").map((role) => role.trim()).filter(Boolean),
      status: form.status,
      attorney_seat_limit: normalizedSeatLimit,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice(`Saved ${result.data?.mapping.account_type ?? "mapping"} mapping for ${result.data?.mapping.mercy_user_id}.`);
    setForm(emptyProvisioningForm);
    await refresh();
  }

  async function disable(mapping: CoreMicrosoftIdentityMapping) {
    const result = await updateMicrosoftIdentityMappingStatus(mapping.microsoft_tenant_id, mapping.microsoft_object_id, "suspended");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice(`Disabled mapping for ${mapping.mercy_user_id}.`);
    await refresh();
  }

  return (
    <>
      <PageHeader title="Provisioning" description="Manual beta account provisioning for solo attorneys and small firms." />
      <div className="space-y-5 p-5 lg:p-8">
        {notice ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div> : null}
        {error ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div> : null}

        <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Account type
            <select className="w-full rounded-md border border-slate-300 px-3 py-2" value={form.accountType} onChange={(event) => update("accountType", event.target.value as "solo" | "firm")}>
              <option value="solo">Solo attorney</option>
              <option value="firm">Firm user</option>
            </select>
          </label>
          <Input label="Owner email" value={form.email} onChange={(value) => update("email", value)} />
          <Input label="Workspace name" value={form.workspaceName} onChange={(value) => update("workspaceName", value)} />
          {firmMode ? <Input label="Firm name" value={form.firmName} onChange={(value) => update("firmName", value)} /> : null}
          <Input label="Tenant/workspace ID" value={form.tenantId} placeholder={tenantId} onChange={(value) => update("tenantId", value)} />
          {firmMode ? <Input label="Firm ID" value={form.firmId} placeholder={firmId} onChange={(value) => update("firmId", value)} /> : null}
          <Input label="Attorney seat limit" value={form.attorneySeatLimit} onChange={(value) => update("attorneySeatLimit", value)} />
          <Input label="Mercy user ID" value={form.mercyUserId} placeholder={mercyUserId || "pending:owner@example.com"} onChange={(value) => update("mercyUserId", value)} />
          <Input label="Roles" value={form.roles} onChange={(value) => update("roles", value)} />
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Status
            <select className="w-full rounded-md border border-slate-300 px-3 py-2" value={form.status} onChange={(event) => update("status", event.target.value as ProvisioningForm["status"])}>
              <option value="pending">Pending</option>
              <option value="trialing">Trialing</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="canceled">Canceled</option>
            </select>
          </label>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600 md:col-span-2">
            Pending records are safe for users who have not signed up yet. After signup, update the Mercy user ID if the Supabase user ID differs from the pending email key. Service-role Auth user creation is intentionally not exposed in this admin UI.
          </div>
          <div className="md:col-span-2">
            <button type="button" onClick={submit} disabled={loading} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {loading ? "Saving..." : "Provision beta account"}
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <h2 className="text-lg font-semibold text-slate-950">Provisioned beta accounts</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Owner email</th>
                  <th className="px-4 py-3">Workspace</th>
                  <th className="px-4 py-3">Firm</th>
                  <th className="px-4 py-3">Seats</th>
                  <th className="px-4 py-3">Roles</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mappings.map((mapping) => (
                  <tr key={mapping.id}>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {mapping.account_type === "firm" ? "Firm" : "Solo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(mapping.status)}`}>
                        {mapping.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{mapping.email ?? mapping.mercy_user_id}</td>
                    <td className="px-4 py-3">{mapping.tenant_id}</td>
                    <td className="px-4 py-3">{mapping.firm_id ?? "-"}</td>
                    <td className="px-4 py-3">{mapping.attorney_seat_limit}</td>
                    <td className="px-4 py-3">{mapping.roles.join(", ")}</td>
                    <td className="px-4 py-3">{mapping.created_at ?? "-"}</td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => void disable(mapping)} disabled={mapping.status === "suspended" || mapping.status === "disabled"} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
                        Deactivate
                      </button>
                    </td>
                  </tr>
                ))}
                {mappings.length === 0 ? (
                  <tr>
                    <td className="px-4 py-5 text-slate-500" colSpan={9}>No beta accounts provisioned.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

function Input({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-2 text-sm font-medium text-slate-700">
      {label}
      <input className="w-full rounded-md border border-slate-300 px-3 py-2" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
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
      <PageHeader title="System health" description="Core health, RAGAS health, Mercy execution posture, and backend status." />
      <div className="p-5 lg:p-8">
        <JsonCard title="System metrics" data={metrics} />
      </div>
    </>
  );
}
