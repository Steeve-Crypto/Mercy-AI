"use client";

import { useEffect, useState } from "react";
import { BarChart3, Database, FileText, LockKeyhole, MailCheck, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MERCY_CORE_API_URL,
  getBetaAnalytics,
  getBetaStatus,
  type CoreBetaAnalytics,
  type CoreBetaStatus,
} from "@/lib/core-client";

export function BetaLaunchPanel() {
  const [status, setStatus] = useState<CoreBetaStatus | null>(null);
  const [analytics, setAnalytics] = useState<CoreBetaAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([getBetaStatus(), getBetaAnalytics()]).then(([statusResult, analyticsResult]) => {
      if (!mounted) return;
      if (statusResult.ok && statusResult.data) setStatus(statusResult.data);
      if (analyticsResult.ok && analyticsResult.data) setAnalytics(analyticsResult.data);
      if (statusResult.error || analyticsResult.error) setError(statusResult.error ?? analyticsResult.error);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const docsBase = MERCY_CORE_API_URL.replace(/\/+$/, "");

  return (
    <section className="mb-5 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
      <div className="rounded-lg border bg-white p-5 shadow-[0_16px_45px_rgba(10,20,40,0.05)]">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="gold">Limited beta</Badge>
          <Badge variant={status?.access === "active" ? "secondary" : "risk"}>{status?.access ?? "checking access"}</Badge>
          <Badge variant="outline">Invite only</Badge>
        </div>
        <h2 className="mt-3 text-xl font-semibold text-mercy-navy">Welcome to the D.C. attorney beta</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Mercy is open to limited invites for D.C. solo and small-firm attorneys. Strong-model drafting and research
          are quota-managed; fast routing and metadata workflows remain available.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-md border bg-[#fbfcfe] p-3">
            <ShieldCheck className="size-4 text-[#9b740e]" />
            <p className="mt-2 text-lg font-semibold text-mercy-navy">
              {status?.quota.strong_model_remaining ?? "--"}
            </p>
            <p className="text-xs text-muted-foreground">strong messages left</p>
          </div>
          <div className="rounded-md border bg-[#fbfcfe] p-3">
            <MailCheck className="size-4 text-[#9b740e]" />
            <p className="mt-2 text-lg font-semibold text-mercy-navy">{status?.welcome_sequence.length ?? 3}</p>
            <p className="text-xs text-muted-foreground">welcome emails</p>
          </div>
          <div className="rounded-md border bg-[#fbfcfe] p-3">
            <FileText className="size-4 text-[#9b740e]" />
            <p className="mt-2 text-lg font-semibold text-mercy-navy">DPA + Terms</p>
            <p className="text-xs text-muted-foreground">downloadable docs</p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{status?.ethics_note}</p>
        {error && <p className="mt-2 text-xs text-[#735b13]">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href={`${docsBase}/v1/beta/legal/dpa`}>Download DPA</a>
          </Button>
          <Button variant="outline" asChild>
            <a href={`${docsBase}/v1/beta/legal/terms`}>Download Terms</a>
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-5 shadow-[0_16px_45px_rgba(10,20,40,0.05)]">
        <div className="flex items-center gap-2 text-sm font-semibold text-mercy-navy">
          <BarChart3 className="size-4 text-[#9b740e]" />
          Beta analytics
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Metric label="Active users" value={analytics?.active_users ?? 0} />
          <Metric label="Waitlist" value={analytics?.waitlist_count ?? 0} />
          <Metric label="Feedback" value={analytics?.feedback.count ?? 0} />
          <Metric label="Est. cost" value={`$${(analytics?.estimated_cost_usd ?? 0).toFixed(4)}`} />
        </div>
        <div className="mt-4 rounded-md border bg-[#fbfcfe] p-3 text-xs leading-5 text-muted-foreground">
          <p className="font-semibold text-mercy-navy">Template usage</p>
          {analytics?.template_usage.length
            ? analytics.template_usage.slice(0, 4).map(([template, count]) => (
                <p key={template}>{template}: {count}</p>
              ))
            : <p>No template usage recorded yet.</p>}
        </div>
        <div className="mt-4 grid gap-2 rounded-md border bg-[#fbfcfe] p-3 text-xs leading-5 text-muted-foreground">
          <p className="flex items-center gap-2 font-semibold text-mercy-navy">
            <LockKeyhole className="size-4 text-[#9b740e]" />
            Security and compliance
          </p>
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#1d6f42]" />
            SOC 2 Type 1 preparation in progress; audit logging, redaction, rate limiting, and security headers are enabled.
          </p>
          <p className="flex items-start gap-2">
            <Database className="mt-0.5 size-4 shrink-0 text-[#1d4f8f]" />
            Tenant-isolated matters and official D.C. RAG records persist in PostgreSQL when configured.
          </p>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-[#fbfcfe] p-3">
      <p className="text-lg font-semibold text-mercy-navy">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
