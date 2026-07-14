"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CoreAgentEnvelope, CoreCitation, CoreRagEnvelope, CoreResponseEnvelope, CoreRouteDecision } from "@/lib/core-client";

type ReliabilityPanelProps = {
  title?: string;
  envelope?: CoreResponseEnvelope | null;
  route?: CoreRouteDecision | null;
  citations?: CoreCitation[] | null;
  rag?: CoreRagEnvelope | null;
  agent?: CoreAgentEnvelope | null;
};

function statusVariant(status?: string): "secondary" | "risk" | "gold" | "outline" {
  if (status === "pass") return "secondary";
  if (status === "block") return "risk";
  if (status === "warn") return "gold";
  return "outline";
}

function statusMessage(status?: string, type: "guardrail" | "grounding" = "guardrail"): string {
  if (status === "pass") {
    return type === "grounding"
      ? "Grounded in verified official D.C. source metadata. Verify text and pinpoint support before use."
      : "No blocking guardrail issue. Attorney review is still mandatory.";
  }
  if (status === "block") {
    return type === "grounding"
      ? "Grounding is blocked. Add official D.C. sources or rerun retrieval before drafting."
      : "Guardrails blocked this output. Resolve the listed issue before relying on it.";
  }
  if (status === "warn") {
    return type === "grounding"
      ? "Grounding needs attorney verification. Treat citations as candidates until checked."
      : "Review warning present. Confirm facts, citations, and confidentiality before use.";
  }
  return type === "grounding" ? "Citation verification in progress." : "Reliability check pending.";
}

export function ReliabilityPanel({ title = "Reliability", envelope, route, citations, rag, agent }: ReliabilityPanelProps) {
  const activeRoute = route ?? envelope?.route ?? agent?.route ?? rag?.route;
  const activeEnvelope = envelope ?? agent?.response_envelope ?? rag?.response_envelope;
  const activeCitations = citations ?? activeEnvelope?.citations ?? agent?.citations ?? rag?.citations ?? [];
  const guardrailStatus = activeEnvelope?.guardrail_status ?? activeRoute?.guardrail_status ?? agent?.guardrail_status ?? rag?.guardrail_status;
  const confidence = activeEnvelope?.confidence_score ?? activeRoute?.confidence ?? agent?.confidence_score ?? rag?.confidence_score;
  const groundingStatus = agent?.grounding_policy?.status ?? rag?.verification?.status;
  const lowConfidence = typeof confidence === "number" && confidence < 0.72;
  const officialGrounding = activeCitations.some((citation) => citation.verification_status?.includes("official"));
  const reviewRequired = activeEnvelope?.dc_ethics_metadata.human_review_required ?? agent?.human_review_required ?? rag?.human_review_required ?? true;
  const langsmithUrl =
    agent?.langsmith_project_url && agent.trace_id ? `${agent.langsmith_project_url}?trace_id=${agent.trace_id}` : undefined;

  return (
    <div className="rounded-lg border bg-[var(--mercy-card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-mercy-navy">
          <ShieldCheck className="size-4 text-[#9b740e]" />
          {title}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={statusVariant(guardrailStatus)}>Guardrails {guardrailStatus ?? "pending"}</Badge>
          <Badge variant={statusVariant(groundingStatus)}>Grounding {groundingStatus ?? "pending"}</Badge>
          <Badge variant={officialGrounding ? "secondary" : "gold"}>
            {officialGrounding ? "Official D.C. sources" : "Source check needed"}
          </Badge>
          <Badge variant={reviewRequired ? "gold" : "secondary"}>{reviewRequired ? "Attorney review required" : "No review flag"}</Badge>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-md bg-secondary/70 p-3 text-[#34405a]">
          <p className="font-semibold text-mercy-navy">Guardrail action</p>
          <p className="mt-1 leading-5">{statusMessage(guardrailStatus, "guardrail")}</p>
        </div>
        <div className="rounded-md bg-secondary/70 p-3 text-[#34405a]">
          <p className="font-semibold text-mercy-navy">Grounding action</p>
          <p className="mt-1 leading-5">{statusMessage(groundingStatus, "grounding")}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <div>
          <span className="font-semibold text-mercy-navy">MoE route</span>
          <p className="mt-1">{activeRoute ? `${activeRoute.expert_label} / ${activeRoute.route_mode}` : "No route yet"}</p>
        </div>
        <div>
          <span className="font-semibold text-mercy-navy">Confidence</span>
          <p className="mt-1">{typeof confidence === "number" ? `${Math.round(confidence * 100)}%` : "Pending"}</p>
        </div>
        <div>
          <span className="font-semibold text-mercy-navy">Attorney review</span>
          <p className="mt-1">{activeEnvelope?.dc_ethics_metadata.human_review_required ?? true ? "Required before use" : "Not flagged"}</p>
        </div>
        <div>
          <span className="font-semibold text-mercy-navy">Matter snapshot</span>
          <p className="mt-1">{activeEnvelope?.matter_context_snapshot.hash ?? "Pending"}</p>
        </div>
        <div>
          <span className="font-semibold text-mercy-navy">Tenant isolation</span>
          <p className="mt-1">{activeEnvelope?.matter_context_snapshot.storage_mode ?? "Tenant-scoped request context"}</p>
        </div>
        <div>
          <span className="font-semibold text-mercy-navy">RAGAS signal</span>
          <p className="mt-1">{agent?.agent_result?.ragas_eval_hook ? "Evaluation hook available" : rag ? "Retrieval verification active" : "Pending"}</p>
        </div>
      </div>

      {lowConfidence ? (
        <div className="mt-3 flex gap-2 rounded-md bg-[#fff8e1] p-3 text-xs text-[#735b13]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>Low confidence route. Reframe the request with more matter facts or run research before drafting.</p>
        </div>
      ) : null}

      {activeRoute?.missing_inputs?.length ? (
        <div className="mt-3 flex gap-2 rounded-md bg-[#fff8e1] p-3 text-xs text-[#735b13]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>Missing input: {activeRoute.missing_inputs.join(", ")}. Resolve before relying on output.</p>
        </div>
      ) : null}

      {activeCitations.length ? (
        <div className="mt-3 space-y-2">
          {activeCitations.slice(0, 3).map((citation) => (
            <div key={`${citation.label}-${citation.verification_status}`} className="flex gap-2 rounded-md bg-secondary/70 p-2 text-xs">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[#9b740e]" />
              <div>
                <p className="font-medium text-mercy-navy">{citation.label}</p>
                <p className="mt-1 text-muted-foreground">
                  {citation.source_type} / {citation.verification_status}. {citation.note}
                </p>
                {typeof citation.provenance?.url === "string" ? (
                  <a
                    href={citation.provenance.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 font-medium text-mercy-navy underline-offset-4 hover:underline"
                  >
                    Official locator
                    <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {langsmithUrl ? (
        <a
          href={langsmithUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-mercy-navy underline-offset-4 hover:underline"
        >
          LangSmith trace
          <ExternalLink className="size-3" />
        </a>
      ) : null}
    </div>
  );
}
