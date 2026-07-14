import Link from "next/link";
import type { Route } from "next";
import {
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  FileText,
  FolderOpen,
  MessageSquareText,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { CoreBetaStatus, CoreSnapshot } from "@/lib/core-client";
import { AlertBanner, Chip, EmptyState, Panel, StatCard, WorkspaceFrame } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";

type DashboardHomeProps = {
  snapshot: CoreSnapshot;
  betaStatus: CoreBetaStatus | null;
  betaError: string | null;
};

const actions = [
  { href: "/matters", label: "Open Matters", description: "Work from a tenant-scoped matter command center.", icon: FolderOpen },
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

export function DashboardHome({ snapshot, betaStatus, betaError }: DashboardHomeProps) {
  const openInputs = snapshot.matters.reduce((total, matter) => total + (matter.missing_information?.length ?? 0), 0);
  const documentCount = countDocuments(snapshot);
  const reliabilityWarnings = countReliabilityWarnings(snapshot);
  const activity = recentActivity(snapshot);
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
    <WorkspaceFrame>
      <Panel className="!p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="mercy-eyebrow">Mercy Workspace</p>
            <h1 className="mercy-title mt-2 text-2xl md:text-[1.75rem]">Legal work starts with a matter</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--mercy-fg-muted)]">
              Open a matter, attach Vault documents, run research or drafting, then inspect citations and attorney-review signals before anything leaves the firm.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip tone={snapshot.online ? "success" : "danger"}>
              <span className="mercy-status-dot" data-state={snapshot.online ? "online" : "offline"} />
              Core {snapshot.online ? "online" : "unavailable"}
            </Chip>
            <Chip tone="accent">D.C. grounded</Chip>
            <Chip>Matter-first</Chip>
          </div>
        </div>
      </Panel>

      {snapshot.error ? <AlertBanner tone="warning">{snapshot.error}</AlertBanner> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} detail={stat.detail} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="mercy-title text-lg">Next best actions</h2>
              <p className="mt-1 text-sm text-[var(--mercy-fg-muted)]">
                Move from matter context into documents, assistant work, research, and drafting.
              </p>
            </div>
            <ShieldCheck className="size-5 shrink-0 text-[var(--mercy-gold-deep)]" />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="rounded-lg border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-4 transition hover:border-[color-mix(in_srgb,var(--mercy-gold)_45%,var(--mercy-border))] hover:bg-[var(--mercy-secondary)]"
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-10 items-center justify-center rounded-md border border-[var(--mercy-border)] bg-[var(--mercy-secondary)] text-[var(--mercy-gold-deep)]">
                    <action.icon className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-[var(--mercy-fg-strong)]">{action.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-[var(--mercy-fg-muted)]">{action.description}</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="mercy-title text-lg">Active matters</h2>
              <p className="mt-1 text-sm text-[var(--mercy-fg-muted)]">Open a matter before drafting or review.</p>
            </div>
            <Link href="/matters" className="text-xs font-semibold text-[var(--mercy-gold-deep)] hover:underline">
              View all
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {snapshot.matters.length ? (
              snapshot.matters.slice(0, 5).map((matter) => (
                <Link
                  key={matter.matter_id}
                  href={matterDetailHref(matter.matter_id)}
                  className="flex items-center gap-3 rounded-lg border border-[var(--mercy-border)] p-3 transition hover:border-[color-mix(in_srgb,var(--mercy-gold)_40%,var(--mercy-border))] hover:bg-[var(--mercy-secondary)]"
                >
                  <span className="flex size-9 items-center justify-center rounded-md bg-[var(--mercy-secondary)] text-[var(--mercy-fg-muted)]">
                    <BriefcaseBusiness className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[var(--mercy-fg-strong)]">{matter.name}</span>
                    <span className="block truncate text-xs text-[var(--mercy-fg-muted)]">
                      {matter.jurisdiction ?? "D.C."} / {matter.matter_type ?? "matter type pending"} / {matter.documents?.length ?? 0}{" "}
                      document{(matter.documents?.length ?? 0) === 1 ? "" : "s"}
                    </span>
                  </span>
                  {(matter.missing_information?.length ?? 0) > 0 ? (
                    <Chip tone="warning">
                      {matter.missing_information?.length} input{(matter.missing_information?.length ?? 0) === 1 ? "" : "s"}
                    </Chip>
                  ) : (
                    <CheckCircle2 className="size-4 text-[var(--mercy-success)]" />
                  )}
                </Link>
              ))
            ) : (
              <EmptyState
                icon={<BriefcaseBusiness className="size-5" />}
                title="Create your first matter"
                description="Mercy works best when legal work starts from a matter. Create one, add Vault documents, then draft or research with reliability review."
                action={
                  <Button asChild size="sm">
                    <Link href="/intake">Create matter</Link>
                  </Button>
                }
              />
            )}
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel>
          <div className="flex items-center gap-2">
            <TriangleAlert className="size-5 text-[var(--mercy-warning)]" />
            <h2 className="mercy-title text-lg">Reliability attention</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--mercy-fg-muted)]">
            Mercy is attorney-assistive. Resolve missing facts, inspect citations, and confirm D.C. grounding before relying on generated work.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <ReliabilityMetric label="Open intake" value={openInputs} />
            <ReliabilityMetric label="Review items" value={reliabilityWarnings} />
            <ReliabilityMetric label="Documents" value={documentCount} />
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="mercy-title text-lg">Recent workspace activity</h2>
              <p className="mt-1 text-sm text-[var(--mercy-fg-muted)]">Matter updates, document activity, and reliability routes.</p>
            </div>
            <Clock3 className="size-5 text-[var(--mercy-gold-deep)]" />
          </div>
          <div className="mt-4 space-y-3">
            {activity.length ? (
              activity.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-start gap-3 rounded-lg border border-[var(--mercy-border)] p-3 transition hover:bg-[var(--mercy-secondary)]"
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--mercy-secondary)] text-[var(--mercy-fg-muted)]">
                    <MessageSquareText className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-[var(--mercy-fg-strong)]">{item.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-[var(--mercy-fg-muted)]">{item.detail}</span>
                  </span>
                </Link>
              ))
            ) : (
              <EmptyState
                title="First-run path"
                description="Create a matter, add documents, ask the Assistant, check reliability, then continue in Word or Outlook when ready."
              />
            )}
          </div>
        </Panel>
      </section>
    </WorkspaceFrame>
  );
}

function ReliabilityMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-[var(--mercy-secondary)] p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--mercy-fg-muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[var(--mercy-fg-strong)]">{value}</p>
    </div>
  );
}
