import Link from "next/link";
import { Bot, BriefcaseBusiness, FileText, Search, ShieldCheck, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import type { CoreBetaStatus, CoreSnapshot } from "@/lib/core-client";

type DashboardHomeProps = {
  snapshot: CoreSnapshot;
  betaStatus: CoreBetaStatus | null;
  betaError: string | null;
};

const actions = [
  { href: "/chat", label: "Ask Agent X", description: "Draft, analyze, and reason over matter context.", icon: Bot },
  { href: "/intake", label: "New Intake", description: "Capture parties, posture, deadlines, and goals.", icon: FileText },
  { href: "/research", label: "Research D.C. law", description: "Retrieve official-source metadata and citations.", icon: Search },
  { href: "/templates", label: "Use a template", description: "Generate attorney-review work product.", icon: Sparkles },
] as const;

export function DashboardHome({ snapshot, betaStatus, betaError }: DashboardHomeProps) {
  const openInputs = snapshot.matters.reduce((total, matter) => total + (matter.missing_information?.length ?? 0), 0);
  const stats = [
    { label: "Tenant matters", value: snapshot.matters.length, detail: "Live from /v1/matters" },
    { label: "Open intake items", value: openInputs, detail: "Missing context to resolve" },
    {
      label: "Strong model quota",
      value: betaStatus?.quota.strong_model_remaining ?? "—",
      detail: betaError ?? "Remaining this period",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Attorney workspace"
        title="Mercy command center"
        description="Start from a matter, then use Agent X for D.C. research, drafting, document analysis, templates, and verification."
      >
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
            Core {snapshot.online ? "online" : "unavailable"}
          </span>
          <span className="rounded-full border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-1 text-xs font-medium text-[#4338CA]">
            Agent X enabled
          </span>
        </div>
      </PageHeader>

      <div className="space-y-6 p-5 lg:p-8">
        {snapshot.error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {snapshot.error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">{stat.label}</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">{stat.value}</p>
              <p className="mt-1 text-xs text-slate-500">{stat.detail}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Quick start</h2>
                <p className="mt-1 text-sm text-slate-500">The fastest path into the live Agent X flow.</p>
              </div>
              <ShieldCheck className="size-5 text-[#4F46E5]" />
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {actions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="rounded-xl border border-slate-200 p-4 transition hover:border-[#A5B4FC] hover:bg-[#F8FAFF]"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-[#EEF2FF] text-[#4F46E5]">
                      <action.icon className="size-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-950">{action.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">{action.description}</span>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Recent matters</h2>
            <div className="mt-4 space-y-3">
              {snapshot.matters.length ? (
                snapshot.matters.slice(0, 5).map((matter) => (
                  <Link
                    key={matter.matter_id}
                    href="/matters"
                    className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 hover:border-[#A5B4FC] hover:bg-[#F8FAFF]"
                  >
                    <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <BriefcaseBusiness className="size-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-950">{matter.name}</span>
                      <span className="block text-xs text-slate-500">
                        {matter.jurisdiction ?? "D.C."} / {matter.matter_type ?? "matter type pending"}
                      </span>
                    </span>
                  </Link>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  No matters yet. Start with Intake or Ask Agent X after creating a test matter.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
