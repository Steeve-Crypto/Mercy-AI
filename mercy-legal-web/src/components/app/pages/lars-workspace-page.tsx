"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { GitBranch, Loader2, Pause, Play, Scale, Square, TreePine } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { AlertBanner, Chip, EmptyState, Panel, WorkspaceFrame } from "@/components/ui/surface";
import {
  cancelLarsJob,
  createLarsJob,
  decideLarsGate,
  getLarsJob,
  listLarsJobs,
  pauseLarsJob,
  resumeLarsJob,
  runLarsJobSteps,
  type LarsJobEnvelope,
  type LarsJobSummary,
} from "@/lib/core-client";

function statusTone(status: string): "default" | "accent" | "success" | "warning" | "danger" | "info" {
  if (status === "completed") return "success";
  if (status === "failed" || status === "canceled" || status === "blocked") return "danger";
  if (status === "waiting_attorney" || status === "paused") return "warning";
  if (status === "running" || status === "verifying") return "info";
  return "default";
}

export function LarsWorkspacePage({ initialMatters }: { initialMatters: Array<{ matter_id: string; name: string }> }) {
  const [jobs, setJobs] = useState<LarsJobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LarsJobEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("Is a contractual limitation of liability enforceable under D.C. law for this matter?");
  const [matterId, setMatterId] = useState(initialMatters[0]?.matter_id ?? "");
  const [assumptions, setAssumptions] = useState("The clause appears in a signed consumer agreement.");
  const [deliverableType, setDeliverableType] = useState("research_memorandum");

  const refreshList = useCallback(async () => {
    const response = await listLarsJobs(50);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Unable to load LARS jobs.");
      return;
    }
    setJobs(response.data.jobs || []);
    setError(null);
  }, []);

  const refreshDetail = useCallback(async (jobId: string) => {
    const response = await getLarsJob(jobId);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Unable to load LARS job detail.");
      return;
    }
    setDetail(response.data);
    setError(null);
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (selectedJobId) void refreshDetail(selectedJobId);
  }, [refreshDetail, selectedJobId]);

  const jobRecord = detail?.job as Record<string, unknown> | undefined;
  const nodes = useMemo(() => {
    const raw = (jobRecord?.nodes || {}) as Record<string, Record<string, unknown>>;
    return Object.values(raw);
  }, [jobRecord]);
  const gates = useMemo(() => {
    return (detail?.pending_gates || (jobRecord?.gates as Array<Record<string, unknown>>) || []).filter(
      (gate) => String(gate.status || "") === "pending",
    );
  }, [detail?.pending_gates, jobRecord]);
  const artifacts = (jobRecord?.artifacts as Array<Record<string, unknown>>) || [];
  const controller = detail?.controller as Record<string, unknown> | undefined;

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const response = await createLarsJob({
      query,
      matter_id: matterId || undefined,
      factual_assumptions: assumptions
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      deliverable_type: deliverableType,
      jurisdiction: "District of Columbia",
      auto_approve_assignment: true,
      max_model_calls: 16,
    });
    setBusy(false);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Unable to create LARS job.");
      return;
    }
    if (response.data.mode === "clarification_required") {
      setError("Clarification required before LARS can start. Add matter context, facts, or documents.");
      return;
    }
    const jobId = String((response.data.job as Record<string, unknown>).job_id || "");
    setSelectedJobId(jobId);
    setDetail(response.data);
    await refreshList();
  }

  async function runAction(action: "steps" | "pause" | "resume" | "cancel") {
    if (!selectedJobId) return;
    setBusy(true);
    const response =
      action === "steps"
        ? await runLarsJobSteps(selectedJobId, 4)
        : action === "pause"
          ? await pauseLarsJob(selectedJobId)
          : action === "resume"
            ? await resumeLarsJob(selectedJobId, 4)
            : await cancelLarsJob(selectedJobId);
    setBusy(false);
    if (!response.ok || !response.data) {
      setError(response.error ?? "LARS action failed.");
      return;
    }
    setDetail(response.data);
    await refreshList();
  }

  async function onGate(gateId: string, decision: "approved" | "rejected") {
    if (!selectedJobId) return;
    setBusy(true);
    const response = await decideLarsGate(selectedJobId, gateId, decision);
    setBusy(false);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Gate decision failed.");
      return;
    }
    setDetail(response.data);
    await refreshList();
  }

  return (
    <>
      <PageHeader
        eyebrow="Mercy LARS · ALTS-MoE"
        title="Legal Autonomous Research System"
        description="Compile durable legal assignments, explore adaptive research trees, invoke the existing MoE experts, and keep attorney approval gates before any deliverable is treated as final."
      >
        <Chip tone="accent">ALTS chooses trajectory</Chip>
        <Chip tone="info">MoE chooses experts</Chip>
        <Chip>Attorney final control</Chip>
      </PageHeader>

      <WorkspaceFrame>
        {error ? <AlertBanner tone="warning">{error}</AlertBanner> : null}

        <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <Panel>
            <div className="flex items-center gap-2">
              <Scale className="size-4 text-[var(--mercy-gold-deep)]" />
              <h2 className="mercy-title text-lg">New assignment</h2>
            </div>
            <p className="mt-1 text-sm text-[var(--mercy-fg-muted)]">
              LARS validates scope, seeds hypotheses, and runs ALTS steps against the live MoE/agent network.
            </p>
            <form onSubmit={onCreate} className="mt-5 space-y-3">
              <label className="block text-sm font-medium text-[var(--mercy-fg-strong)]">
                Legal question / instructions
                <textarea
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="mt-1 min-h-28 w-full rounded-md border border-[var(--mercy-border-strong)] bg-[var(--mercy-card)] px-3 py-2 text-sm"
                  required
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-[var(--mercy-fg-strong)]">
                  Matter
                  <select
                    value={matterId}
                    onChange={(event) => setMatterId(event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-[var(--mercy-border-strong)] bg-[var(--mercy-card)] px-3 text-sm"
                  >
                    <option value="">No matter selected</option>
                    {initialMatters.map((matter) => (
                      <option key={matter.matter_id} value={matter.matter_id}>
                        {matter.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-[var(--mercy-fg-strong)]">
                  Deliverable
                  <select
                    value={deliverableType}
                    onChange={(event) => setDeliverableType(event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-[var(--mercy-border-strong)] bg-[var(--mercy-card)] px-3 text-sm"
                  >
                    <option value="research_memorandum">Research memorandum</option>
                    <option value="motion">Motion</option>
                    <option value="contract_review">Contract review</option>
                    <option value="risk_report">Risk report</option>
                    <option value="authority_table">Authority table</option>
                  </select>
                </label>
              </div>
              <label className="block text-sm font-medium text-[var(--mercy-fg-strong)]">
                Factual assumptions (one per line)
                <textarea
                  value={assumptions}
                  onChange={(event) => setAssumptions(event.target.value)}
                  className="mt-1 min-h-20 w-full rounded-md border border-[var(--mercy-border-strong)] bg-[var(--mercy-card)] px-3 py-2 text-sm"
                />
              </label>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <TreePine className="size-4" />}
                Start LARS job
              </Button>
            </form>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="mercy-title text-lg">Jobs</h2>
                <p className="mt-1 text-sm text-[var(--mercy-fg-muted)]">Tenant-scoped durable research assignments.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => void refreshList()} disabled={busy}>
                Refresh
              </Button>
            </div>
            <div className="mt-4 space-y-2">
              {jobs.length ? (
                jobs.map((job) => (
                  <button
                    key={job.job_id}
                    type="button"
                    onClick={() => setSelectedJobId(job.job_id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      selectedJobId === job.job_id
                        ? "border-[color-mix(in_srgb,var(--mercy-gold)_45%,var(--mercy-border))] bg-[var(--mercy-secondary)]"
                        : "border-[var(--mercy-border)] hover:bg-[var(--mercy-secondary)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[var(--mercy-fg-strong)]">{job.deliverable_type.replaceAll("_", " ")}</span>
                      <Chip tone={statusTone(job.status)}>{job.status}</Chip>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--mercy-fg-muted)]">{job.query}</p>
                  </button>
                ))
              ) : (
                <EmptyState
                  icon={<GitBranch className="size-5" />}
                  title="No LARS jobs yet"
                  description="Create an assignment to open an adaptive legal research tree."
                />
              )}
            </div>
          </Panel>
        </div>

        {detail && jobRecord ? (
          <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="mercy-title text-lg">Job {String(jobRecord.job_id)}</h2>
                  <p className="mt-1 text-sm text-[var(--mercy-fg-muted)]">
                    Status <Chip tone={statusTone(String(jobRecord.status))}>{String(jobRecord.status)}</Chip>
                    {controller?.recommended_action ? (
                      <span className="ml-2 text-xs">Next ALTS action: {String(controller.recommended_action)}</span>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void runAction("steps")}>
                    <Play className="size-4" /> Steps
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void runAction("pause")}>
                    <Pause className="size-4" /> Pause
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void runAction("resume")}>
                    <Play className="size-4" /> Resume
                  </Button>
                  <Button type="button" size="sm" variant="danger" disabled={busy} onClick={() => void runAction("cancel")}>
                    <Square className="size-4" /> Cancel
                  </Button>
                </div>
              </div>

              {gates.length ? (
                <div className="mt-5 space-y-3">
                  <h3 className="text-sm font-semibold text-[var(--mercy-fg-strong)]">Attorney gates</h3>
                  {gates.map((gate) => (
                    <div key={String(gate.gate_id)} className="rounded-lg border border-[var(--mercy-border)] bg-[var(--mercy-secondary)] p-3">
                      <p className="text-sm font-medium text-[var(--mercy-fg-strong)]">{String(gate.gate_type)}</p>
                      <p className="mt-1 text-xs text-[var(--mercy-fg-muted)]">{String(gate.prompt || "")}</p>
                      <div className="mt-3 flex gap-2">
                        <Button type="button" size="sm" disabled={busy} onClick={() => void onGate(String(gate.gate_id), "approved")}>
                          Approve
                        </Button>
                        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void onGate(String(gate.gate_id), "rejected")}>
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-5">
                <h3 className="text-sm font-semibold text-[var(--mercy-fg-strong)]">Tree nodes</h3>
                <div className="mt-3 max-h-96 space-y-2 overflow-auto">
                  {nodes.map((node) => (
                    <div key={String(node.node_id)} className="rounded-lg border border-[var(--mercy-border)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[var(--mercy-fg-strong)]">
                          {String(node.node_type)} · {String(node.status)}
                        </span>
                        <Chip tone="info">score {Number((node.evaluation as Record<string, unknown> | undefined)?.overall || 0).toFixed(2)}</Chip>
                      </div>
                      <p className="mt-1 text-xs text-[var(--mercy-fg-muted)]">
                        {String(node.research_question || node.hypothesis || node.decision_explanation || "No summary")}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--mercy-fg-muted)]">
                        agents: {(node.assigned_agents as string[] | undefined)?.join(", ") || "—"} · authorities:{" "}
                        {Array.isArray(node.authorities_found) ? node.authorities_found.length : 0}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            <div className="space-y-5">
              <Panel>
                <h3 className="mercy-title text-base">Artifacts</h3>
                {artifacts.length ? (
                  artifacts.map((artifact) => (
                    <div key={String(artifact.artifact_id)} className="mt-3 rounded-lg border border-[var(--mercy-border)] bg-[var(--mercy-secondary)] p-3">
                      <p className="text-sm font-semibold text-[var(--mercy-fg-strong)]">{String(artifact.title || artifact.deliverable_type)}</p>
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-5 text-[var(--mercy-fg-muted)]">
                        {String(artifact.content_markdown || "").slice(0, 4000)}
                      </pre>
                      <p className="mt-2 text-[11px] text-[var(--mercy-warning)]">Attorney review required before use.</p>
                    </div>
                  ))
                ) : (
                  <p className="mt-2 text-sm text-[var(--mercy-fg-muted)]">No final artifact yet. Continue steps or resolve gates.</p>
                )}
              </Panel>
              <Panel>
                <h3 className="mercy-title text-base">Controller snapshot</h3>
                <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-[var(--mercy-navy)] p-3 text-[11px] leading-5 text-white/85">
                  {JSON.stringify(controller || {}, null, 2)}
                </pre>
                <p className="mt-3 text-xs text-[var(--mercy-fg-muted)]">
                  Office add-ins can consume the same `/v1/lars/*` endpoints with the shared Mercy session model.
                </p>
                <Link href="/research" className="mt-3 inline-block text-xs font-semibold text-[var(--mercy-gold-deep)] hover:underline">
                  Open standard Research surface
                </Link>
              </Panel>
            </div>
          </div>
        ) : null}
      </WorkspaceFrame>
    </>
  );
}
