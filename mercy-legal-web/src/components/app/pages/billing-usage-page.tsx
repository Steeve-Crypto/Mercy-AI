"use client";

import { useMemo, useState } from "react";
import { CreditCard, FileText, Gauge, Loader2, Receipt, Sparkles, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { useMercySession } from "@/components/auth/session-provider";
import type { CoreBetaStatus, CoreBillingInvoice, CoreMonitoringMetrics } from "@/lib/core-client";

type BillingUsagePageProps = {
  betaStatus: CoreBetaStatus | null;
  metrics: CoreMonitoringMetrics | null;
  invoices: CoreBillingInvoice[];
  customerPortalUrl: string | null;
  betaError: string | null;
  metricsError: string | null;
  invoicesError: string | null;
};

const PLAN_PRICES = {
  Solo: "$170/month",
  Beta: "$98/month",
  Firm: "Custom",
} as const;

export function BillingUsagePage({
  betaStatus,
  metrics,
  invoices,
  customerPortalUrl,
  betaError,
  metricsError,
  invoicesError,
}: BillingUsagePageProps) {
  const { session } = useMercySession();
  const [portalBusy, setPortalBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const usage = metrics?.usage && typeof metrics.usage === "object" ? metrics.usage as Record<string, unknown> : {};
  const cost = metrics?.cost && typeof metrics.cost === "object" ? metrics.cost as Record<string, unknown> : {};
  const plan = betaStatus?.beta_mode ? "Beta" : session.roles.includes("firm_admin") ? "Firm" : "Solo";
  const price = PLAN_PRICES[plan as keyof typeof PLAN_PRICES] ?? "Custom";
  const totalTokens = Number(usage.prompt_tokens ?? 0) + Number(usage.completion_tokens ?? 0);
  const period = betaStatus?.quota.period ?? "Current month";
  const quotaPct = useMemo(() => {
    const limit = betaStatus?.quota.strong_model_monthly_limit ?? 0;
    const used = betaStatus?.quota.strong_model_used ?? 0;
    return limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  }, [betaStatus?.quota.strong_model_monthly_limit, betaStatus?.quota.strong_model_used]);

  async function manageBilling() {
    setPortalBusy(true);
    setCheckoutError(null);
    try {
      if (customerPortalUrl) {
        window.location.href = customerPortalUrl;
        return;
      }
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json()) as { url?: string; message?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setCheckoutError(data.message ?? "Stripe customer portal is not configured.");
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Stripe customer portal could not be opened.");
    } finally {
      setPortalBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Billing"
        title="Billing & Usage"
        description="Review plan status, Mercy quota, monthly usage, estimated cost, and upgrade options for this tenant."
      >
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-[var(--mercy-border-strong)] bg-[var(--mercy-secondary)] px-3 py-1 text-xs font-medium text-[var(--mercy-navy-soft)]">
            {plan} plan · {price}
          </span>
          <span className="rounded-full border border-[var(--mercy-border)] bg-[var(--mercy-card)] px-3 py-1 text-xs font-medium text-[var(--mercy-fg-muted)]">
            {session.tenantId}
          </span>
        </div>
      </PageHeader>

      <div className="space-y-6 p-5 lg:p-8">
        {betaError || metricsError || checkoutError ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {checkoutError || betaError || metricsError}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={CreditCard} label="Current plan" value={plan} detail={`${price} · ${betaStatus?.access ?? "Tenant workspace"}`} />
          <MetricCard icon={Gauge} label="Messages" value={Number(usage.messages ?? 0)} detail="Agent, drafting, and LLM traces" />
          <MetricCard icon={Zap} label="Tokens" value={totalTokens.toLocaleString()} detail="Prompt + completion tokens" />
          <MetricCard icon={Receipt} label="Estimated cost" value={`$${Number(cost.estimated_total_usd ?? 0).toFixed(4)}`} detail={`${cost.event_count ?? 0} cost event(s)`} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-5 shadow-[var(--mercy-shadow)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--mercy-fg-strong)]">Strong-model quota</h2>
                <p className="mt-1 text-sm text-[var(--mercy-fg-muted)]">{period} quota for drafting and research-heavy Mercy work.</p>
              </div>
              <span className="rounded-full bg-[var(--mercy-secondary)] px-3 py-1 text-xs font-semibold text-[var(--mercy-navy-soft)]">
                {betaStatus?.quota.strong_model_remaining ?? 0} remaining
              </span>
            </div>
            <div className="mt-6 h-3 overflow-hidden rounded-full bg-[var(--mercy-muted)]">
              <div className="h-full rounded-full bg-[var(--mercy-navy)]" style={{ width: `${quotaPct}%` }} />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <SmallStat label="Limit" value={betaStatus?.quota.strong_model_monthly_limit ?? 0} />
              <SmallStat label="Used" value={betaStatus?.quota.strong_model_used ?? 0} />
              <SmallStat label="Fast-model usage" value={betaStatus?.quota.fast_model_used ?? 0} />
            </div>
            <p className="mt-4 text-sm leading-6 text-[var(--mercy-fg-muted)]">
              {betaStatus?.quota.gentle_rate_limit ?? "Quota is shown when the beta service is available."}
            </p>
          </div>

          <aside className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-5 shadow-[var(--mercy-shadow)]">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--mercy-fg-strong)]">
              <Sparkles className="size-4 text-[var(--mercy-navy)]" />
              Upgrade options
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--mercy-fg-muted)]">
              Move from beta or solo usage to a firm plan when you need shared seats, larger quotas, and production support.
            </p>
            <div className="mt-5 grid gap-2">
              <button
                type="button"
                onClick={manageBilling}
                disabled={portalBusy}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--mercy-border-strong)] bg-[var(--mercy-secondary)] px-4 py-2.5 text-sm font-semibold text-[var(--mercy-navy-soft)] hover:bg-[#E0E7FF] disabled:opacity-60"
              >
                {portalBusy ? <Loader2 className="size-4 animate-spin" /> : <Receipt className="size-4" />}
                Manage Billing in Stripe
              </button>
            </div>
          </aside>
        </section>

        <section className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-5 shadow-[var(--mercy-shadow)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-lg font-semibold text-[var(--mercy-fg-strong)]">
              <FileText className="size-5 text-[var(--mercy-navy)]" />
              Invoice history
            </div>
            {invoicesError ? (
              <span className="rounded-full border border-[var(--mercy-border)] bg-[var(--mercy-secondary)] px-3 py-1 text-xs font-medium text-[var(--mercy-fg-muted)]">
                Stripe invoice API pending
              </span>
            ) : null}
          </div>
          {invoices.length ? (
            <div className="mt-5 overflow-hidden rounded-xl border border-[var(--mercy-border)]">
              <div className="grid grid-cols-[1fr_0.7fr_0.6fr_auto] gap-3 bg-[var(--mercy-secondary)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--mercy-fg-muted)]">
                <span>Invoice</span>
                <span>Period</span>
                <span>Status</span>
                <span className="text-right">Amount</span>
              </div>
              <div className="divide-y divide-slate-200">
                {invoices.map((invoice) => (
                  <a
                    key={invoice.invoice_id}
                    href={invoice.hosted_invoice_url ?? invoice.pdf_url ?? "#"}
                    target={invoice.hosted_invoice_url || invoice.pdf_url ? "_blank" : undefined}
                    rel="noreferrer"
                    className="grid grid-cols-1 gap-2 px-4 py-4 text-sm hover:bg-[var(--mercy-secondary)] md:grid-cols-[1fr_0.7fr_0.6fr_auto] md:items-center"
                  >
                    <span className="font-semibold text-[var(--mercy-fg-strong)]">{invoice.number ?? invoice.invoice_id}</span>
                    <span className="text-[var(--mercy-fg-muted)]">{formatPeriod(invoice)}</span>
                    <span className="w-fit rounded-full bg-[var(--mercy-muted)] px-2.5 py-1 text-xs font-medium text-[var(--mercy-fg)]">{invoice.status}</span>
                    <span className="font-semibold text-[var(--mercy-fg-strong)] md:text-right">${invoice.amount_due_usd.toFixed(2)}</span>
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-[var(--mercy-secondary)] p-6 text-sm leading-6 text-[var(--mercy-fg-muted)]">
              No invoices are available in this beta workspace yet. Use the Stripe customer portal when a subscription customer is connected.
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function formatPeriod(invoice: CoreBillingInvoice) {
  if (invoice.period_start && invoice.period_end) {
    return `${invoice.period_start} - ${invoice.period_end}`;
  }
  return invoice.created_at ?? "Current period";
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-5 shadow-[var(--mercy-shadow)]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--mercy-fg-muted)]">{label}</p>
        <Icon className="size-4 text-[var(--mercy-navy)]" />
      </div>
      <p className="mt-3 text-2xl font-semibold text-[var(--mercy-fg-strong)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--mercy-fg-muted)]">{detail}</p>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-[var(--mercy-secondary)] p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--mercy-fg-muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--mercy-fg-strong)]">{value}</p>
    </div>
  );
}
