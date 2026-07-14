"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  Download,
  GitBranch,
  Loader2,
  Pause,
  Play,
  Scale,
  Search,
  ShieldAlert,
  Square,
} from "lucide-react";
import type { CoreMatter } from "@/lib/core-client";
import {
  addLarsNote,
  applyLarsNodeAction,
  cancelLarsJob,
  decideLarsGate,
  getLarsJob,
  getLarsNode,
  getLarsSourceUsage,
  listLarsJobs,
  pauseLarsJob,
  protectLarsArtifact,
  resolveLarsContradiction,
  resumeLarsJob,
  type LarsArtifact,
  type LarsJobPayload,
  type LarsJobSummary,
  type LarsTreeNode,
} from "@/lib/core-client";
import {
  ACTION_LABELS,
  ALTS_FULL_NAME,
  ALTS_HELP,
  LARS_FULL_NAME,
  LARS_HELP,
  PHASES,
  assignmentWorkspaceHref,
  formatLarsLabel,
  larsStatusTone,
} from "@/lib/lars-labels";
import { AssignmentComposer } from "@/components/app/lars/assignment-composer";
import { cn } from "@/lib/utils";

type LarsWorkspacePageProps = {
  matters: CoreMatter[];
  coreOnline: boolean;
  initialJobId?: string;
  /** Matter scope for deep links; workspace is always Matter-nested (never a top-level product page). */
  initialMatterId?: string;
  /** When true, contextual detail only — no product landing / list UI. */
  workspaceOnly?: boolean;
};

function formatLabel(value: string | null | undefined): string {
  return formatLarsLabel(value);
}

function statusTone(status: string | undefined): string {
  return larsStatusTone(status);
}

function actionLabel(action: string, fallback?: string): string {
  return ACTION_LABELS[action] || fallback || formatLabel(action);
}

export function LarsWorkspacePage({
  matters,
  coreOnline,
  initialJobId,
  initialMatterId,
  workspaceOnly = false,
}: LarsWorkspacePageProps) {
  const [jobs, setJobs] = useState<LarsJobSummary[]>([]);
  const [payload, setPayload] = useState<LarsJobPayload | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeDetail, setNodeDetail] = useState<Record<string, unknown> | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [compareArtifactId, setCompareArtifactId] = useState<string | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<"paths" | "documents" | "authorities" | "review" | "timeline">("paths");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(!workspaceOnly && !initialJobId);
  const [showTechnical, setShowTechnical] = useState(false);
  const [sourceUsage, setSourceUsage] = useState<Record<string, unknown> | null>(null);
  const [treeQuery, setTreeQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [onlyContradictions, setOnlyContradictions] = useState(false);
  const [onlyLowConfidence, setOnlyLowConfidence] = useState(false);
  const [onlyAttorneyReview, setOnlyAttorneyReview] = useState(false);
  const [onlyUnverified, setOnlyUnverified] = useState(false);
  const [onlyActivePaths, setOnlyActivePaths] = useState(false);
  const [onlyCompletedPaths, setOnlyCompletedPaths] = useState(false);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set());
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const [gateNotes, setGateNotes] = useState("");
  const [attorneyNote, setAttorneyNote] = useState("");
  const [actionNotes, setActionNotes] = useState("");

  const jobId = payload?.job?.job_id ?? null;
  const phase = String(payload?.phase || "assignment");
  const treeNodes = useMemo(() => payload?.tree?.nodes ?? [], [payload?.tree?.nodes]);
  const artifacts = useMemo(() => payload?.artifacts_catalog ?? [], [payload?.artifacts_catalog]);
  const selectedArtifact = artifacts.find((a) => a.artifact_id === selectedArtifactId) ?? artifacts[0] ?? null;
  const compareArtifact = artifacts.find((a) => a.artifact_id === compareArtifactId) ?? null;

  const loadJobs = useCallback(async (matterIdFilter?: string) => {
    const result = await listLarsJobs(
      40,
      undefined,
      matterIdFilter ? { matterId: matterIdFilter } : undefined,
    );
    if (result.ok && result.data) {
      setJobs(result.data.jobs || []);
    }
  }, []);

  const loadJob = useCallback(
    async (id: string, silent = false) => {
      if (!silent) setBusy(true);
      const result = await getLarsJob(id);
      if (!silent) setBusy(false);
      if (!result.ok || !result.data) {
        if (!silent) setError(result.error || "Unable to load this assignment.");
        return;
      }
      setPayload(result.data);
      setShowComposer(false);
      setError(null);
      const root = result.data.tree?.root_node_id || result.data.job?.root_node_id;
      if (root && !selectedNodeId) setSelectedNodeId(root);
      const matterFromJob = result.data.job?.assignment
        ? String((result.data.job.assignment as Record<string, unknown>).matter_id || "")
        : "";
      if (matterFromJob) void loadJobs(matterFromJob);
      const sources = await getLarsSourceUsage(id);
      if (sources.ok && sources.data) setSourceUsage(sources.data);
    },
    [loadJobs, selectedNodeId],
  );

  useEffect(() => {
    void loadJobs();
    if (initialJobId) void loadJob(initialJobId);
  }, [initialJobId, loadJob, loadJobs]);

  useEffect(() => {
    if (!jobId) return;
    const status = payload?.job?.status;
    const active =
      payload?.background_running || status === "running" || status === "queued" || status === "verifying";
    if (!active) return;
    const timer = window.setInterval(() => {
      void loadJob(jobId, true);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [jobId, loadJob, payload?.background_running, payload?.job?.status]);

  useEffect(() => {
    if (!jobId || !selectedNodeId) {
      setNodeDetail(null);
      return;
    }
    void (async () => {
      const result = await getLarsNode(jobId, selectedNodeId);
      if (result.ok && result.data) setNodeDetail(result.data);
    })();
  }, [jobId, selectedNodeId, payload?.job?.updated_at]);

  const filteredNodes = useMemo(() => {
    const pendingGateNodeIds = new Set(
      (payload?.pending_gates || [])
        .map((gate) => String((gate as Record<string, unknown>).node_id || (gate as Record<string, unknown>).related_node_id || ""))
        .filter(Boolean),
    );
    const unverifiedAuthorityNodeIds = new Set(
      (payload?.authorities || [])
        .filter((auth) => {
          const status = String((auth as Record<string, unknown>).validation_status || "").toLowerCase();
          return status.includes("unverified") || status.includes("candidate") || status.includes("warn");
        })
        .map((auth) => String((auth as Record<string, unknown>).node_id || ""))
        .filter(Boolean),
    );
    const activeStatuses = new Set(["open", "active", "challenged", "revised"]);
    const completedStatuses = new Set(["complete", "verified", "retained", "merged", "pruned"]);
    const parentById = new Map(treeNodes.map((node) => [node.node_id, node.parent_ids || []]));

    function isHiddenByCollapse(nodeId: string): boolean {
      let parents = parentById.get(nodeId) || [];
      const seen = new Set<string>();
      while (parents.length) {
        const parentId = parents[0];
        if (!parentId || seen.has(parentId)) break;
        seen.add(parentId);
        if (collapsedNodeIds.has(parentId)) return true;
        parents = parentById.get(parentId) || [];
      }
      return false;
    }

    return treeNodes.filter((node) => {
      if (isHiddenByCollapse(node.node_id)) return false;
      if (filterType !== "all" && node.node_type !== filterType) return false;
      if (filterStatus !== "all" && node.status !== filterStatus) return false;
      if (onlyContradictions && !node.has_contradictions) return false;
      if (onlyLowConfidence && (node.confidence ?? 1) >= 0.55 && (node.overall_score ?? 1) >= 0.55) return false;
      if (onlyActivePaths && !activeStatuses.has(node.status)) return false;
      if (onlyCompletedPaths && !completedStatuses.has(node.status)) return false;
      if (onlyAttorneyReview) {
        // Node-level only — do not use job.status (waiting_attorney would make every node pass).
        const isReviewNode =
          node.node_type === "attorney_checkpoint" ||
          node.status === "blocked" ||
          pendingGateNodeIds.has(node.node_id);
        // Intentional keep list for attorney-review context (not full tree).
        const keepForReview =
          node.node_type === "final_artifact" || node.node_type === "synthesis" || node.node_type === "contradiction";
        if (!isReviewNode && !keepForReview) {
          return false;
        }
      }
      if (onlyUnverified) {
        const unverified =
          node.status === "open" ||
          node.status === "active" ||
          node.status === "challenged" ||
          unverifiedAuthorityNodeIds.has(node.node_id) ||
          (node.confidence ?? 1) < 0.6;
        if (!unverified) return false;
      }
      if (treeQuery) {
        const q = treeQuery.toLowerCase();
        const hay = `${node.label} ${node.purpose || ""} ${node.hypothesis || ""} ${node.node_type}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    treeNodes,
    filterType,
    filterStatus,
    onlyContradictions,
    onlyLowConfidence,
    onlyAttorneyReview,
    onlyUnverified,
    onlyActivePaths,
    onlyCompletedPaths,
    collapsedNodeIds,
    treeQuery,
    payload?.pending_gates,
    payload?.authorities,
  ]);

  const layout = useMemo(
    () => layoutTree(filteredNodes.length ? filteredNodes : treeNodes, payload?.tree?.root_node_id),
    [filteredNodes, treeNodes, payload?.tree?.root_node_id],
  );

  function toggleCollapsed(nodeId: string) {
    setCollapsedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  async function withJobUpdate(
    action: () => Promise<{ ok: boolean; data: LarsJobPayload | null; error: string | null }>,
    okMessage?: string,
  ) {
    if (!jobId) return;
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok || !result.data) {
      setError(result.error || "That action could not be completed.");
      return;
    }
    setPayload(result.data);
    if (okMessage) setMessage(okMessage);
    await loadJobs();
  }

  const assignment = (payload?.job?.assignment || {}) as Record<string, unknown>;
  const budget = payload?.budget_snapshot || {};
  const pendingGates = payload?.pending_gates || [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white/80 px-5 py-5 backdrop-blur lg:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4F46E5]">
              Assignment workspace
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 md:text-3xl">
              {jobId
                ? String(assignment.query || "Legal assignment")
                : "Assignment workspace"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Durable {LARS_FULL_NAME} (LARS) workspace with {ALTS_FULL_NAME} (ALTS) research paths, authorities,
              attorney review, and work products. Leave and return anytime — progress is persisted.
            </p>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500" title={`${LARS_HELP} ${ALTS_HELP}`}>
              LARS manages assignment lifecycle and delivery. ALTS manages exploration, challenge, and verification inside the assignment.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                coreOnline ? "border-slate-200 bg-white text-slate-600" : "border-red-200 bg-red-50 text-red-800",
              )}
            >
              Core {coreOnline ? "online" : "unavailable"}
            </span>
            {assignment.matter_id ? (
              <Link
                href={`/matters/${encodeURIComponent(String(assignment.matter_id))}` as Route}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back to matter
              </Link>
            ) : (
              <Link
                href={"/matters" as Route}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Matters
              </Link>
            )}
            {!workspaceOnly ? (
              <button
                type="button"
                onClick={() => {
                  setShowComposer(true);
                  setPayload(null);
                }}
                className="rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#4338CA]"
              >
                Start new assignment
              </button>
            ) : null}
          </div>
        </div>

        {jobId ? (
          <div className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1.4fr_1fr_auto]">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-slate-950">{String(assignment.query || "Assignment")}</p>
              <p className="mt-1 text-xs text-slate-500">
                Matter {String(assignment.matter_id || "—")} · {formatLabel(String(assignment.deliverable_type || ""))} ·{" "}
                {String(assignment.jurisdiction || "D.C.")}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Assigned attorney {String(payload?.job?.user_id || "—")} · Updated {String(payload?.job?.updated_at || "—")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={cn("rounded-full border px-2.5 py-1 font-medium", statusTone(payload?.job?.status))}>
                {formatLabel(payload?.job?.status)}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">
                Stage: {PHASES.find((p) => p.id === phase)?.label || formatLabel(phase)}
              </span>
              {payload?.background_running ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-900">
                  <Loader2 className="size-3 animate-spin" /> Working in background
                </span>
              ) : null}
              <span className="rounded-full border border-slate-200 px-2.5 py-1 text-slate-600">
                Usage ${Number(budget.cost_usd_used || 0).toFixed(2)} / ${Number(budget.max_cost_usd || 0).toFixed(2)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void withJobUpdate(() => pauseLarsJob(jobId), "Assignment paused.")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Pause className="size-3.5" /> Pause
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void withJobUpdate(() => resumeLarsJob(jobId), "Assignment resumed.")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Play className="size-3.5" /> Resume
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void withJobUpdate(() => cancelLarsJob(jobId), "Assignment canceled.")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900 hover:bg-red-100"
              >
                <Square className="size-3.5" /> Cancel
              </button>
            </div>
          </div>
        ) : null}

        {jobId ? (
          <nav aria-label="Assignment stages" className="mt-4 flex flex-wrap gap-1">
            {PHASES.map((item, index) => {
              const activeIndex = PHASES.findIndex((p) => p.id === phase);
              const done = index < activeIndex || phase === "complete";
              const current = item.id === phase;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
                    current
                      ? "border-[#4F46E5] bg-[#4F46E5] text-white"
                      : done
                        ? "border-slate-200 bg-white text-slate-800"
                        : "border-transparent text-slate-400",
                  )}
                >
                  {done && !current ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" />}
                  {item.label}
                  {index < PHASES.length - 1 ? <ChevronRight className="ml-1 size-3 opacity-50" /> : null}
                </div>
              );
            })}
          </nav>
        ) : null}
      </header>

      <div className="grid gap-5 p-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:p-8">
        <aside className="space-y-3">
          <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Your assignments</h2>
              <button type="button" className="text-xs font-medium text-[#4F46E5]" onClick={() => void loadJobs()}>
                Refresh
              </button>
            </div>
            <div className="max-h-[60vh] space-y-1 overflow-y-auto">
              {jobs.length === 0 ? (
                <p className="px-2 py-4 text-sm text-slate-500">No assignments have been started yet.</p>
              ) : (
                jobs.map((job) => (
                  <Link
                    key={job.job_id}
                    href={
                      assignmentWorkspaceHref(
                        job.job_id,
                        job.matter_id || initialMatterId || (assignment.matter_id as string | undefined),
                      ) as Route
                    }
                    className={cn(
                      "block w-full rounded-lg border px-3 py-2.5 text-left transition",
                      job.job_id === jobId
                        ? "border-[#A5B4FC] bg-[#F8FAFF]"
                        : "border-transparent hover:border-slate-200 hover:bg-slate-50",
                    )}
                  >
                    <p className="line-clamp-2 text-sm font-medium text-slate-950">{job.query || job.job_id}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {formatLabel(job.status)} · {job.artifact_count ?? 0} documents
                    </p>
                  </Link>
                ))
              )}
            </div>
          </section>

          {jobId ? (
            <section className="rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 shadow-sm">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Usage</h2>
              <BudgetMeter label="Research steps used" used={Number(budget.model_calls_used || 0)} max={Number(budget.max_model_calls || 1)} />
              <BudgetMeter label="Source checks used" used={Number(budget.tool_calls_used || 0)} max={Number(budget.max_tool_calls || 1)} />
              <BudgetMeter label="Estimated cost" used={Number(budget.cost_usd_used || 0)} max={Number(budget.max_cost_usd || 1)} money />
              <p className="mt-2">
                Analysis depth {String(budget.tree_depth ?? 0)} · Active paths {String(budget.active_branches ?? 0)}
              </p>
              <p>Open conflicts {String(budget.contradictions_open ?? 0)}</p>
            </section>
          ) : null}
        </aside>

        <main className="min-w-0 space-y-5">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">{message}</div>
          ) : null}

          {(showComposer || !jobId) && !workspaceOnly ? (
            <AssignmentComposer
              matters={matters}
              surfaceContext="web"
              onStarted={(started) => {
                setPayload(started);
                setShowComposer(false);
              }}
              onCancel={jobId ? () => setShowComposer(false) : undefined}
            />
          ) : null}
          {workspaceOnly && !jobId && !busy ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              This assignment could not be loaded. It may not exist, or you may not have access within this tenant.
              Start a new assignment from a Matter, Chat, or Research surface.
            </div>
          ) : null}

          {jobId ? (
            <>
              <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
                {(
                  [
                    ["paths", "Research paths"],
                    ["documents", "Work product"],
                    ["authorities", "Authorities"],
                    ["review", "Your review"],
                    ["timeline", "Activity"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setWorkspaceTab(id)}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm font-medium",
                      workspaceTab === id
                        ? "bg-[#EEF2FF] text-[#4338CA]"
                        : "text-slate-600 hover:bg-white hover:text-slate-950",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {workspaceTab === "paths" ? (
                <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
                      <GitBranch className="size-4 text-[#4F46E5]" />
                      <h2 className="text-base font-semibold text-slate-950">Lines of analysis</h2>
                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-2 top-2.5 size-3.5 text-slate-400" />
                          <input
                            value={treeQuery}
                            onChange={(e) => setTreeQuery(e.target.value)}
                            placeholder="Search issues"
                            className="w-44 rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-xs"
                          />
                        </div>
                        <select
                          value={filterType}
                          onChange={(e) => setFilterType(e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                        >
                          <option value="all">All types</option>
                          {[...new Set(treeNodes.map((n) => n.node_type))].map((type) => (
                            <option key={type} value={type}>
                              {formatLabel(type)}
                            </option>
                          ))}
                        </select>
                        <select
                          value={filterStatus}
                          onChange={(e) => setFilterStatus(e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                        >
                          <option value="all">All statuses</option>
                          {[...new Set(treeNodes.map((n) => n.status))].map((status) => (
                            <option key={status} value={status}>
                              {formatLabel(status)}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1 text-xs text-slate-600">
                          <input type="checkbox" checked={onlyContradictions} onChange={(e) => setOnlyContradictions(e.target.checked)} />
                          Conflicts only
                        </label>
                        <label className="flex items-center gap-1 text-xs text-slate-600">
                          <input type="checkbox" checked={onlyAttorneyReview} onChange={(e) => setOnlyAttorneyReview(e.target.checked)} />
                          Attorney review only
                        </label>
                        <label className="flex items-center gap-1 text-xs text-slate-600">
                          <input type="checkbox" checked={onlyUnverified} onChange={(e) => setOnlyUnverified(e.target.checked)} />
                          Unverified only
                        </label>
                        <label className="flex items-center gap-1 text-xs text-slate-600">
                          <input type="checkbox" checked={onlyLowConfidence} onChange={(e) => setOnlyLowConfidence(e.target.checked)} />
                          Lower confidence
                        </label>
                        <label className="flex items-center gap-1 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={onlyActivePaths}
                            onChange={(e) => {
                              setOnlyActivePaths(e.target.checked);
                              if (e.target.checked) setOnlyCompletedPaths(false);
                            }}
                          />
                          Active paths
                        </label>
                        <label className="flex items-center gap-1 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={onlyCompletedPaths}
                            onChange={(e) => {
                              setOnlyCompletedPaths(e.target.checked);
                              if (e.target.checked) setOnlyActivePaths(false);
                            }}
                          />
                          Completed paths
                        </label>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                          onClick={() => setCollapsedNodeIds(new Set())}
                        >
                          Expand all
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                          onClick={() =>
                            setCollapsedNodeIds(
                              new Set(treeNodes.filter((n) => (n.child_ids || []).length > 0).map((n) => n.node_id)),
                            )
                          }
                        >
                          Collapse all
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                          onClick={() => {
                            setPan({ x: 24, y: 24 });
                            setZoom(1);
                          }}
                        >
                          Fit
                        </button>
                        <button type="button" className="rounded-lg border border-slate-200 px-2 py-1 text-xs" onClick={() => setZoom((z) => Math.min(2.2, z + 0.1))}>
                          +
                        </button>
                        <button type="button" className="rounded-lg border border-slate-200 px-2 py-1 text-xs" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}>
                          −
                        </button>
                      </div>
                    </div>
                    <div
                      className="relative h-[480px] overflow-hidden bg-slate-50"
                      onMouseDown={(e) => {
                        setDragging(true);
                        dragOrigin.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
                      }}
                      onMouseMove={(e) => {
                        if (!dragging || !dragOrigin.current) return;
                        setPan({
                          x: dragOrigin.current.panX + (e.clientX - dragOrigin.current.x),
                          y: dragOrigin.current.panY + (e.clientY - dragOrigin.current.y),
                        });
                      }}
                      onMouseUp={() => setDragging(false)}
                      onMouseLeave={() => setDragging(false)}
                    >
                      <svg className="absolute inset-0 h-full w-full" role="img" aria-label="Research paths">
                        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                          {layout.edges.map((edge) => (
                            <line
                              key={`${edge.from}-${edge.to}`}
                              x1={edge.x1}
                              y1={edge.y1}
                              x2={edge.x2}
                              y2={edge.y2}
                              stroke="#CBD5E1"
                              strokeWidth={1.5}
                            />
                          ))}
                          {layout.nodes.map((node) => {
                            const active = node.node_id === selectedNodeId;
                            const hasChildren = (node.child_ids || []).length > 0;
                            const isCollapsed = collapsedNodeIds.has(node.node_id);
                            return (
                              <g
                                key={node.node_id}
                                transform={`translate(${node.x} ${node.y})`}
                                className="cursor-pointer"
                                onClick={() => setSelectedNodeId(node.node_id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") setSelectedNodeId(node.node_id);
                                  if (e.key === "c" || e.key === "C") toggleCollapsed(node.node_id);
                                }}
                                tabIndex={0}
                                role="button"
                                aria-label={`${node.label}${hasChildren ? (isCollapsed ? ", collapsed" : ", expanded") : ""}`}
                                aria-expanded={hasChildren ? !isCollapsed : undefined}
                              >
                                <rect
                                  x={-90}
                                  y={-28}
                                  width={180}
                                  height={56}
                                  rx={8}
                                  fill={active ? "#4F46E5" : "#FFFFFF"}
                                  stroke={node.has_contradictions ? "#D97706" : active ? "#4F46E5" : "#E2E8F0"}
                                  strokeWidth={active ? 2 : 1}
                                />
                                <text x={0} y={-6} textAnchor="middle" fontSize={11} fill={active ? "#FFFFFF" : "#0F172A"} fontWeight={600}>
                                  {truncate(node.label, 28)}
                                </text>
                                <text x={0} y={12} textAnchor="middle" fontSize={10} fill={active ? "#E0E7FF" : "#64748B"}>
                                  {formatLabel(node.node_type)} · {Math.round((node.confidence || 0) * 100)}%
                                  {hasChildren ? (isCollapsed ? " · +" : " · −") : ""}
                                </text>
                                {hasChildren ? (
                                  <g
                                    transform="translate(78 -20)"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleCollapsed(node.node_id);
                                    }}
                                  >
                                    <circle r={8} fill={active ? "#4338CA" : "#EEF2FF"} stroke={active ? "#C7D2FE" : "#A5B4FC"} />
                                    <text textAnchor="middle" y={3} fontSize={10} fill={active ? "#FFFFFF" : "#4338CA"}>
                                      {isCollapsed ? "+" : "−"}
                                    </text>
                                  </g>
                                ) : null}
                              </g>
                            );
                          })}
                        </g>
                      </svg>
                    </div>
                    <div ref={listRef} className="max-h-48 overflow-y-auto border-t border-slate-200 p-3" aria-label="Research path list">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">List view</p>
                      <ul className="space-y-1">
                        {filteredNodes.map((node) => {
                          const hasChildren = (node.child_ids || []).length > 0;
                          const isCollapsed = collapsedNodeIds.has(node.node_id);
                          return (
                            <li key={node.node_id}>
                              <div
                                className={cn(
                                  "flex w-full items-start justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm",
                                  selectedNodeId === node.node_id ? "bg-[#EEF2FF]" : "hover:bg-slate-50",
                                )}
                              >
                                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedNodeId(node.node_id)}>
                                  <span className="font-medium text-slate-950">{node.label}</span>
                                  <span className="mt-0.5 block text-xs text-slate-500">
                                    {formatLabel(node.node_type)} · {formatLabel(node.status)} · path{" "}
                                    {node.branch_id.slice(0, 10)}
                                    {hasChildren ? (isCollapsed ? " · collapsed" : " · expanded") : ""}
                                  </span>
                                </button>
                                <span className="flex shrink-0 items-center gap-1">
                                  {hasChildren ? (
                                    <button
                                      type="button"
                                      aria-label={isCollapsed ? "Expand branch" : "Collapse branch"}
                                      onClick={() => toggleCollapsed(node.node_id)}
                                      className="rounded border border-slate-200 px-1.5 py-0.5 text-xs font-semibold text-[#4338CA]"
                                    >
                                      {isCollapsed ? "+" : "−"}
                                    </button>
                                  ) : null}
                                  <span className="text-xs text-slate-500">{node.authority_count} authorities</span>
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>

                  <NodeDetailPanel
                    nodeDetail={nodeDetail}
                    actionNotes={actionNotes}
                    setActionNotes={setActionNotes}
                    attorneyNote={attorneyNote}
                    setAttorneyNote={setAttorneyNote}
                    showTechnical={showTechnical}
                    setShowTechnical={setShowTechnical}
                    busy={busy}
                    onAction={(action) => {
                      if (!jobId || !selectedNodeId) return;
                      void withJobUpdate(
                        () => applyLarsNodeAction(jobId, selectedNodeId, { action, notes: actionNotes || undefined }),
                        `${actionLabel(action)} applied.`,
                      );
                    }}
                    onNote={() => {
                      if (!jobId || !attorneyNote.trim()) return;
                      void withJobUpdate(
                        () => addLarsNote(jobId, { text: attorneyNote, node_id: selectedNodeId || undefined }),
                        "Note saved.",
                      ).then(() => setAttorneyNote(""));
                    }}
                  />
                </section>
              ) : null}

              {workspaceTab === "documents" ? (
                <ArtifactsPanel
                  jobId={jobId}
                  artifacts={artifacts}
                  selected={selectedArtifact}
                  compare={compareArtifact}
                  busy={busy}
                  onSelect={setSelectedArtifactId}
                  onCompare={setCompareArtifactId}
                  onProtected={(next) => {
                    setPayload(next);
                    setMessage("Manual edit protection saved. Automatic revisions will not replace locked text.");
                  }}
                  onError={setError}
                />
              ) : null}

              {workspaceTab === "authorities" ? (
                <AuthoritiesPanel
                  authorities={payload?.authorities || []}
                  contradictions={payload?.unresolved_contradictions || []}
                  sourceUsage={sourceUsage}
                  busy={busy}
                  onResolve={(id, status, notes) => {
                    if (!jobId) return;
                    void withJobUpdate(
                      () => resolveLarsContradiction(jobId, id, { resolution_status: status, notes }),
                      "Your decision was recorded.",
                    );
                  }}
                />
              ) : null}

              {workspaceTab === "review" ? (
                <ReviewPanel
                  pendingGates={pendingGates}
                  gateHistory={payload?.gate_history || []}
                  notes={payload?.attorney_notes || []}
                  gateNotes={gateNotes}
                  setGateNotes={setGateNotes}
                  busy={busy}
                  onDecide={(gateId, decision) => {
                    if (!jobId) return;
                    void withJobUpdate(
                      () => decideLarsGate(jobId, gateId, { decision, notes: gateNotes || undefined, continue_steps: 4 }),
                      decision === "approved"
                        ? "Approved. Mercy will continue where appropriate."
                        : decision === "revision_requested"
                          ? "Revision requested."
                          : "Rejected.",
                    );
                  }}
                />
              ) : null}

              {workspaceTab === "timeline" ? (
                <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-950">Assignment activity</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    This record is saved with the assignment, so you can leave and return without losing progress.
                  </p>
                  <ol className="mt-5 space-y-3">
                    {(payload?.timeline || [])
                      .slice()
                      .reverse()
                      .map((event) => (
                        <li key={String(event.event_id || event.timestamp)} className="border-l-2 border-slate-200 pl-4">
                          <p className="text-sm font-medium text-slate-950">
                            {attorneyEventSummary(String(event.event_type || ""), event.summary)}
                          </p>
                          <p className="text-xs text-slate-500">{String(event.timestamp || "")}</p>
                        </li>
                      ))}
                  </ol>
                </section>
              ) : null}
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function attorneyEventSummary(eventType: string, summary?: string): string {
  const map: Record<string, string> = {
    job_created: "Assignment created",
    job_started: "Work began",
    job_paused: "Paused for review",
    job_resumed: "Resumed",
    job_canceled: "Canceled",
    job_completed: "Completed",
    gate_decision: "Attorney decision recorded",
    alts_action_selected: "Next research step selected",
    branch_pruned: "Research path removed",
    branches_merged: "Research paths combined",
    hypotheses_seeded: "Working theories prepared",
    attorney_action: "Attorney directed next step",
    contradiction_resolved: "Conflict decision recorded",
    attorney_note_added: "Note added",
    background_run_started: "Background work started",
    background_run_finished: "Background work finished",
    revision_requested: "Revision requested",
  };
  return map[eventType] || summary || formatLabel(eventType);
}

function BudgetMeter({ label, used, max, money }: { label: string; used: number; max: number; money?: boolean }) {
  const pct = Math.min(100, Math.round((used / Math.max(max, 0.0001)) * 100));
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between">
        <span>{label}</span>
        <span>{money ? `$${used.toFixed(2)} / $${max.toFixed(2)}` : `${used} / ${max}`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-[#4F46E5]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function NodeDetailPanel({
  nodeDetail,
  actionNotes,
  setActionNotes,
  attorneyNote,
  setAttorneyNote,
  showTechnical,
  setShowTechnical,
  busy,
  onAction,
  onNote,
}: {
  nodeDetail: Record<string, unknown> | null;
  actionNotes: string;
  setActionNotes: (value: string) => void;
  attorneyNote: string;
  setAttorneyNote: (value: string) => void;
  showTechnical: boolean;
  setShowTechnical: (value: boolean) => void;
  busy: boolean;
  onAction: (action: string) => void;
  onNote: () => void;
}) {
  if (!nodeDetail) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 shadow-sm">
        Select an issue or research path to review findings, authorities, and available next steps.
      </div>
    );
  }
  const node = (nodeDetail.node || {}) as Record<string, unknown>;
  const actions = (nodeDetail.available_actions as Array<{ action: string; label: string }>) || [];
  const authorities = (nodeDetail.supporting_authorities as Array<Record<string, unknown>>) || [];
  const contradictions = (nodeDetail.contradictions as Array<Record<string, unknown>>) || [];
  const evaluation = (nodeDetail.evaluation || {}) as Record<string, unknown>;
  const findings = (nodeDetail.findings as string[]) || [];
  const parents = (nodeDetail.parents as Array<Record<string, unknown>>) || [];
  const children = (nodeDetail.children as Array<Record<string, unknown>>) || [];

  function pathLabel(item: Record<string, unknown>): string {
    return String(
      item.research_question || item.hypothesis || item.proposed_legal_theory || item.node_type || item.node_id || "Path",
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start gap-2">
        <GitBranch className="mt-1 size-4 text-[#4F46E5]" />
        <div>
          <h2 className="text-base font-semibold text-slate-950">{String(nodeDetail.label || "Selected item")}</h2>
          <p className="text-xs text-slate-500">
            {formatLabel(String(node.node_type))} · {formatLabel(String(node.status))}
          </p>
        </div>
      </div>
      <DetailBlock title="Legal question / purpose" body={String(nodeDetail.purpose || "—")} />
      <DetailBlock title="Current finding or conclusion" body={findings.length ? findings.join("\n\n") : "No findings yet."} />
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-700">
          Strength {Number(evaluation.overall || 0).toFixed(2)}
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-700">
          Confidence {Number(node.confidence || 0).toFixed(2)}
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Parent paths</h3>
          <ul className="mt-1 space-y-1 text-xs text-slate-700">
            {parents.map((parent) => (
              <li key={String(parent.node_id)} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                <span className="font-medium">{pathLabel(parent)}</span>
                <span className="mt-0.5 block text-[11px] text-slate-500">
                  {formatLabel(String(parent.node_type))} · {formatLabel(String(parent.status))}
                </span>
              </li>
            ))}
            {!parents.length ? <li className="text-slate-500">Root or no parents recorded.</li> : null}
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Child paths</h3>
          <ul className="mt-1 space-y-1 text-xs text-slate-700">
            {children.map((child) => (
              <li key={String(child.node_id)} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                <span className="font-medium">{pathLabel(child)}</span>
                <span className="mt-0.5 block text-[11px] text-slate-500">
                  {formatLabel(String(child.node_type))} · {formatLabel(String(child.status))}
                </span>
              </li>
            ))}
            {!children.length ? <li className="text-slate-500">No child paths yet.</li> : null}
          </ul>
        </div>
      </div>
      <div className="mt-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Supporting authorities</h3>
        <ul className="mt-1 space-y-1 text-sm">
          {authorities.slice(0, 8).map((auth, index) => (
            <li key={String(auth.authority_id || index)} className="rounded-lg border border-slate-200 px-2 py-1.5">
              {String(auth.citation || auth.title || "Authority")}
              <span className="mt-0.5 block text-[11px] text-slate-500">
                {String(auth.jurisdiction || "")} · {String(auth.validation_status || "")}
              </span>
            </li>
          ))}
          {!authorities.length ? <li className="text-slate-500">None recorded on this item yet.</li> : null}
        </ul>
      </div>
      {contradictions.length ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">
          <ShieldAlert className="mb-1 size-3.5" />
          {contradictions.length} conflict(s) linked to this research path.
        </div>
      ) : null}
      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Available next steps</h3>
        <input
          value={actionNotes}
          onChange={(e) => setActionNotes(e.target.value)}
          placeholder="Optional notes for this step"
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {actions.map((item) => (
            <button
              key={item.action}
              type="button"
              disabled={busy}
              onClick={() => onAction(item.action)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-[#A5B4FC] hover:bg-[#F8FAFF] hover:text-[#4338CA]"
            >
              {actionLabel(item.action, item.label)}
            </button>
          ))}
          {!actions.length ? <span className="text-xs text-slate-500">No actions available in this state.</span> : null}
        </div>
      </div>
      <div className="mt-4 border-t border-slate-200 pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Attorney note</h3>
        <textarea
          value={attorneyNote}
          onChange={(e) => setAttorneyNote(e.target.value)}
          rows={2}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          disabled={busy || !attorneyNote.trim()}
          onClick={onNote}
          className="mt-2 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white"
        >
          Save note
        </button>
      </div>
      <div className="mt-4 border-t border-slate-200 pt-3">
        <button
          type="button"
          onClick={() => setShowTechnical(!showTechnical)}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          {showTechnical ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          Technical details
        </button>
        {showTechnical ? (
          <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
            <p>
              <span className="font-semibold">Assigned Mercy specialist: </span>
              {String((nodeDetail.moe_route as Record<string, unknown> | undefined)?.expert || node.assigned_agents || "—")}
            </p>
            <p>
              <span className="font-semibold">Tools: </span>
              {JSON.stringify(nodeDetail.tools_used || node.tools_used || [])}
            </p>
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap">
              {JSON.stringify(nodeDetail.moe_route || node.moe_route || {}, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ArtifactsPanel({
  jobId,
  artifacts,
  selected,
  compare,
  busy,
  onSelect,
  onCompare,
  onProtected,
  onError,
}: {
  jobId: string | null;
  artifacts: LarsArtifact[];
  selected: LarsArtifact | null;
  compare: LarsArtifact | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onCompare: (id: string | null) => void;
  onProtected: (payload: LarsJobPayload) => void;
  onError: (message: string) => void;
}) {
  const headings = useMemo(() => extractHeadings(selected?.content_markdown || ""), [selected?.content_markdown]);
  const isLocked = Boolean(selected?.protection?.manual_lock || selected?.protection?.locked_content_markdown);

  async function copyContent() {
    if (!selected?.content_markdown) return;
    await navigator.clipboard.writeText(selected.content_markdown);
  }

  function downloadContent() {
    if (!selected?.content_markdown) return;
    const blob = new Blob([selected.content_markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.kind || "work-product"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function toggleProtection(protectedValue: boolean) {
    if (!jobId || !selected?.artifact_id) return;
    const result = await protectLarsArtifact(jobId, selected.artifact_id, {
      protected: protectedValue,
      section_key: "full_document",
      notes: protectedValue
        ? "Attorney protected manually edited text from automatic replacement."
        : "Attorney released automatic-replacement protection.",
    });
    if (!result.ok || !result.data) {
      onError(result.error || "Could not update protection.");
      return;
    }
    onProtected(result.data);
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <h2 className="mb-2 text-base font-semibold text-slate-950">Work product</h2>
        <ul className="space-y-1">
          {artifacts.map((artifact) => (
            <li key={artifact.artifact_id}>
              <button
                type="button"
                onClick={() => onSelect(artifact.artifact_id)}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left text-sm",
                  selected?.artifact_id === artifact.artifact_id ? "bg-[#EEF2FF] text-[#4338CA]" : "hover:bg-slate-50",
                )}
              >
                <span className="font-medium">{artifact.title}</span>
                <span className="mt-0.5 block text-[11px] capitalize text-slate-500">
                  {formatLabel(artifact.kind)} · v{artifact.version || 1} · {formatLabel(artifact.review_status || "working")}
                  {artifact.protection?.manual_lock ? " · Protected" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {selected ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4F46E5]">Document</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">{selected.title}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Version {selected.version || 1} · {formatLabel(selected.review_status || "working")}
                  {selected.attorney_review_required ? " · Attorney review required" : ""}
                  {isLocked ? " · Manual edits protected" : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void copyContent()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium">
                  <Copy className="size-3.5" /> Copy
                </button>
                <button type="button" onClick={downloadContent} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium">
                  <Download className="size-3.5" /> Download
                </button>
                <button
                  type="button"
                  disabled={busy || !jobId}
                  onClick={() => void toggleProtection(!isLocked)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium",
                    isLocked
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-slate-200 bg-white text-slate-700",
                  )}
                >
                  {isLocked ? "Unlock auto-replace" : "Protect manual edits"}
                </button>
                <select
                  value={compare?.artifact_id || ""}
                  onChange={(e) => onCompare(e.target.value || null)}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                >
                  <option value="">Compare…</option>
                  {artifacts
                    .filter((a) => a.artifact_id !== selected.artifact_id)
                    .map((a) => (
                      <option key={a.artifact_id} value={a.artifact_id}>
                        {a.title}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className={cn("mt-4 grid gap-4", compare ? "lg:grid-cols-2" : "")}>
              <article>
                {headings.length ? (
                  <nav className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                    <p className="mb-1 font-semibold uppercase tracking-[0.12em] text-slate-500">Contents</p>
                    <ul className="space-y-1 text-slate-600">
                      {headings.map((heading) => (
                        <li key={heading}>{heading}</li>
                      ))}
                    </ul>
                  </nav>
                ) : null}
                <pre className="whitespace-pre-wrap text-sm leading-7 text-slate-800">{selected.content_markdown}</pre>
              </article>
              {compare ? (
                <article className="border-l border-slate-200 pl-4">
                  <h3 className="mb-2 text-base font-semibold text-slate-950">{compare.title}</h3>
                  <pre className="whitespace-pre-wrap text-sm leading-7 text-slate-800">{compare.content_markdown}</pre>
                </article>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">No work product is available yet.</p>
        )}
      </div>
    </section>
  );
}

function AuthoritiesPanel({
  authorities,
  contradictions,
  sourceUsage,
  busy,
  onResolve,
}: {
  authorities: Array<Record<string, unknown>>;
  contradictions: Array<Record<string, unknown>>;
  sourceUsage?: Record<string, unknown> | null;
  busy: boolean;
  onResolve: (id: string, status: string, notes?: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const usageSources = Array.isArray(sourceUsage?.sources)
    ? (sourceUsage?.sources as Array<Record<string, unknown>>)
    : [];
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Scale className="size-4 text-[#4F46E5]" />
            <h2 className="text-lg font-semibold text-slate-950">Authorities</h2>
          </div>
          <div className="space-y-2">
            {authorities.map((auth, index) => (
              <article key={String(auth.authority_id || index)} className="rounded-xl border border-slate-200 p-3">
                <h3 className="text-sm font-semibold text-slate-950">{String(auth.citation || auth.title)}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {String(auth.jurisdiction || "—")} · {String(auth.authority_type || "—")} ·{" "}
                  {String(auth.precedential_weight || "—")} · {String(auth.validation_status || "—")}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{String(auth.retrieved_text || "").slice(0, 320)}</p>
                {auth.proposition_supported ? (
                  <p className="mt-2 text-xs text-slate-500">Supports: {String(auth.proposition_supported)}</p>
                ) : null}
              </article>
            ))}
            {!authorities.length ? <p className="text-sm text-slate-500">No authorities recorded yet.</p> : null}
          </div>
        </div>
        {usageSources.length ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-950">Source usage tracing</h2>
            <p className="mt-1 text-xs text-slate-500">
              Claim → ALTS finding → authority → source passage. Source classes distinguish primary, secondary, D.C.
              official, matter document, attorney-provided, and unverified sources.
            </p>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {usageSources.slice(0, 40).map((source) => (
                <article key={String(source.source_key)} className="rounded-lg border border-slate-200 p-3 text-xs">
                  <p className="font-semibold text-slate-900">{String(source.label || source.source_key)}</p>
                  <p className="mt-1 text-slate-500">{formatLabel(String(source.source_class || "unverified_source"))}</p>
                  <p className="mt-1 text-slate-600">
                    Paths {(source.alts_paths as unknown[] | undefined)?.length || 0} · Claims{" "}
                    {(source.claims as unknown[] | undefined)?.length || 0} · Work products{" "}
                    {(source.work_product_sections as unknown[] | undefined)?.length || 0} · Conflicts{" "}
                    {(source.contradictions as unknown[] | undefined)?.length || 0}
                  </p>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Conflicts to resolve</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Decision notes or override reason"
          className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          rows={2}
        />
        <div className="mt-3 space-y-3">
          {contradictions.map((item) => {
            const id = String(item.contradiction_id || "");
            return (
              <article key={id} className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                <p className="text-sm font-semibold capitalize text-slate-950">
                  {formatLabel(String(item.severity))} · {formatLabel(String(item.contradiction_type))}
                </p>
                <p className="mt-1 text-sm text-slate-700">{String(item.proposed_resolution || "")}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[
                    ["resolved", "Select one position"],
                    ["preserve_both", "Preserve both positions"],
                    ["needs_research", "Request more research"],
                    ["challenge_path", "Challenge a path"],
                    ["revise_conclusion", "Revise a conclusion"],
                    ["immaterial", "Mark immaterial"],
                    ["escalated", "Escalate"],
                    ["reopen", "Reopen"],
                    ["accepted_risk", "Accept risk"],
                  ].map(([status, label]) => (
                    <button
                      key={status}
                      type="button"
                      disabled={busy}
                      onClick={() => onResolve(id, status, notes || undefined)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
          {!contradictions.length ? <p className="text-sm text-slate-500">No open conflicts.</p> : null}
        </div>
      </div>
    </section>
  );
}

function ReviewPanel({
  pendingGates,
  gateHistory,
  notes,
  gateNotes,
  setGateNotes,
  busy,
  onDecide,
}: {
  pendingGates: Array<Record<string, unknown>>;
  gateHistory: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  gateNotes: string;
  setGateNotes: (value: string) => void;
  busy: boolean;
  onDecide: (gateId: string, decision: string) => void;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Attorney review required</h2>
        <textarea
          value={gateNotes}
          onChange={(e) => setGateNotes(e.target.value)}
          placeholder="Decision notes or revision instructions"
          className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          rows={3}
        />
        <div className="mt-4 space-y-3">
          {pendingGates.map((gate) => (
            <article key={String(gate.gate_id)} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <p className="text-sm font-semibold text-slate-950">{gateTypeLabel(String(gate.gate_type))}</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{String(gate.prompt || "")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDecide(String(gate.gate_id), "approved")}
                  className="rounded-lg bg-[#4F46E5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#4338CA]"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDecide(String(gate.gate_id), "revision_requested")}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Request revision
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDecide(String(gate.gate_id), "rejected")}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-900"
                >
                  Reject
                </button>
              </div>
            </article>
          ))}
          {!pendingGates.length ? <p className="text-sm text-slate-500">No review decisions are waiting right now.</p> : null}
        </div>
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">Decision history</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {gateHistory.map((gate) => (
              <li key={String(gate.gate_id)} className="border-b border-slate-100 pb-2">
                <span className="font-medium text-slate-900">{gateTypeLabel(String(gate.gate_type))}</span>
                <span className="text-slate-500"> · {formatLabel(String(gate.status || gate.decision || "pending"))}</span>
                {gate.notes ? <p className="mt-1 text-xs text-slate-500">{String(gate.notes)}</p> : null}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">Attorney notes</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {notes.map((note) => (
              <li key={String(note.note_id)} className="rounded-lg border border-slate-200 px-3 py-2">
                <p>{String(note.text)}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {String(note.created_by)} · {String(note.created_at)}
                </p>
              </li>
            ))}
            {!notes.length ? <li className="text-slate-500">No notes recorded.</li> : null}
          </ul>
        </div>
      </div>
    </section>
  );
}

function gateTypeLabel(gateType: string): string {
  const map: Record<string, string> = {
    assignment_approval: "Assignment approval",
    research_plan_approval: "Research plan approval",
    factual_assumption_approval: "Factual assumption approval",
    high_risk_theory_approval: "High-risk theory approval",
    contradiction_resolution_approval: "Conflict resolution",
    draft_approval: "Draft approval",
    final_deliverable_approval: "Final work product approval",
  };
  return map[gateType] || formatLabel(gateType);
}

function DetailBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-3">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</h3>
      <pre className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{body}</pre>
    </div>
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function extractHeadings(markdown: string): string[] {
  return markdown
    .split("\n")
    .filter((line) => /^#{1,3}\s+/.test(line))
    .map((line) => line.replace(/^#+\s+/, "").trim())
    .slice(0, 20);
}

function layoutTree(nodes: LarsTreeNode[], rootId?: string) {
  const byId = new Map(nodes.map((n) => [n.node_id, n]));
  const root = rootId && byId.has(rootId) ? rootId : nodes[0]?.node_id;
  const positions = new Map<string, { x: number; y: number; node: LarsTreeNode }>();
  const edges: Array<{ from: string; to: string; x1: number; y1: number; x2: number; y2: number }> = [];
  if (!root) return { nodes: [], edges };

  const depthMap = new Map<string, number>();
  const queue = [root];
  depthMap.set(root, 0);
  while (queue.length) {
    const id = queue.shift()!;
    const node = byId.get(id);
    if (!node) continue;
    for (const child of node.child_ids) {
      if (!depthMap.has(child)) {
        depthMap.set(child, (depthMap.get(id) || 0) + 1);
        queue.push(child);
      }
    }
  }

  const levels = new Map<number, string[]>();
  for (const [id, depth] of depthMap) {
    const list = levels.get(depth) || [];
    list.push(id);
    levels.set(depth, list);
  }

  const colWidth = 220;
  const rowHeight = 100;
  for (const [depth, ids] of levels) {
    ids.forEach((id, index) => {
      const node = byId.get(id);
      if (!node) return;
      positions.set(id, {
        x: index * colWidth + 100,
        y: depth * rowHeight + 40,
        node,
      });
    });
  }

  for (const node of nodes) {
    const from = positions.get(node.node_id);
    if (!from) continue;
    for (const childId of node.child_ids) {
      const to = positions.get(childId);
      if (!to) continue;
      edges.push({
        from: node.node_id,
        to: childId,
        x1: from.x,
        y1: from.y + 28,
        x2: to.x,
        y2: to.y - 28,
      });
    }
  }

  return {
    nodes: [...positions.values()].map((item) => ({
      ...item.node,
      x: item.x,
      y: item.y,
    })),
    edges,
  };
}
