"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { BookOpenText, Clock3, FileText, MessageSquareText, Plus, Search, ShieldCheck, Star } from "lucide-react";
import type { WorkHistoryRecord, WorkHistoryWorkflowType } from "@/lib/work-history-types";
import { setWorkHistorySavedClient } from "@/lib/work-history-client";
import { formatTimestamp, safeText, titleCase } from "@/lib/display-safety";

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
  const scope = record.reliabilitySnapshot?.source_scope;
  if (scope === "mixed") return "Mixed sources";
  if (scope === "tenant_documents") return "Tenant documents";
  if (scope === "public_dc_sources") return "D.C. sources";
  return null;
}

function recordSummary(record: WorkHistoryRecord) {
  return safeText(record.outputSummary ?? record.inputSummary ?? record.requestText, "Summary pending. Open the item to review the saved work.");
}

function reopenHref(record: WorkHistoryRecord): Route {
  if (record.matterId) return `/mercy?matterId=${encodeURIComponent(record.matterId)}` as Route;
  return "/mercy" as Route;
}

function matterHref(record: WorkHistoryRecord): Route | null {
  if (!record.matterId) return null;
  return `/matters/${encodeURIComponent(record.matterId)}` as Route;
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
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#EEF2FF] px-2.5 py-1 text-xs font-semibold text-[#4338CA]">
              {workflowLabel(record.workflowType)}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
              {contextLabel(record)}
            </span>
            {sourceScopeLabel(record) ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                {sourceScopeLabel(record)}
              </span>
            ) : null}
          </div>
          <h3 className="mt-3 line-clamp-2 text-sm font-semibold text-slate-950">{record.title}</h3>
        </div>
        <button
          type="button"
          onClick={toggleSaved}
          disabled={saving}
          className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
            saved
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Star className={`size-3.5 ${saved ? "fill-current" : ""}`} />
          {saved ? "Saved" : "Save"}
        </button>
      </div>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{recordSummary(record)}</p>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-slate-50 p-2">
          <dt className="font-medium text-slate-500">Created</dt>
          <dd className="mt-1 font-semibold text-slate-900">{formatTimestamp(record.createdAt)}</dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <dt className="font-medium text-slate-500">Reliability</dt>
          <dd className="mt-1 truncate font-semibold text-slate-900">{reliabilityLabel(record)}</dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <dt className="font-medium text-slate-500">Citations</dt>
          <dd className="mt-1 font-semibold text-slate-900">{citationCount(record)}</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={reopenHref(record)} className="rounded-lg bg-[#4F46E5] px-3 py-2 text-xs font-semibold text-white hover:bg-[#4338CA]">
          Reopen
        </Link>
        <Link href={reopenHref(record)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Continue
        </Link>
        {matterHref(record) ? (
          <Link href={matterHref(record)!} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Open matter
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function HistorySectionCard({ section, onSavedChange }: { section: HistorySection; onSavedChange: (record: WorkHistoryRecord) => void }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-slate-100 text-[#4F46E5]">
          <section.icon className="size-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-950">{section.title}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">{section.description}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        {section.records.length ? (
          section.records.slice(0, 6).map((record) => <HistoryCard key={record.id} record={record} onSavedChange={onSavedChange} />)
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            No saved work in this section yet.
          </div>
        )}
      </div>
    </section>
  );
}

export function HistoryPageClient({ initialRecords, configured, initialError }: HistoryPageClientProps) {
  const [records, setRecords] = useState(initialRecords);

  const sections = useMemo<HistorySection[]>(() => {
    const notArchived = records.filter((record) => record.status !== "archived");
    return [
      {
        title: "Recent work",
        description: "Latest Mercy runs, research, review, and citation checks.",
        icon: MessageSquareText,
        records: notArchived,
      },
      {
        title: "Matter-linked work",
        description: "Work tied to a selected matter.",
        icon: FileText,
        records: notArchived.filter((record) => Boolean(record.matterId)),
      },
      {
        title: "Drafting history",
        description: "Drafting, template, review, and document-review work.",
        icon: FileText,
        records: notArchived.filter((record) => ["drafting", "template", "review", "document_review"].includes(record.workflowType)),
      },
      {
        title: "Research history",
        description: "D.C. source research and matter-linked retrieval runs.",
        icon: Search,
        records: notArchived.filter((record) => record.workflowType === "research"),
      },
      {
        title: "Citation checks",
        description: "Citation/source checking work and reliability review context.",
        icon: ShieldCheck,
        records: notArchived.filter((record) => record.workflowType === "citation_check"),
      },
      {
        title: "Saved outputs",
        description: "Work product marked for follow-up.",
        icon: BookOpenText,
        records: notArchived.filter((record) => record.status === "saved" || Boolean(record.savedAt)),
      },
    ];
  }, [records]);

  function updateRecord(nextRecord: WorkHistoryRecord) {
    setRecords((current) => current.map((record) => (record.id === nextRecord.id ? nextRecord : record)));
  }

  return (
    <div className="space-y-5 p-5 lg:p-8">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#4338CA]">
              <Clock3 className="size-4" />
              History / Threads
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">Mercy work history</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Prior Mercy work stays scoped to your tenant, matter context when selected, reliability snapshots, and saved outputs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/mercy" className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA]">
              <MessageSquareText className="size-4" />
              Start in Mercy
            </Link>
            <Link href="/intake" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Plus className="size-4" />
              Create new matter
            </Link>
            <Link href="/templates" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
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
      </section>

      {!records.length ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5]">
            <Clock3 className="size-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-950">
            Your Mercy work history will appear here after drafting, research, review, or citation-checking work.
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
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
