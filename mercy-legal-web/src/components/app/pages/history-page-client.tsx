"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { BookOpenText, Clock3, FileText, MessageSquareText, Plus, Search, ShieldCheck, Star } from "lucide-react";
import type { WorkHistoryRecord, WorkHistoryWorkflowType } from "@/lib/work-history-types";
import { setWorkHistorySavedClient } from "@/lib/work-history-client";
import { formatTimestamp, safeText, titleCase } from "@/lib/display-safety";
import { sourceScopeLabel as vaultSourceScopeLabel } from "@/lib/vault-documents";

type HistoryPageClientProps = {
  initialRecords: WorkHistoryRecord[];
  configured: boolean;
  initialError?: string | null;
};

type HistorySection = {
  title: string;
  description: string;
  icon: typeof Clock3;
  records: WorkHistoryRecord[];
};

function workflowLabel(workflow: WorkHistoryWorkflowType) {
  if (workflow === "citation_check") return "Citation check";
  if (workflow === "document_review") return "Document review";
  return titleCase(workflow);
}

function reliabilityLabel(record: WorkHistoryRecord) {
  const snapshot = record.reliabilitySnapshot ?? {};
  const status = snapshot.guardrail_status ?? snapshot.status ?? snapshot.grounding_status ?? snapshot.confidence;
  if (typeof status === "string" && status.trim()) return titleCase(status);
  if (record.workflowType === "research") return "Review required";
  return "Attorney review required";
}

function citationCount(record: WorkHistoryRecord) {
  return Array.isArray(record.citationsSnapshot) ? record.citationsSnapshot.length : 0;
}

function contextLabel(record: WorkHistoryRecord) {
  if (record.documentId) return "Document";
  if (record.matterId) return "Matter";
  return "General";
}

function sourceScopeLabel(record: WorkHistoryRecord) {
  return vaultSourceScopeLabel(record.reliabilitySnapshot?.source_scope ?? (record.reliabilitySnapshot?.retrieval as Record<string, unknown> | undefined)?.source_scope);
}

function recordSummary(record: WorkHistoryRecord) {
  return safeText(record.outputSummary ?? record.inputSummary ?? record.requestText, "Summary pending. Open the item to review the saved work.");
}

function reopenHref(record: WorkHistoryRecord): Route {
  const params = new URLSearchParams();
  if (record.matterId) params.set("matterId", record.matterId);
  if (record.documentId) {
    params.set("attachedDocs", record.documentId);
    params.set("attached", "1");
  }
  const snapshotMode = record.reliabilitySnapshot?.workflow_mode ?? (record.reliabilitySnapshot?.route as Record<string, unknown> | undefined)?.selected_capability;
  if (typeof snapshotMode === "string" && snapshotMode.trim()) params.set("mode", snapshotMode);
  const suffix = params.toString();
  return (suffix ? `/mercy?${suffix}` : "/mercy") as Route;
}

function matterHref(record: WorkHistoryRecord): Route | null {
  if (!record.matterId) return null;
  return `/matters/${encodeURIComponent(record.matterId)}` as Route;
}

function contextNames(record: WorkHistoryRecord) {
  const refs = Array.isArray(record.reliabilitySnapshot?.source_refs) ? record.reliabilitySnapshot.source_refs : [];
  const documentRef = refs.find((item) => typeof item === "object" && item !== null && "document_id" in item) as Record<string, unknown> | undefined;
  const documentName = safeText(documentRef?.citation_label ?? documentRef?.document_id ?? record.documentId, "");
  const matterName = safeText((record.reliabilitySnapshot?.matter_name as string | undefined) ?? record.matterId, "");
  return [matterName, documentName].filter(Boolean).join(" / ");
}

function HistoryCard({ record, onSavedChange }: { record: WorkHistoryRecord; onSavedChange: (record: WorkHistoryRecord) => void }) {
  const [saving, setSaving] = useState(false);
  const saved = record.status === "saved" || Boolean(record.savedAt);

  async function toggleSaved() {
    setSaving(true);
    try {
      const result = await setWorkHistorySavedClient(record.id, !saved);
      if (result.record) onSavedChange(result.record);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-4 shadow-[var(--mercy-shadow)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--mercy-secondary)] px-2.5 py-1 text-xs font-semibold text-[var(--mercy-navy-soft)]">
              {workflowLabel(record.workflowType)}
            </span>
            <span className="rounded-full border border-[var(--mercy-border)] bg-[var(--mercy-secondary)] px-2.5 py-1 text-xs font-medium text-[var(--mercy-fg-muted)]">
              {contextLabel(record)}
            </span>
            {sourceScopeLabel(record) ? (
              <span className="rounded-full border border-[var(--mercy-border)] bg-[var(--mercy-secondary)] px-2.5 py-1 text-xs font-medium text-[var(--mercy-fg-muted)]">
                {sourceScopeLabel(record)}
              </span>
            ) : null}
          </div>
          <h3 className="mt-3 line-clamp-2 text-sm font-semibold text-[var(--mercy-fg-strong)]">{record.title}</h3>
          {contextNames(record) ? <p className="mt-1 truncate text-xs text-[var(--mercy-fg-muted)]">{contextNames(record)}</p> : null}
        </div>
        <button
          type="button"
          onClick={toggleSaved}
          disabled={saving}
          className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
            saved
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-[var(--mercy-border)] bg-[var(--mercy-card)] text-[var(--mercy-fg-muted)] hover:bg-[var(--mercy-secondary)]"
          }`}
        >
          <Star className={`size-3.5 ${saved ? "fill-current" : ""}`} />
          {saved ? "Saved" : "Save"}
        </button>
      </div>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--mercy-fg-muted)]">{recordSummary(record)}</p>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-[var(--mercy-secondary)] p-2">
          <dt className="font-medium text-[var(--mercy-fg-muted)]">Created</dt>
          <dd className="mt-1 font-semibold text-[var(--mercy-fg-strong)]">{formatTimestamp(record.createdAt)}</dd>
        </div>
        <div className="rounded-lg bg-[var(--mercy-secondary)] p-2">
          <dt className="font-medium text-[var(--mercy-fg-muted)]">Reliability</dt>
          <dd className="mt-1 truncate font-semibold text-[var(--mercy-fg-strong)]">{reliabilityLabel(record)}</dd>
        </div>
        <div className="rounded-lg bg-[var(--mercy-secondary)] p-2">
          <dt className="font-medium text-[var(--mercy-fg-muted)]">Citations</dt>
          <dd className="mt-1 font-semibold text-[var(--mercy-fg-strong)]">{citationCount(record)}</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={reopenHref(record)} className="rounded-lg bg-[var(--mercy-navy)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--mercy-navy-soft)]">
          Re-open in Mercy
        </Link>
        {matterHref(record) ? (
          <Link href={matterHref(record)!} className="rounded-lg border border-[var(--mercy-border)] bg-[var(--mercy-card)] px-3 py-2 text-xs font-semibold text-[var(--mercy-fg)] hover:bg-[var(--mercy-secondary)]">
            Open matter
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function HistorySectionCard({ section, onSavedChange }: { section: HistorySection; onSavedChange: (record: WorkHistoryRecord) => void }) {
  return (
    <section className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-5 shadow-[var(--mercy-shadow)]">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--mercy-muted)] text-[var(--mercy-navy)]">
          <section.icon className="size-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-[var(--mercy-fg-strong)]">{section.title}</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--mercy-fg-muted)]">{section.description}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        {section.records.length ? (
          section.records.slice(0, 6).map((record) => <HistoryCard key={record.id} record={record} onSavedChange={onSavedChange} />)
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-[var(--mercy-secondary)] p-4 text-sm leading-6 text-[var(--mercy-fg-muted)]">
            No saved work in this section yet.
          </div>
        )}
      </div>
    </section>
  );
}

export function HistoryPageClient({ initialRecords, configured, initialError }: HistoryPageClientProps) {
  const [records, setRecords] = useState(initialRecords);
  const [activeTab, setActiveTab] = useState<"all" | "recent" | "matter" | "research">("all");

  const sections = useMemo<HistorySection[]>(() => {
    const notArchived = records.filter((record) => record.status !== "archived");
    const visibleRecords = notArchived.filter((record) => {
      if (activeTab === "recent") return true;
      if (activeTab === "matter") return Boolean(record.matterId);
      if (activeTab === "research") return record.workflowType === "research";
      return true;
    });
    return [
      {
        title: "Recent work",
        description: "Latest Mercy runs, research, review, and citation checks.",
        icon: MessageSquareText,
        records: activeTab === "recent" ? visibleRecords.slice(0, 12) : visibleRecords,
      },
      {
        title: "Matter-linked work",
        description: "Work tied to a selected matter.",
        icon: FileText,
        records: visibleRecords.filter((record) => Boolean(record.matterId)),
      },
      {
        title: "Drafting history",
        description: "Drafting, template, review, and document-review work.",
        icon: FileText,
        records: visibleRecords.filter((record) => ["drafting", "template", "review", "document_review"].includes(record.workflowType)),
      },
      {
        title: "Research history",
        description: "D.C. source research and matter-linked retrieval runs.",
        icon: Search,
        records: visibleRecords.filter((record) => record.workflowType === "research"),
      },
      {
        title: "Citation checks",
        description: "Citation/source checking work and reliability review context.",
        icon: ShieldCheck,
        records: visibleRecords.filter((record) => record.workflowType === "citation_check"),
      },
      {
        title: "Saved outputs",
        description: "Work product marked for follow-up.",
        icon: BookOpenText,
        records: visibleRecords.filter((record) => record.status === "saved" || Boolean(record.savedAt)),
      },
    ];
  }, [activeTab, records]);

  function updateRecord(nextRecord: WorkHistoryRecord) {
    setRecords((current) => current.map((record) => (record.id === nextRecord.id ? nextRecord : record)));
  }

  return (
    <div className="space-y-5 p-5 lg:p-8">
      <section className="rounded-xl border border-[var(--mercy-border)] bg-[var(--mercy-card)] p-5 shadow-[var(--mercy-shadow)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--mercy-navy-soft)]">
              <Clock3 className="size-4" />
              History / Threads
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[var(--mercy-fg-strong)]">Mercy work history</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--mercy-fg-muted)]">
              Prior Mercy work stays scoped to your tenant, matter context when selected, reliability snapshots, and saved outputs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/mercy" className="inline-flex items-center gap-2 rounded-lg bg-[var(--mercy-navy)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--mercy-navy-soft)]">
              <MessageSquareText className="size-4" />
              Start in Mercy
            </Link>
            <Link href="/intake" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-[var(--mercy-card)] px-4 py-2 text-sm font-semibold text-[var(--mercy-fg)] hover:bg-[var(--mercy-secondary)]">
              <Plus className="size-4" />
              Create new matter
            </Link>
            <Link href="/templates" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-[var(--mercy-card)] px-4 py-2 text-sm font-semibold text-[var(--mercy-fg)] hover:bg-[var(--mercy-secondary)]">
              <BookOpenText className="size-4" />
              Open templates
            </Link>
          </div>
        </div>
        {!configured ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Work history storage is not configured for this environment.
          </p>
        ) : null}
        {initialError ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{initialError}</p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          {[
            ["all", "All"],
            ["recent", "Recent"],
            ["matter", "By Matter"],
            ["research", "Research"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setActiveTab(value as typeof activeTab)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                activeTab === value ? "border-[var(--mercy-border-strong)] bg-[var(--mercy-secondary)] text-[var(--mercy-navy-soft)]" : "border-[var(--mercy-border)] bg-[var(--mercy-card)] text-[var(--mercy-fg-muted)] hover:bg-[var(--mercy-secondary)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {!records.length ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-[var(--mercy-card)] p-8 text-center shadow-[var(--mercy-shadow)]">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[var(--mercy-secondary)] text-[var(--mercy-navy)]">
            <Clock3 className="size-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-[var(--mercy-fg-strong)]">
            Your Mercy work history will appear here after drafting, research, review, or citation-checking work.
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[var(--mercy-fg-muted)]">
            History supports both general work and matter-linked work. Saved outputs will appear here once you mark completed work as saved.
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        {sections.map((section) => (
          <HistorySectionCard key={section.title} section={section} onSavedChange={updateRecord} />
        ))}
      </section>
    </div>
  );
}
