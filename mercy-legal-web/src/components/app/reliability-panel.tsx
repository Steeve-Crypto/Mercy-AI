"use client";

import { ExternalLink, Scale, ShieldCheck, TriangleAlert } from "lucide-react";
import type { CoreAgentEnvelope, CoreCitation, CoreRagEnvelope, CoreResponseEnvelope, CoreRouteDecision } from "@/lib/core-client";

type ReliabilityPanelProps = {
  envelope?: CoreResponseEnvelope | null;
  route?: CoreRouteDecision | null;
  agent?: CoreAgentEnvelope | null;
  rag?: CoreRagEnvelope | null;
  citations?: CoreCitation[] | null;
};

function pct(value?: number): string {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "Pending";
}

function pill(status?: string): string {
  if (status === "pass") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "block") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "warn") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function ReliabilityPanel({ envelope, route, agent, rag, citations }: ReliabilityPanelProps) {
  const activeEnvelope = envelope ?? agent?.response_envelope ?? rag?.response_envelope ?? null;
  const activeRoute = route ?? activeEnvelope?.route ?? agent?.route ?? rag?.route ?? null;
  const activeCitations = citations ?? activeEnvelope?.citations ?? agent?.citations ?? rag?.citations ?? [];
  const guardrailStatus = activeEnvelope?.guardrail_status ?? agent?.guardrail_status ?? rag?.guardrail_status ?? activeRoute?.guardrail_status;
  const confidence = activeEnvelope?.confidence_score ?? agent?.confidence_score ?? rag?.confidence_score ?? activeRoute?.confidence;
  const groundingStatus = agent?.grounding_policy?.status ?? rag?.verification?.status ?? guardrailStatus;
  const traceUrl = agent?.langsmith_project_url && agent.trace_id ? `${agent.langsmith_project_url}?trace_id=${agent.trace_id}` : null;
  const reviewRequired = activeEnvelope?.dc_ethics_metadata.human_review_required ?? agent?.human_review_required ?? rag?.human_review_required ?? true;
  const officialDcGrounding = activeCitations.some((citation) =>
    `${citation.source_type} ${citation.verification_status} ${citation.note}`.toLowerCase().includes("official"),
  );

  return (
    <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-[#EEF2FF] text-[#4F46E5]">
            <ShieldCheck className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Agent X Reliability</h2>
            <p className="text-xs text-slate-500">Hermes-powered MoE route, sources, guardrails</p>
          </div>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${pill(guardrailStatus)}`}>
          {guardrailStatus ?? "pending"}
        </span>
      </div>

      <dl className="mt-5 space-y-3 text-sm">
        <div className="rounded-lg bg-slate-50 p-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Agent X route / expert</dt>
          <dd className="mt-1 font-semibold text-slate-950">
            {activeRoute ? `${activeRoute.expert_label} / ${activeRoute.route_mode}` : "No route yet"}
          </dd>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Confidence</dt>
            <dd className="mt-1 font-semibold text-slate-950">{pct(confidence)}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Grounding</dt>
            <dd className="mt-1 font-semibold text-slate-950">{groundingStatus ?? "pending"}</dd>
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">D.C. grounding</dt>
          <dd className="mt-1 text-slate-700">
            {officialDcGrounding ? "Official D.C. source metadata returned" : "Source verification required before use"}
          </dd>
        </div>
        <div className="rounded-lg bg-[#F5F3FF] p-3">
          <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[#5B21B6]">
            <Scale className="size-3.5" />
            Attorney review
          </dt>
          <dd className="mt-1 font-semibold text-slate-950">
            {reviewRequired ? "Required before relying on this output" : "No review flag returned"}
          </dd>
        </div>
      </dl>

      {activeRoute?.missing_inputs?.length ? (
        <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          Missing inputs: {activeRoute.missing_inputs.join(", ")}
        </div>
      ) : null}

      <div className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Citations</h3>
        <div className="mt-2 space-y-2">
          {activeCitations.length ? (
            activeCitations.slice(0, 4).map((citation) => (
              <div key={`${citation.label}-${citation.verification_status}`} className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-950">{citation.label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {citation.source_type} / {citation.verification_status}. {citation.note}
                </p>
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">
              No citations returned yet. Ask Agent X or run D.C. research to populate this panel.
            </p>
          )}
        </div>
      </div>

      {traceUrl ? (
        <a
          href={traceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#4F46E5] hover:underline"
        >
          LangSmith trace
          <ExternalLink className="size-3" />
        </a>
      ) : null}
    </aside>
  );
}
