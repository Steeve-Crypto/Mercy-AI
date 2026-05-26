export type WorkHistorySourceType =
  | "general"
  | "matter"
  | "document"
  | "research"
  | "drafting"
  | "review"
  | "citation_check"
  | "office";

export type WorkHistoryWorkflowType =
  | "general"
  | "drafting"
  | "review"
  | "research"
  | "citation_check"
  | "document_review"
  | "intake"
  | "template"
  | "other";

export type WorkHistoryStatus = "completed" | "failed" | "saved" | "archived";

export type WorkHistoryRecord = {
  id: string;
  tenantId: string;
  firmId: string | null;
  userId: string;
  userEmail: string | null;
  matterId: string | null;
  documentId: string | null;
  threadId: string | null;
  sessionId: string | null;
  sourceType: WorkHistorySourceType;
  workflowType: WorkHistoryWorkflowType;
  title: string;
  inputSummary: string | null;
  requestText: string | null;
  outputSummary: string | null;
  outputText: string | null;
  status: WorkHistoryStatus;
  reliabilitySnapshot: Record<string, unknown>;
  citationsSnapshot: unknown[];
  retrievalRunId: string | null;
  reliabilitySnapshotId: string | null;
  missingInputs: unknown[];
  traceId: string | null;
  langsmithUrl: string | null;
  hermesMemoryRef: string | null;
  moeRoute: Record<string, unknown> | null;
  expertName: string | null;
  createdAt: string;
  updatedAt: string;
  savedAt: string | null;
  archivedAt: string | null;
};
