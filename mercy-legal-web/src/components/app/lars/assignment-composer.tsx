"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { CoreMatter } from "@/lib/core-client";
import {
  compileLarsAssignment,
  createLarsJob,
  type LarsAssignmentInput,
  type LarsJobPayload,
} from "@/lib/core-client";
import {
  ALTS_FULL_NAME,
  ALTS_HELP,
  DELIVERABLES,
  LARS_FULL_NAME,
  LARS_HELP,
  assignmentWorkspaceHref,
  formatLarsLabel,
} from "@/lib/lars-labels";
import { cn } from "@/lib/utils";

export type AssignmentComposerProps = {
  matters: CoreMatter[];
  initialMatterId?: string;
  initialQuery?: string;
  initialJurisdiction?: string;
  initialLegalQuestions?: string;
  initialAssumptions?: string;
  initialDeliverable?: string;
  initialDocumentIds?: string[];
  initialDepth?: "focused" | "standard" | "deep" | "custom";
  surfaceContext?: string;
  compact?: boolean;
  title?: string;
  description?: string;
  onStarted?: (payload: LarsJobPayload) => void;
  onCancel?: () => void;
  showTerminologyIntro?: boolean;
};

type DepthMode = "focused" | "standard" | "deep" | "custom";

export function AssignmentComposer({
  matters,
  initialMatterId = "",
  initialQuery = "",
  initialJurisdiction = "District of Columbia",
  initialLegalQuestions = "",
  initialAssumptions = "",
  initialDeliverable = "research_memorandum",
  initialDocumentIds = [],
  initialDepth = "standard",
  surfaceContext = "web",
  compact = false,
  title = "Start a legal assignment",
  description = "Describe the work, connect it to a matter, and choose the work product you need.",
  onStarted,
  onCancel,
  showTerminologyIntro = true,
}: AssignmentComposerProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [matterId, setMatterId] = useState(initialMatterId || matters[0]?.matter_id || "");
  const [jurisdiction, setJurisdiction] = useState(initialJurisdiction);
  const [legalQuestions, setLegalQuestions] = useState(initialLegalQuestions);
  const [deliverable, setDeliverable] = useState(initialDeliverable);
  const [deadline, setDeadline] = useState("");
  const [assumptions, setAssumptions] = useState(initialAssumptions);
  const [depth, setDepth] = useState<DepthMode>(initialDepth);
  const [requirePlanApproval, setRequirePlanApproval] = useState(true);
  const [autoApprove, setAutoApprove] = useState(false);
  const [maxModelCalls, setMaxModelCalls] = useState(40);
  const [maxCost, setMaxCost] = useState(5);
  const [requireAdverse, setRequireAdverse] = useState(true);
  const [officialSources, setOfficialSources] = useState(true);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>(initialDocumentIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<LarsJobPayload | null>(null);

  const activeMatter = useMemo(
    () => matters.find((matter) => matter.matter_id === matterId) ?? null,
    [matters, matterId],
  );
  const matterDocuments = activeMatter?.documents ?? [];

  function buildPayload(): LarsAssignmentInput {
    const questions = legalQuestions
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return {
      query,
      matter_id: matterId || undefined,
      jurisdiction,
      legal_questions: questions.length ? questions : undefined,
      deliverable_type: deliverable,
      deadline: deadline || undefined,
      factual_assumptions: assumptions
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      selected_document_ids: selectedDocIds.length ? selectedDocIds : undefined,
      research_depth: depth,
      require_research_plan_approval: requirePlanApproval,
      official_source_preference: officialSources,
      require_adverse_authority_review: requireAdverse,
      max_model_calls: depth === "custom" ? maxModelCalls : undefined,
      max_cost_usd: depth === "custom" ? maxCost : undefined,
      surface_context: surfaceContext,
    };
  }

  async function handleCompile(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    const result = await compileLarsAssignment(buildPayload());
    setBusy(false);
    if (!result.ok || !result.data) {
      setError(result.error || "Could not prepare the assignment preview.");
      return;
    }
    setPreview(result.data);
  }

  async function handleCreate(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    const result = await createLarsJob({
      ...buildPayload(),
      auto_approve_assignment: autoApprove,
    });
    setBusy(false);
    if (!result.ok || !result.data) {
      setError(result.error || "Could not start this assignment.");
      return;
    }
    if (result.data.mode === "clarification_required") {
      setPreview(result.data);
      setError("Please add the missing details before starting.");
      return;
    }
    const jobId = result.data.job?.job_id;
    const startedMatterId =
      matterId ||
      (result.data.job?.assignment && typeof result.data.job.assignment === "object"
        ? String((result.data.job.assignment as Record<string, unknown>).matter_id || "")
        : "") ||
      null;
    onStarted?.(result.data);
    if (jobId) {
      router.push(assignmentWorkspaceHref(jobId, startedMatterId) as never);
    }
  }

  function toggleDoc(docId: string) {
    setSelectedDocIds((current) =>
      current.includes(docId) ? current.filter((id) => id !== docId) : [...current, docId],
    );
  }

  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", compact ? "p-4" : "p-5")}>
      <div className={cn("mb-4", compact ? "" : "border-b border-slate-200 pb-4")}>
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
        {showTerminologyIntro ? (
          <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-600 sm:grid-cols-2">
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" title={LARS_HELP}>
              <span className="font-semibold text-slate-900">
                {LARS_FULL_NAME} (LARS)
              </span>
              {" — "}
              {LARS_HELP}
            </p>
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" title={ALTS_HELP}>
              <span className="font-semibold text-slate-900">
                {ALTS_FULL_NAME} (ALTS)
              </span>
              {" — "}
              {ALTS_HELP}
            </p>
          </div>
        ) : null}
      </div>

      <form className="grid gap-4 lg:grid-cols-2" onSubmit={(e) => void handleCreate(e)}>
        <label className="block space-y-1.5 lg:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            What do you need Mercy to do?
          </span>
          <textarea
            required
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={compact ? 3 : 4}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-[#4F46E5] focus:ring-2"
            placeholder="Research whether this limitation of liability is enforceable under D.C. consumer protection law…"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Matter</span>
          <select
            value={matterId}
            onChange={(e) => setMatterId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
          >
            <option value="">No matter selected</option>
            {matters.map((matter) => (
              <option key={matter.matter_id} value={matter.matter_id}>
                {matter.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Jurisdiction</span>
          <input
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Questions Mercy should address
          </span>
          <textarea
            value={legalQuestions}
            onChange={(e) => setLegalQuestions(e.target.value)}
            rows={3}
            placeholder="One question per line"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Facts and assumptions
          </span>
          <textarea
            value={assumptions}
            onChange={(e) => setAssumptions(e.target.value)}
            rows={3}
            placeholder="One fact or assumption per line"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Required work product</span>
          <select
            value={deliverable}
            onChange={(e) => setDeliverable(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
          >
            {DELIVERABLES.map((item) => (
              <option key={item} value={item}>
                {formatLarsLabel(item)}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Deadline</span>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
          />
        </label>

        <fieldset className="lg:col-span-2">
          <legend className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Research depth</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-4">
            {(["focused", "standard", "deep", "custom"] as DepthMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDepth(mode)}
                className={cn(
                  "rounded-lg border px-3 py-3 text-left text-sm capitalize",
                  depth === mode
                    ? "border-[#A5B4FC] bg-[#EEF2FF] text-[#4338CA]"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                )}
              >
                <span className="font-semibold">{mode}</span>
                <span className="mt-1 block text-xs text-slate-500">
                  {mode === "focused" && "Narrow scope, quicker turnaround"}
                  {mode === "standard" && "Balanced research for most matters"}
                  {mode === "deep" && "Broader research for complex issues"}
                  {mode === "custom" && "Set your own research limits"}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        {depth === "custom" ? (
          <>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Research step limit
              </span>
              <input
                type="number"
                min={1}
                value={maxModelCalls}
                onChange={(e) => setMaxModelCalls(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Cost limit (USD)</span>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={maxCost}
                onChange={(e) => setMaxCost(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
              />
            </label>
          </>
        ) : null}

        {matterDocuments.length ? (
          <fieldset className="lg:col-span-2">
            <legend className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Source selection (Vault)
            </legend>
            <p className="mt-1 text-xs text-slate-500">
              Leave all unchecked to use the entire matter Vault plus official D.C. sources when preferred.
            </p>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {matterDocuments.map((document, index) => {
                const id = String(
                  document.document_id ?? document.id ?? document.filename ?? document.title ?? `doc-${index}`,
                );
                const name = String(document.title ?? document.name ?? document.filename ?? id);
                return (
                  <label key={id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                    <input type="checkbox" checked={selectedDocIds.includes(id)} onChange={() => toggleDoc(id)} />
                    <span className="truncate">{name}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={officialSources} onChange={(e) => setOfficialSources(e.target.checked)} />
          Prefer official D.C. sources
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={requireAdverse} onChange={(e) => setRequireAdverse(e.target.checked)} />
          Require adverse authority review
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={requirePlanApproval}
            onChange={(e) => setRequirePlanApproval(e.target.checked)}
          />
          Require approval of the research plan before deep work
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} />
          Start without a separate assignment approval step
        </label>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 lg:col-span-2" role="alert">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 lg:col-span-2">
          <button
            type="button"
            disabled={busy || !query.trim()}
            onClick={() => void handleCompile()}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Preview assignment
          </button>
          <button
            type="submit"
            disabled={busy || !query.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#4338CA] disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ? "Working…" : "Start assignment"}
          </button>
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      {preview?.assignment ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-950">Compiled assignment preview</h3>
          <dl className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Request</dt>
              <dd className="mt-1">{String((preview.assignment as Record<string, unknown>).query || "")}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Work product</dt>
              <dd className="mt-1 capitalize">
                {formatLarsLabel(String((preview.assignment as Record<string, unknown>).deliverable_type || ""))}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Jurisdiction</dt>
              <dd className="mt-1">{String((preview.assignment as Record<string, unknown>).jurisdiction || "")}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Research depth</dt>
              <dd className="mt-1 capitalize">
                {String((preview.assignment as Record<string, unknown>).research_depth || "standard")}
              </dd>
            </div>
          </dl>
          {preview.validation ? (
            <p className="mt-3 text-xs text-slate-500">
              {(preview.validation as Record<string, unknown>).valid
                ? "Ready to start."
                : `Needs attention: ${JSON.stringify((preview.validation as Record<string, unknown>).errors || [])}`}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
