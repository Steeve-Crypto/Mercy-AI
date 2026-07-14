import Link from "next/link";
import type { Route } from "next";
import {
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  FileText,
  FolderOpen,
  GitBranch,
  MessageSquareText,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { CoreBetaStatus, CoreSnapshot, LarsJobSummary } from "@/lib/core-client";
import { formatLarsLabel, larsStatusTone, assignmentWorkspaceHref } from "@/lib/lars-labels";
import { cn } from "@/lib/utils";

type DashboardHomeProps = {
  snapshot: CoreSnapshot;
  betaStatus: CoreBetaStatus | null;
  betaError: string | null;
  larsJobs?: LarsJobSummary[];
};

const actions = [
  { href: "/matters", label: "Open Matters", description: "Start from a tenant-scoped matter command center.", icon: FolderOpen },
  { href: "/chat", label: "Assistant", description: "Draft, analyze, and reason over selected matter context.", icon: Bot },
  { href: "/intake", label: "New Matter", description: "Capture parties, posture, deadlines, and goals through intake.", icon: FileText },
  { href: "/research", label: "Research D.C. law", description: "Retrieve official-source metadata and citations.", icon: Search },
] as const;

function matterDetailHref(matterId: string): Route {
  return `/matters/${encodeURIComponent(matterId)}` as Route;
}

function countDocuments(snapshot: CoreSnapshot) {
  return snapshot.matters.reduce((total, matter) => total + (matter.documents?.length ?? 0), 0);
}

function countReliabilityWarnings(snapshot: CoreSnapshot) {
  return snapshot.matters.reduce((total, matter) => {
    const missingRouteInputs = matter.route_history?.reduce((count, route) => count + (route.missing_inputs?.length ?? 0), 0) ?? 0;
    return total + missingRouteInputs + (matter.missing_information?.length ?? 0);
  }, 0);
}

function recentActivity(snapshot: CoreSnapshot) {
  return snapshot.matters
    .flatMap((matter) => {
      const href = matterDetailHref(matter.matter_id);
      const history = (matter.history ?? []).slice(-2).map((item, index) => ({
        id: `${matter.matter_id}-history-${index}`,
        title: String(item.action ?? item.event ?? item.type ?? "Matter updated"),
        detail: String(item.detail ?? item.summary ?? item.note ?? matter.name),
        href,
      }));
      const routes = (matter.route_history ?? []).slice(-1).map((route, index) => ({
        id: `${matter.matter_id}-route-${index}`,
        title: "Reliability route recorded",
        detail: `${matter.name} / ${route.expert_label} / ${Math.round(route.confidence * 100)}% confidence`,
        href,
      }));
      const documents = (matter.documents ?? []).slice(-1).map((document, index) => ({
        id: `${matter.matter_id}-document-${index}`,
        title: "Document attached",
        detail: String(document.title ?? document.name ?? document.filename ?? "Matter document"),
        href,
      }));
      return [...history, ...routes, ...documents];
    })
    .slice(0, 5);
}

export function DashboardHome({ snapshot, betaStatus, betaError, larsJobs = [] }: DashboardHomeProps) {
  const openInputs = snapshot.matters.reduce((total, matter) => total + (matter.missing_information?.length ?? 0), 0);
  const documentCount = countDocuments(snapshot);
  const reliabilityWarnings = countReliabilityWarnings(snapshot);
  const activity = recentActivity(snapshot);
  const larsRunning = larsJobs.filter((job) => ["running", "queued", "verifying"].includes(job.status)).length;
  const larsReview = larsJobs.filter((job) => job.status === "waiting_attorney").length;
  const larsCompleted = larsJobs.filter((job) => job.status === "completed").length;
  const larsInterrupted = larsJobs.filter((job) => ["paused", "failed", "canceled", "blocked"].includes(job.status)).length;
  const stats = [
    { label: "Active matters", value: snapshot.matters.length, detail: "Tenant-scoped matters" },
    { label: "Matter documents", value: documentCount, detail: "Attached to workspace matters" },
    { label: "Review items", value: reliabilityWarnings, detail: "Missing inputs and reliability checks" },
    {
      label: "Strong model quota",
      value: betaStatus?.quota.strong_model_remaining ?? "-",
      detail: betaError ?? "Remaining this period",
    },
  ];

  return (
    <div className="space-y-6 p-5 lg:p-8">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-normal text-slate-950">Mercy command center</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Start from a matter, then move into documents, Agent X, D.C. research, templates, reliability review, and Office workflows.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
              Core {snapshot.online ? "online" : "unavailable"}
            </span>
            <span className="rounded-full border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-1 text-xs font-medium text-[#4338CA]">
              Matter-first workspace
            </span>
          </div>
        </div>
      </section>
        {snapshot.error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{snapshot.error}</div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">{stat.label}</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">{stat.value}</p>
              <p className="mt-1 text-xs text-slate-500">{stat.detail}</p>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <GitBranch className="size-5 text-[#4F46E5]" />
                <h2 className="text-lg font-semibold text-slate-950">LARS assignment summaries</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Running, needs review, completed, interrupted, and failed durable assignments across your tenant.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-900">Running {larsRunning}</span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-900">Needs review {larsReview}</span>
              <span className="rounded-full border border-[#C7D2FE] bg-[#EEF2FF] px-2.5 py-1 text-[#4338CA]">Completed {larsCompleted}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">Interrupted/failed {larsInterrupted}</span>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {larsJobs.slice(0, 5).map((job) => (
              <Link
                key={job.job_id}
                href={assignmentWorkspaceHref(job.job_id, job.matter_id) as Route}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 hover:border-[#A5B4FC] hover:bg-[#F8FAFF]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-950">{job.query || job.job_id}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {job.matter_id ? `Matter ${job.matter_id}` : "No matter"} · {job.artifact_count ?? 0} work product(s)
                  </span>
                </span>
                <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium", larsStatusTone(job.status))}>
                  {formatLarsLabel(job.status)}
                </span>
              </Link>
            ))}
            {!larsJobs.length ? (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                No LARS assignments yet. Start one from a Matter, Chat (LARS Assignment mode), Research, Vault, or Word.
              </p>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Next best actions</h2>
                <p className="mt-1 text-sm text-slate-500">Move from matter context to documents, assistant work, source review, and drafting.</p>
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
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Active matters</h2>
                <p className="mt-1 text-sm text-slate-500">Open a matter command center before drafting or review.</p>
              </div>
              <Link href="/matters" className="text-xs font-semibold text-[#4F46E5] hover:underline">
                View all
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {snapshot.matters.length ? (
                snapshot.matters.slice(0, 5).map((matter) => (
                  <Link
                    key={matter.matter_id}
                    href={matterDetailHref(matter.matter_id)}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 hover:border-[#A5B4FC] hover:bg-[#F8FAFF]"
                  >
                    <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <BriefcaseBusiness className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-950">{matter.name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {matter.jurisdiction ?? "D.C."} / {matter.matter_type ?? "matter type pending"} / {matter.documents?.length ?? 0} document
                        {(matter.documents?.length ?? 0) === 1 ? "" : "s"}
                      </span>
                    </span>
                    {(matter.missing_information?.length ?? 0) > 0 ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
                        {matter.missing_information?.length} input{matter.missing_information?.length === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <CheckCircle2 className="size-4 text-emerald-600" />
                    )}
                  </Link>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-950">Create your first matter</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Mercy works best when legal work starts from a matter. Create a matter, add documents to the Vault, ask the Assistant to draft or research, then check reliability before using output.
                  </p>
                  <Link href="/intake" className="mt-4 inline-flex rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA]">
                    Create your first matter
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <TriangleAlert className="size-5 text-amber-600" />
              Reliability attention
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Mercy should not be treated as final legal judgment. Resolve missing facts, inspect citations, and confirm D.C. grounding before relying on generated work.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <ReliabilityMetric label="Open intake" value={openInputs} />
              <ReliabilityMetric label="Review items" value={reliabilityWarnings} />
              <ReliabilityMetric label="Documents" value={documentCount} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Recent workspace activity</h2>
                <p className="mt-1 text-sm text-slate-500">Matter updates, document activity, and reliability route events.</p>
              </div>
              <Clock3 className="size-5 text-[#4F46E5]" />
            </div>
            <div className="mt-4 space-y-3">
              {activity.length ? (
                activity.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 hover:border-[#A5B4FC] hover:bg-[#F8FAFF]"
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <MessageSquareText className="size-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-950">{item.title}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-500">{item.detail}</span>
                    </span>
                  </Link>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-950">First-run path</p>
                  <ol className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                    <li>1. Create your first matter.</li>
                    <li>2. Add documents to the Vault.</li>
                    <li>3. Ask the Assistant to draft, review, or research.</li>
                    <li>4. Check reliability before using output.</li>
                    <li>5. Continue in Word or Outlook when ready.</li>
                  </ol>
                </div>
              )}
            </div>
          </div>
        </section>
    </div>
  );
}

function ReliabilityMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
