/** Shared LARS / ALTS labels and helpers for Mercy product surfaces. */

export const LARS_FULL_NAME = "Legal Autonomous Research System";
export const ALTS_FULL_NAME = "Adaptive Legal Tree Search";

export const LARS_HELP =
  "LARS manages long-running legal assignments — lifecycle, approvals, budgets, work products, and delivery.";
export const ALTS_HELP =
  "ALTS manages structured exploration, challenge, contradiction, revision, synthesis, and verification within a LARS assignment.";

export const PHASES = [
  { id: "assignment", label: "Define" },
  { id: "plan", label: "Plan" },
  { id: "research", label: "Research" },
  { id: "synthesis", label: "Conclusions" },
  { id: "verification", label: "Source check" },
  { id: "attorney_review", label: "Your review" },
  { id: "complete", label: "Complete" },
] as const;

export const DELIVERABLES = [
  "research_memorandum",
  "motion",
  "brief",
  "contract_review",
  "chronology",
  "authority_table",
  "claims_evidence_matrix",
  "risk_report",
  "executive_summary",
  "source_appendix",
  "client_communication",
  "word_document",
  "presentation_summary",
] as const;

export const ACTION_LABELS: Record<string, string> = {
  EXPAND_WIDER: "Explore related issues",
  DEEPEN: "Research this issue further",
  CHALLENGE: "Test this conclusion",
  REVISE: "Revise this analysis",
  MERGE: "Combine research paths",
  PRUNE: "Remove from active analysis",
  VERIFY: "Check sources and citations",
  PAUSE_FOR_ATTORNEY: "Pause for your review",
  SYNTHESIZE: "Synthesize retained paths",
  COMPLETE: "Complete assignment path",
};

export const NODE_TYPE_LABELS: Record<string, string> = {
  root_assignment: "Assignment",
  issue: "Issue",
  hypothesis: "Working theory",
  research: "Research",
  evidence: "Evidence",
  contrary_authority: "Contrary authority",
  factual_dependency: "Fact dependency",
  contradiction: "Conflict",
  draft: "Draft",
  critique: "Critique",
  revision: "Revision",
  synthesis: "Conclusions",
  verification: "Source check",
  attorney_checkpoint: "Attorney review",
  final_artifact: "Final work product",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  queued: "Queued",
  running: "In progress",
  paused: "Paused",
  waiting_attorney: "Needs your review",
  verifying: "Checking sources",
  completed: "Completed",
  failed: "Failed",
  canceled: "Canceled",
  blocked: "Blocked",
  open: "Open",
  active: "Active",
  retained: "Kept",
  revised: "Revised",
  merged: "Combined",
  pruned: "Removed",
  challenged: "Under challenge",
  verified: "Verified",
  complete: "Complete",
};

export function formatLarsLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return STATUS_LABELS[value] || NODE_TYPE_LABELS[value] || ACTION_LABELS[value] || value.replace(/_/g, " ");
}

export function larsStatusTone(status: string | undefined): string {
  switch (status) {
    case "running":
    case "verifying":
    case "queued":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "waiting_attorney":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "paused":
      return "border-slate-200 bg-slate-100 text-slate-700";
    case "completed":
      return "border-[#C7D2FE] bg-[#EEF2FF] text-[#4338CA]";
    case "failed":
    case "canceled":
    case "blocked":
      return "border-red-200 bg-red-50 text-red-900";
    default:
      return "border-slate-200 bg-white text-slate-600";
  }
}

/**
 * Deep link to one LARS job's detail workspace.
 * - Primary: `/assignments/{jobId}` (detail only — no list/landing at `/assignments`)
 * - Optional Matter-nested: `/matters/{matterId}/assignments/{jobId}` when matterId is set
 * There is no `/lars` page.
 */
export function assignmentWorkspaceHref(jobId: string, matterId?: string | null): string {
  if (matterId && matterId.trim() && matterId.trim() !== "unassigned") {
    return `/matters/${encodeURIComponent(matterId.trim())}/assignments/${encodeURIComponent(jobId)}`;
  }
  return `/assignments/${encodeURIComponent(jobId)}`;
}

export function phaseLabel(phase: string | null | undefined): string {
  if (!phase) return "—";
  return PHASES.find((item) => item.id === phase)?.label || formatLarsLabel(phase);
}
