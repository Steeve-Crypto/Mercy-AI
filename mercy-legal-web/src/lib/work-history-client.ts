import type { WorkHistoryRecord, WorkHistorySourceType, WorkHistoryWorkflowType } from "@/lib/work-history-types";

export type CreateWorkHistoryClientInput = {
  matterId?: string | null;
  documentId?: string | null;
  threadId?: string | null;
  sessionId?: string | null;
  sourceType?: WorkHistorySourceType;
  workflowType?: WorkHistoryWorkflowType;
  title: string;
  inputSummary?: string | null;
  requestText?: string | null;
  outputSummary?: string | null;
  outputText?: string | null;
  status?: "completed" | "failed" | "saved" | "archived";
  reliabilitySnapshot?: Record<string, unknown> | null;
  citationsSnapshot?: unknown[] | null;
  retrievalRunId?: string | null;
  reliabilitySnapshotId?: string | null;
  missingInputs?: unknown[] | null;
  traceId?: string | null;
  langsmithUrl?: string | null;
  hermesMemoryRef?: string | null;
  moeRoute?: Record<string, unknown> | null;
  expertName?: string | null;
};

export function workflowTypeFromMode(mode: string): WorkHistoryWorkflowType {
  if (mode === "drafting") return "drafting";
  if (mode === "analysis" || mode === "compliance") return "review";
  if (mode === "dc_research") return "research";
  if (mode === "citation_verification") return "citation_check";
  if (mode === "template_generation") return "template";
  if (mode === "intake") return "intake";
  return "general";
}

export function sourceTypeForRun(mode: string, matterId?: string | null, documentId?: string | null): WorkHistorySourceType {
  if (documentId) return "document";
  if (mode === "dc_research") return "research";
  if (mode === "drafting" || mode === "template_generation") return "drafting";
  if (mode === "analysis" || mode === "compliance") return "review";
  if (mode === "citation_verification") return "citation_check";
  if (matterId) return "matter";
  return "general";
}

export async function listWorkHistoryClient(params: {
  matterId?: string | null;
  documentId?: string | null;
  workflowType?: WorkHistoryWorkflowType | null;
  savedOnly?: boolean;
  limit?: number;
} = {}) {
  const search = new URLSearchParams();
  if (params.matterId) search.set("matter_id", params.matterId);
  if (params.documentId) search.set("document_id", params.documentId);
  if (params.workflowType) search.set("workflow_type", params.workflowType);
  if (params.savedOnly) search.set("saved", "true");
  if (params.limit) search.set("limit", String(params.limit));

  const query = search.toString();
  const response = await fetch(`/api/work-history${query ? `?${query}` : ""}`, {
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Could not load work history.");
  return data as { records: WorkHistoryRecord[]; configured: boolean };
}

export async function createWorkHistoryClient(input: CreateWorkHistoryClientInput) {
  const response = await fetch("/api/work-history", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Could not save work history.");
  return data as { record: WorkHistoryRecord | null; configured: boolean; saved: boolean };
}

export async function setWorkHistorySavedClient(id: string, saved: boolean) {
  const response = await fetch(`/api/work-history/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ saved }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Could not update saved output.");
  return data as { record: WorkHistoryRecord | null; configured: boolean };
}
