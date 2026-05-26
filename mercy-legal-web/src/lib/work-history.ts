import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getServerMercyAuthContext } from "@/lib/auth/session";
import type { WorkHistoryRecord, WorkHistorySourceType, WorkHistoryStatus, WorkHistoryWorkflowType } from "@/lib/work-history-types";

export type { WorkHistoryRecord, WorkHistorySourceType, WorkHistoryStatus, WorkHistoryWorkflowType } from "@/lib/work-history-types";

export type CreateWorkHistoryInput = {
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
  status?: WorkHistoryStatus;
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

export type ListWorkHistoryFilters = {
  matterId?: string | null;
  documentId?: string | null;
  workflowType?: WorkHistoryWorkflowType | null;
  savedOnly?: boolean;
  includeArchived?: boolean;
  limit?: number;
};

type WorkHistoryRow = {
  id: string;
  tenant_id: string;
  firm_id: string | null;
  user_id: string;
  user_email: string | null;
  matter_id: string | null;
  document_id: string | null;
  thread_id: string | null;
  session_id: string | null;
  source_type: WorkHistorySourceType;
  workflow_type: WorkHistoryWorkflowType;
  title: string;
  input_summary: string | null;
  request_text: string | null;
  output_summary: string | null;
  output_text: string | null;
  status: WorkHistoryStatus;
  reliability_snapshot: Record<string, unknown> | null;
  citations_snapshot: unknown[] | null;
  retrieval_run_id: string | null;
  reliability_snapshot_id: string | null;
  missing_inputs: unknown[] | null;
  trace_id: string | null;
  langsmith_url: string | null;
  hermes_memory_ref: string | null;
  moe_route: Record<string, unknown> | null;
  expert_name: string | null;
  created_at: string;
  updated_at: string;
  saved_at: string | null;
  archived_at: string | null;
};

function supabaseAdminConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabaseAdmin() {
  if (!supabaseAdminConfigured()) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function cleanString(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function truncate(value: unknown, max = 2000) {
  const text = cleanString(value);
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function getHistoryActor() {
  const auth = await getServerMercyAuthContext();
  if (!auth.tenantId || !auth.userId) return null;
  return {
    tenantId: auth.tenantId,
    firmId: auth.firmId ?? null,
    userId: auth.userId,
    userEmail: process.env.MERCY_USER_EMAIL ?? null,
  };
}

function mapRow(row: WorkHistoryRow): WorkHistoryRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    firmId: row.firm_id,
    userId: row.user_id,
    userEmail: row.user_email,
    matterId: row.matter_id,
    documentId: row.document_id,
    threadId: row.thread_id,
    sessionId: row.session_id,
    sourceType: row.source_type,
    workflowType: row.workflow_type,
    title: row.title,
    inputSummary: row.input_summary,
    requestText: row.request_text,
    outputSummary: row.output_summary,
    outputText: row.output_text,
    status: row.status,
    reliabilitySnapshot: row.reliability_snapshot ?? {},
    citationsSnapshot: Array.isArray(row.citations_snapshot) ? row.citations_snapshot : [],
    retrievalRunId: row.retrieval_run_id,
    reliabilitySnapshotId: row.reliability_snapshot_id,
    missingInputs: Array.isArray(row.missing_inputs) ? row.missing_inputs : [],
    traceId: row.trace_id,
    langsmithUrl: row.langsmith_url,
    hermesMemoryRef: row.hermes_memory_ref,
    moeRoute: row.moe_route,
    expertName: row.expert_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    savedAt: row.saved_at,
    archivedAt: row.archived_at,
  };
}

export async function createWorkHistory(input: CreateWorkHistoryInput): Promise<{ record: WorkHistoryRecord | null; configured: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { record: null, configured: false, error: "History storage is not configured." };

  const actor = await getHistoryActor();
  if (!actor) return { record: null, configured: true, error: "Authentication context is required." };

  const title = truncate(input.title, 180);
  if (!title) return { record: null, configured: true, error: "History title is required." };

  const payload = {
    tenant_id: actor.tenantId,
    firm_id: actor.firmId,
    user_id: actor.userId,
    user_email: actor.userEmail,
    matter_id: cleanString(input.matterId) || null,
    document_id: cleanString(input.documentId) || null,
    thread_id: cleanString(input.threadId) || null,
    session_id: cleanString(input.sessionId) || null,
    source_type: input.sourceType ?? "general",
    workflow_type: input.workflowType ?? "general",
    title,
    input_summary: truncate(input.inputSummary, 500),
    request_text: truncate(input.requestText, 8000),
    output_summary: truncate(input.outputSummary, 800),
    output_text: truncate(input.outputText, 20000),
    status: input.status ?? "completed",
    reliability_snapshot: input.reliabilitySnapshot ?? {},
    citations_snapshot: input.citationsSnapshot ?? [],
    retrieval_run_id: truncate(input.retrievalRunId, 128),
    reliability_snapshot_id: truncate(input.reliabilitySnapshotId, 128),
    missing_inputs: input.missingInputs ?? [],
    trace_id: truncate(input.traceId, 500),
    langsmith_url: truncate(input.langsmithUrl, 1000),
    hermes_memory_ref: truncate(input.hermesMemoryRef, 500),
    moe_route: input.moeRoute ?? null,
    expert_name: truncate(input.expertName, 250),
    saved_at: input.status === "saved" ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase
    .from("mercy_work_history")
    .insert(payload)
    .select("*")
    .single<WorkHistoryRow>();

  if (error) return { record: null, configured: true, error: error.message };
  return { record: mapRow(data), configured: true };
}

export async function listWorkHistory(filters: ListWorkHistoryFilters = {}): Promise<{ records: WorkHistoryRecord[]; configured: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { records: [], configured: false, error: "History storage is not configured." };

  const actor = await getHistoryActor();
  if (!actor) return { records: [], configured: true, error: "Authentication context is required." };

  let query = supabase
    .from("mercy_work_history")
    .select("*")
    .eq("tenant_id", actor.tenantId)
    .eq("user_id", actor.userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(filters.limit ?? 50, 1), 100));

  if (!filters.includeArchived) query = query.neq("status", "archived");
  if (filters.matterId) query = query.eq("matter_id", filters.matterId);
  if (filters.documentId) query = query.eq("document_id", filters.documentId);
  if (filters.workflowType) query = query.eq("workflow_type", filters.workflowType);
  if (filters.savedOnly) query = query.eq("status", "saved");

  const { data, error } = await query.returns<WorkHistoryRow[]>();
  if (error) return { records: [], configured: true, error: error.message };
  return { records: (data ?? []).map(mapRow), configured: true };
}

export async function getWorkHistoryItem(id: string): Promise<{ record: WorkHistoryRecord | null; configured: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { record: null, configured: false, error: "History storage is not configured." };

  const actor = await getHistoryActor();
  if (!actor) return { record: null, configured: true, error: "Authentication context is required." };

  const { data, error } = await supabase
    .from("mercy_work_history")
    .select("*")
    .eq("tenant_id", actor.tenantId)
    .eq("user_id", actor.userId)
    .eq("id", id)
    .single<WorkHistoryRow>();

  if (error) return { record: null, configured: true, error: error.message };
  return { record: mapRow(data), configured: true };
}

export async function setWorkHistorySaved(id: string, saved: boolean): Promise<{ record: WorkHistoryRecord | null; configured: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { record: null, configured: false, error: "History storage is not configured." };

  const actor = await getHistoryActor();
  if (!actor) return { record: null, configured: true, error: "Authentication context is required." };

  const { data, error } = await supabase
    .from("mercy_work_history")
    .update({
      status: saved ? "saved" : "completed",
      saved_at: saved ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", actor.tenantId)
    .eq("user_id", actor.userId)
    .eq("id", id)
    .select("*")
    .single<WorkHistoryRow>();

  if (error) return { record: null, configured: true, error: error.message };
  return { record: mapRow(data), configured: true };
}

export async function archiveWorkHistory(id: string): Promise<{ record: WorkHistoryRecord | null; configured: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { record: null, configured: false, error: "History storage is not configured." };

  const actor = await getHistoryActor();
  if (!actor) return { record: null, configured: true, error: "Authentication context is required." };

  const { data, error } = await supabase
    .from("mercy_work_history")
    .update({
      status: "archived",
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", actor.tenantId)
    .eq("user_id", actor.userId)
    .eq("id", id)
    .select("*")
    .single<WorkHistoryRow>();

  if (error) return { record: null, configured: true, error: error.message };
  return { record: mapRow(data), configured: true };
}
