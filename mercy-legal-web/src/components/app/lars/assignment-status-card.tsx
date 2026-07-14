"use client";

import Link from "next/link";
import type { Route } from "next";
import { GitBranch, Loader2 } from "lucide-react";
import type { LarsJobSummary } from "@/lib/core-client";
import {
  assignmentWorkspaceHref,
  formatLarsLabel,
  larsStatusTone,
  phaseLabel,
} from "@/lib/lars-labels";
import { cn } from "@/lib/utils";

export type AssignmentStatusCardProps = {
  job: LarsJobSummary;
  compact?: boolean;
  showOpen?: boolean;
};

export function AssignmentStatusCard({ job, compact = false, showOpen = true }: AssignmentStatusCardProps) {
  const pending = job.pending_review_count ?? job.pending_gates?.length ?? 0;
  const href = assignmentWorkspaceHref(job.job_id, job.matter_id) as Route;
  const active = job.status === "running" || job.status === "verifying" || job.status === "queued";

  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-[#A5B4FC]",
        compact ? "p-3" : "p-4",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <GitBranch className="size-4 shrink-0 text-[#4F46E5]" />
            <p className="truncate text-sm font-semibold text-slate-950">{job.query || job.job_id}</p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className={cn("rounded-full border px-2 py-0.5 font-medium", larsStatusTone(job.status))}>
              {active ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" />
                  {formatLarsLabel(job.status)}
                </span>
              ) : (
                formatLarsLabel(job.status)
              )}
            </span>
            {job.phase ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
                {phaseLabel(job.phase)}
              </span>
            ) : null}
            {pending > 0 ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-900">
                {pending} review{pending === 1 ? "" : "s"}
              </span>
            ) : null}
            {job.deliverable_type ? (
              <span className="rounded-full border border-slate-200 px-2 py-0.5 text-slate-600">
                {formatLarsLabel(job.deliverable_type)}
              </span>
            ) : null}
          </div>
          {!compact ? (
            <p className="mt-2 text-xs text-slate-500">
              {job.artifact_count ?? 0} work product{(job.artifact_count ?? 0) === 1 ? "" : "s"}
              {job.deadline ? ` · Due ${job.deadline}` : ""}
              {job.updated_at ? ` · Updated ${job.updated_at}` : ""}
              {job.user_id ? ` · ${job.user_id}` : ""}
            </p>
          ) : null}
          {job.budget_state && !compact ? (
            <p className="mt-1 text-xs text-slate-500">
              Budget ${Number(job.budget_state.cost_usd_used || 0).toFixed(2)} / $
              {Number(job.budget_state.max_cost_usd || 0).toFixed(2)}
            </p>
          ) : null}
        </div>
        {showOpen ? (
          <Link
            href={href}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#4338CA] hover:bg-[#EEF2FF]"
          >
            Open workspace
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function AssignmentStatusList({
  jobs,
  emptyLabel = "No LARS assignments yet.",
  compact = false,
}: {
  jobs: LarsJobSummary[];
  emptyLabel?: string;
  compact?: boolean;
}) {
  if (!jobs.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {jobs.map((job) => (
        <AssignmentStatusCard key={job.job_id} job={job} compact={compact} />
      ))}
    </div>
  );
}
