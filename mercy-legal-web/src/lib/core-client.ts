/*
Purpose: Typed client for the existing Mercy FastAPI Shared Intelligence Core.
This file is the Standalone Platform bridge for PD001: it lets the Next.js
dashboard read live core health, product capabilities, and matter state while
retaining explicit error states when the backend is not running.

Related source-of-truth files:
- specs/001-migrate-docs-spec/spec.md
- specs/001-migrate-docs-spec/plan.md
- specs/001-migrate-docs-spec/tasks.md#pd001
*/

const DEFAULT_CORE_URL = "http://127.0.0.1:8000";

export const MERCY_CORE_API_URL =
  process.env.MERCY_CORE_API_URL ||
  process.env.NEXT_PUBLIC_MERCY_CORE_API_URL ||
  DEFAULT_CORE_URL;

export type CoreHealth = {
  status: string;
  product: string;
  clerk_os_version: string;
};

export type CoreAuthContext = {
  token?: string | null;
  tenantId?: string | null;
  userId?: string | null;
  roles?: string | null;
};

export type CoreCapabilities = {
  product: string;
  core: string;
  positioning: string;
  windows: string[];
  router?: {
    version: string;
    experts: string[];
    endpoint: string;
    rag_endpoint: string;
    rag_status_endpoint?: string;
    rag_ingest_endpoint?: string;
    rag_eval_endpoint?: string;
    full_intake_endpoint?: string;
    agent_execute_endpoint?: string;
    agent_skills_endpoint?: string;
    retrieval_backbone: string;
    eval_backbone: string;
    agent_network: string;
  };
  observability?: {
    version: string;
    trace_endpoint: string;
    langsmith_project_env: string;
    langsmith_tracing_env: string;
  };
  tiers: Record<string, string[]>;
  security_posture: {
    mode: string;
    storage: string;
    training_use: string;
  };
  template_gallery?: {
    version: string;
    template_count: number;
    practice_areas: string[];
    endpoint: string;
    generation_endpoint: string;
    official_dc_grounding_required: boolean;
    attorney_review_required: boolean;
  };
  limited_beta?: CoreBetaStatus;
};

export type CoreMatter = {
  matter_id: string;
  name: string;
  client_id: string;
  client_name?: string | null;
  matter_type?: string | null;
  jurisdiction?: string;
  client_role?: string | null;
  opposing_parties?: string[];
  deadlines?: Array<Record<string, unknown>>;
  requested_relief?: string | null;
  key_facts?: Record<string, unknown>;
  documents?: Array<Record<string, unknown>>;
  sensitivity_flags?: string[];
  missing_information?: string[];
  history?: Array<Record<string, unknown>>;
  tier: string;
  created_at: string;
  last_updated?: string;
  facts: Record<string, unknown>;
  drafts: Array<Record<string, unknown>>;
  billing_events: Array<Record<string, unknown>>;
  route_history?: CoreRouteDecision[];
};

export type CoreMatterDocument = {
  document_id: string;
  filename: string;
  uploaded_at?: string;
  size?: number;
  mime_type?: string;
  type?: string;
  status?: "Processing..." | "Ready" | "Failed" | string;
  extraction_status?: "Processing..." | "Ready" | "Failed" | string;
  extraction_progress?: number;
  storage_path?: string;
  facts_extracted?: number;
  citation_count?: number;
  source?: string;
  [key: string]: unknown;
};

export type CoreMatterDocumentsEnvelope = {
  matter_id: string;
  documents: CoreMatterDocument[];
  generated_at: string;
};

export type CoreMatterDocumentDeleteEnvelope = {
  deleted: boolean;
  deleted_file: boolean;
  matter_id: string;
  document_id: string;
  documents: CoreMatterDocument[];
};

export type CoreMatterContext = CoreMatter;

export type CoreClientResult<T> = {
  ok: boolean;
  data: T | null;
  error: string | null;
};

export type CoreSnapshot = {
  coreUrl: string;
  online: boolean;
  health: CoreHealth | null;
  capabilities: CoreCapabilities | null;
  matters: CoreMatter[];
  error: string | null;
};

export type CoreCitation = {
  label: string;
  source_type: string;
  verification_status: string;
  note: string;
  provenance?: Record<string, unknown>;
};

export type CoreDcEthicsMetadata = {
  human_review_required: boolean;
  confidentiality_required: boolean;
  citation_verification_required: boolean;
  record_verification_required: boolean;
  fee_reasonableness_required: boolean;
  dc_bar_ethics_opinion: string;
  guardrail_status: "pass" | "warn" | "block";
  review_flags: string[];
  data_posture: string;
  training_use: string;
};

export type CoreMatterContextSnapshot = {
  reference: string | null;
  hash: string;
  storage_mode: string;
};

export type CoreRouteDecision = {
  router_version: string;
  route_mode: string;
  expert: string;
  expert_label: string;
  confidence: number;
  selected_capability: string;
  guardrail_status: string;
  guardrail_profile: {
    status: string;
    required_checks: string[];
    review_flags: string[];
  };
  citations: CoreCitation[];
  missing_inputs: string[];
  alternate_routes: Array<{
    expert: string;
    route_mode: string;
    confidence: number;
    reasons: string[];
  }>;
  fallback_path: string;
  surface_context: string;
  premium_gate: string;
  next_action: string;
  execute: boolean;
  user_type: string;
  safety_notes: string[];
  confidentiality: {
    mode: string;
    training_use: string;
    redaction_required_for_observability: boolean;
  };
};

export type CoreRagResult = {
  chunk_id: string;
  source_id: string;
  text: string;
  summary: string;
  combined_score: number;
  verification_status: string;
  citation?: CoreCitation;
  provenance?: Record<string, unknown>;
  entities?: string[];
  relationships?: Array<Record<string, string>>;
  practice_area?: string;
  source_date?: string;
};

export type CoreRagEnvelope = {
  rag_version: string;
  query: string;
  results: CoreRagResult[];
  citations: CoreCitation[];
  verification: {
    status: "pass" | "warn" | "block" | string;
    issues?: string[];
    human_review_required?: boolean;
    strict_citation_accuracy?: boolean;
  };
  backend_status?: Record<string, unknown>;
  graph_context?: {
    entities: string[];
    relationships: Array<Record<string, string>>;
  };
  metadata_filters?: Record<string, unknown>;
  answer_policy?: Record<string, unknown>;
  response_envelope: CoreResponseEnvelope;
  route: CoreRouteDecision;
  expert: string;
  confidence_score: number;
  guardrail_status: string;
  dc_ethics_metadata: CoreDcEthicsMetadata;
  matter_context_snapshot: CoreMatterContextSnapshot;
  audit_timestamp: string;
  human_review_required: boolean;
};

export type CoreAgentEnvelope = {
  agent_network_version: string;
  langgraph_runtime?: Record<string, unknown>;
  selected_agent: string;
  selected_expert: string;
  task: string;
  params?: Record<string, unknown>;
  agent_result?: Record<string, unknown>;
  mcp_skills_used?: string[];
  mcp_skill_results?: Array<Record<string, unknown>>;
  citations: CoreCitation[];
  grounding_policy?: {
    status: string;
    strict_grounding: boolean;
    no_unverified_output: boolean;
    issues: string[];
    instruction: string;
  };
  trace_id?: string;
  langsmith_project_url?: string;
  response_envelope: CoreResponseEnvelope;
  route: CoreRouteDecision;
  expert: string;
  confidence_score: number;
  guardrail_status: string;
  dc_ethics_metadata: CoreDcEthicsMetadata;
  matter_context_snapshot: CoreMatterContextSnapshot;
  audit_timestamp: string;
  human_review_required: boolean;
  beta?: {
    model_tier: "strong" | "fast" | string;
    quota: CoreBetaQuota;
    feedback_endpoint: string;
    attorney_review_required: boolean;
  };
};

export type CoreDiscoveryEnvelope = {
  workspace: string;
  engine: string;
  document_path?: string;
  facts?: Record<string, unknown>;
  citations: CoreCitation[];
  premium_billing_hook?: Record<string, unknown>;
  matter_id?: string;
  response_envelope: CoreResponseEnvelope;
  route: CoreRouteDecision;
  expert: string;
  confidence_score: number;
  guardrail_status: string;
  dc_ethics_metadata: CoreDcEthicsMetadata;
  matter_context_snapshot: CoreMatterContextSnapshot;
  audit_timestamp: string;
  human_review_required: boolean;
};

export type CoreRouterEnvelope = {
  response_envelope: CoreResponseEnvelope;
  route: CoreRouteDecision;
  expert: string;
  confidence: number;
  confidence_score: number;
  guardrail_status: string;
  citations: CoreCitation[];
  dc_ethics_metadata: CoreDcEthicsMetadata;
  matter_context_snapshot: CoreMatterContextSnapshot;
  audit_timestamp: string;
  human_review_required: boolean;
};

export type CoreResponseEnvelope = {
  envelope_version: string;
  route: CoreRouteDecision;
  expert: string;
  confidence_score: number;
  guardrail_status: "pass" | "warn" | "block";
  citations: CoreCitation[];
  dc_ethics_metadata: CoreDcEthicsMetadata;
  matter_context_snapshot: CoreMatterContextSnapshot;
  audit_timestamp: string;
};

export type CoreMatterIntakeEnvelope = {
  matter_context: CoreMatterContext;
  matter_id: string;
  updated: boolean;
  response_envelope: CoreResponseEnvelope;
  route: CoreRouteDecision;
  expert: string;
  confidence_score: number;
  guardrail_status: string;
  citations: CoreCitation[];
  dc_ethics_metadata: CoreDcEthicsMetadata;
  matter_context_snapshot: CoreMatterContextSnapshot;
  audit_timestamp: string;
  human_review_required: boolean;
};

export type CoreIntakeSummary = {
  version: string;
  matter_id: string;
  matter_name: string;
  client_name?: string | null;
  jurisdiction?: string | null;
  client_role?: string | null;
  requested_relief?: string | null;
  document_count: number;
  deadline_count: number;
  missing_information_count: number;
  conflict_status: string;
  scope_status: string;
  ready_for_attorney_review: boolean;
  last_updated?: string | null;
};

export type CoreFullMatterIntakeEnvelope = CoreMatterIntakeEnvelope & {
  intake_flow_version: string;
  intake_summary: CoreIntakeSummary;
  conflict_check: {
    status: string;
    checked: boolean;
    human_review_required: boolean;
    opposing_parties: string[];
    related_parties: string[];
    warnings: string[];
    notes?: string | null;
  };
  scope_confirmation: {
    status: string;
    scope_of_work?: string | null;
    excluded_work: string[];
    client_responsibilities: string[];
    attorney_approval_required: boolean;
    notes?: string | null;
  };
  prompt_library: {
    version: string;
    jurisdiction: string;
    prompts: Array<{
      name: string;
      version: string;
      system: string;
      user: string;
      required_fields: string[];
      ethics_note: string;
    }>;
  };
  next_steps: string[];
};

export type CoreTemplateGalleryItem = {
  template_id: string;
  title: string;
  description: string;
  practice_area: string;
  difficulty: "beginner" | "intermediate" | "advanced" | string;
  required_inputs: string[];
  prompt_template_id: string;
  prompt_template?: {
    template_id: string;
    version: string;
    title: string;
    task: string;
    grounding: string;
    attorney_review_required: boolean;
  };
  generation_task: string;
  matter_type: string;
  source_query: string;
  default_inputs?: Record<string, unknown>;
  ethics_tip: string;
  dc_grounding: {
    official_sources_only: boolean;
    seeded_knowledge_base: string;
    attorney_review_required: boolean;
  };
};

export type CoreTemplateGallery = {
  version: string;
  template_count: number;
  practice_areas: string[];
  endpoint: string;
  generation_endpoint: string;
  prompt_registry_version: string;
  official_dc_grounding_required: boolean;
  attorney_review_required: boolean;
  filters: {
    practice_area?: string | null;
    difficulty?: string | null;
    search?: string | null;
  };
  templates: CoreTemplateGalleryItem[];
  generated_at: string;
};

export type CoreBetaQuota = {
  strong_model_monthly_limit: number;
  strong_model_used: number;
  strong_model_remaining: number;
  fast_model_limit: string;
  fast_model_used: number;
  period: string;
  gentle_rate_limit: string;
};

export type CoreBetaStatus = {
  version: string;
  beta_mode: boolean;
  invite_only: boolean;
  access: "active" | "waitlist" | string;
  quota: CoreBetaQuota;
  legal_docs: {
    dpa: string;
    terms: string;
  };
  welcome_sequence: Array<{ subject: string; body: string }>;
  ethics_note: string;
};

export type CoreBetaAnalytics = {
  version: string;
  active_users: number;
  waitlist_count: number;
  invite_count: number;
  feedback: {
    count: number;
    thumbs_up: number;
    thumbs_down: number;
  };
  template_usage: Array<[string, number]>;
  guardrail_triggers: Record<string, number>;
  ragas_trends: {
    trace_count: number;
    recent_statuses: string[];
  };
  estimated_cost_usd: number;
  quota: {
    strong_model_monthly_limit: number;
    total_strong_used: number;
    fast_model_limit: string;
  };
  generated_at: string;
};

export type CoreMonitoringMetrics = {
  version?: string;
  generated_at?: string;
  beta?: Record<string, unknown>;
  costs?: Record<string, unknown>;
  ragas?: Record<string, unknown>;
  guardrails?: Record<string, unknown>;
  errors?: Record<string, unknown>;
  quotas?: Record<string, unknown>;
  alerts?: Record<string, unknown>;
  [key: string]: unknown;
};

export type CoreUserProfile = {
  user_id: string;
  tenant_id: string;
  name?: string | null;
  email?: string | null;
  firm_name?: string | null;
  dc_bar_number?: string | null;
  role?: string | null;
  preferences?: Record<string, unknown>;
  updated_at?: string | null;
};

export type CoreBillingInvoice = {
  invoice_id: string;
  number?: string | null;
  status: "paid" | "open" | "draft" | "void" | "uncollectible" | string;
  amount_due_usd: number;
  amount_paid_usd?: number;
  period_start?: string | null;
  period_end?: string | null;
  hosted_invoice_url?: string | null;
  pdf_url?: string | null;
  created_at?: string | null;
};

export type CoreBillingInvoicesEnvelope = {
  tenant_id: string;
  invoices: CoreBillingInvoice[];
  customer_portal_url?: string | null;
  generated_at?: string;
};

export type CoreFirmSeat = {
  user_id: string;
  name?: string | null;
  email: string;
  role: string;
  status: "active" | "invited" | "disabled" | string;
  last_active_at?: string | null;
};

export type CoreFirmSeatsEnvelope = {
  tenant_id: string;
  used: number;
  total: number;
  seats: CoreFirmSeat[];
  invite_endpoint?: string;
};

function localDevAuthDefaultsEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_MERCY_ENV === "local" ||
    process.env.NEXT_PUBLIC_MERCY_AUTH_MODE === "dev" ||
    process.env.MERCY_ENV === "local" ||
    process.env.MERCY_AUTH_MODE === "dev"
  );
}

function browserAuthContext(): CoreAuthContext {
  if (typeof window === "undefined") {
    return {};
  }

  const localDevDefaults = localDevAuthDefaultsEnabled();
  return {
    token: window.localStorage.getItem("mercy.auth.token") || (localDevDefaults ? process.env.NEXT_PUBLIC_MERCY_API_TOKEN : undefined),
    tenantId:
      window.localStorage.getItem("mercy.auth.tenantId") ||
      (localDevDefaults ? process.env.NEXT_PUBLIC_MERCY_TENANT_ID || "local-dev-tenant" : undefined),
    userId:
      window.localStorage.getItem("mercy.auth.userId") ||
      (localDevDefaults ? process.env.NEXT_PUBLIC_MERCY_USER_ID || "local-web-user" : undefined),
    roles: window.localStorage.getItem("mercy.auth.roles") || (localDevDefaults ? "attorney" : undefined),
  };
}

function serverAuthContext(): CoreAuthContext {
  const localDevDefaults = localDevAuthDefaultsEnabled();
  return {
    token: process.env.MERCY_CORE_API_TOKEN || process.env.MERCY_API_TOKEN,
    tenantId: process.env.MERCY_TENANT_ID || process.env.NEXT_PUBLIC_MERCY_TENANT_ID || (localDevDefaults ? "local-dev-tenant" : undefined),
    userId: process.env.MERCY_USER_ID || process.env.NEXT_PUBLIC_MERCY_USER_ID || (localDevDefaults ? "local-web-server" : undefined),
    roles: process.env.MERCY_ROLES || (localDevDefaults ? "attorney" : undefined),
  };
}

function authHeaders(auth?: CoreAuthContext): HeadersInit {
  const context = {
    ...(typeof window === "undefined" ? serverAuthContext() : browserAuthContext()),
    ...(auth ?? {}),
  };
  const headers: Record<string, string> = {};
  if (context.token) {
    headers.Authorization = `Bearer ${context.token}`;
  }
  if (context.tenantId) {
    headers["X-Mercy-Tenant-Id"] = context.tenantId;
  }
  if (context.userId) {
    headers["X-Mercy-User-Id"] = context.userId;
  }
  if (context.roles) {
    headers["X-Mercy-Roles"] = context.roles;
  }
  return headers;
}

async function coreFetch<T>(path: string, init?: RequestInit, auth?: CoreAuthContext): Promise<CoreClientResult<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${MERCY_CORE_API_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...authHeaders(auth),
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
    const data = (await response.json()) as T | { detail?: string };

    if (!response.ok) {
      const detail =
        typeof data === "object" && data !== null && "detail" in data && typeof data.detail === "string"
          ? data.detail
          : null;
      return {
        ok: false,
        data: null,
        error: detail ?? professionalError(response.status),
      };
    }

    return { ok: true, data: data as T, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Core request failed";
    return { ok: false, data: null, error: professionalNetworkError(message) };
  } finally {
    clearTimeout(timeout);
  }
}

function professionalError(status: number): string {
  if (status === 401 || status === 403) {
    return "Authentication or tenant access failed. Confirm your Mercy tenant and sign-in context, then retry.";
  }
  if (status === 404) {
    return "The requested matter or source was not found for this tenant.";
  }
  if (status >= 500) {
    return "Core service temporarily unavailable. Work is not saved until the live core confirms the request.";
  }
  return `Core request could not be completed (${status}). Review the request and retry.`;
}

function professionalNetworkError(message: string): string {
  if (/abort|timeout/i.test(message)) {
    return "Core service timed out. Retry once the local FastAPI core is responsive.";
  }
  if (/fetch|failed|network/i.test(message)) {
    return "Core service temporarily unavailable - working in offline review mode. Retry before relying on legal output.";
  }
  return message;
}

export async function getCoreSnapshot(auth?: CoreAuthContext): Promise<CoreSnapshot> {
  const [health, capabilities] = await Promise.all([
    coreFetch<CoreHealth>("/health", undefined, auth),
    coreFetch<CoreCapabilities>("/v1/product/capabilities", undefined, auth),
  ]);

  const matters = health.ok
    ? await coreFetch<CoreMatter[]>("/v1/matters", undefined, auth)
    : { ok: false, data: null, error: health.error };

  const firstError = health.error || capabilities.error || matters.error;

  return {
    coreUrl: MERCY_CORE_API_URL,
    online: Boolean(health.ok && health.data),
    health: health.data,
    capabilities: capabilities.data,
    matters: matters.data ?? [],
    error: firstError,
  };
}

export async function getTemplateGallery(filters?: {
  practice_area?: string;
  difficulty?: string;
  search?: string;
}, auth?: CoreAuthContext): Promise<CoreClientResult<CoreTemplateGallery>> {
  const params = new URLSearchParams();
  if (filters?.practice_area) params.set("practice_area", filters.practice_area);
  if (filters?.difficulty) params.set("difficulty", filters.difficulty);
  if (filters?.search) params.set("search", filters.search);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return coreFetch<CoreTemplateGallery>(`/v1/templates/gallery${suffix}`, undefined, auth);
}

export async function getBetaStatus(auth?: CoreAuthContext): Promise<CoreClientResult<CoreBetaStatus>> {
  return coreFetch<CoreBetaStatus>("/v1/beta/status", undefined, auth);
}

export async function getBetaAnalytics(auth?: CoreAuthContext): Promise<CoreClientResult<CoreBetaAnalytics>> {
  return coreFetch<CoreBetaAnalytics>("/v1/beta/analytics", undefined, auth);
}

export async function getMonitoringMetrics(auth?: CoreAuthContext): Promise<CoreClientResult<CoreMonitoringMetrics>> {
  return coreFetch<CoreMonitoringMetrics>("/v1/monitoring/metrics", undefined, auth);
}

export async function getUserProfile(auth?: CoreAuthContext): Promise<CoreClientResult<CoreUserProfile>> {
  return coreFetch<CoreUserProfile>("/v1/user/profile", undefined, auth);
}

export async function updateUserProfile(payload: Partial<CoreUserProfile>, auth?: CoreAuthContext): Promise<CoreClientResult<CoreUserProfile>> {
  return coreFetch<CoreUserProfile>(
    "/v1/user/profile",
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    auth,
  );
}

export async function listBillingInvoices(auth?: CoreAuthContext): Promise<CoreClientResult<CoreBillingInvoicesEnvelope>> {
  return coreFetch<CoreBillingInvoicesEnvelope>("/v1/billing/invoices", undefined, auth);
}

export async function getFirmSeats(auth?: CoreAuthContext): Promise<CoreClientResult<CoreFirmSeatsEnvelope>> {
  return coreFetch<CoreFirmSeatsEnvelope>("/v1/firm/seats", undefined, auth);
}

export async function inviteFirmSeat(payload: { email: string; role: string }, auth?: CoreAuthContext): Promise<CoreClientResult<CoreFirmSeatsEnvelope>> {
  return coreFetch<CoreFirmSeatsEnvelope>(
    "/v1/firm/seats/invite",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    auth,
  );
}

export async function submitBetaFeedback(payload: {
  rating: "up" | "down";
  comment?: string;
  action?: string;
  trace_id?: string;
  route_expert?: string;
  guardrail_status?: string;
  template_id?: string;
}, auth?: CoreAuthContext): Promise<CoreClientResult<{ status: string; feedback_id: string; thanks: string }>> {
  return coreFetch<{ status: string; feedback_id: string; thanks: string }>(
    "/v1/beta/feedback",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    auth,
  );
}

export async function getMatter(matterId: string, auth?: CoreAuthContext): Promise<CoreClientResult<CoreMatter>> {
  return coreFetch<CoreMatter>(`/v1/matters/${encodeURIComponent(matterId)}`, undefined, auth);
}

export async function listMatterDocuments(
  matterId: string,
  auth?: CoreAuthContext,
): Promise<CoreClientResult<CoreMatterDocumentsEnvelope>> {
  return coreFetch<CoreMatterDocumentsEnvelope>(`/v1/matters/${encodeURIComponent(matterId)}/documents`, undefined, auth);
}

export function matterDocumentPreviewUrl(matterId: string, documentId: string): string {
  return `${MERCY_CORE_API_URL}/v1/matters/${encodeURIComponent(matterId)}/documents/${encodeURIComponent(documentId)}/preview`;
}

export async function previewMatterDocument(matterId: string, documentId: string, auth?: CoreAuthContext): Promise<CoreClientResult<string>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(matterDocumentPreviewUrl(matterId, documentId), {
      headers: {
        ...authHeaders(auth),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, data: null, error: professionalError(response.status) };
    }
    const blob = await response.blob();
    return { ok: true, data: URL.createObjectURL(blob), error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Document preview failed";
    return { ok: false, data: null, error: professionalNetworkError(message) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function deleteMatterDocument(
  matterId: string,
  documentId: string,
  auth?: CoreAuthContext,
): Promise<CoreClientResult<CoreMatterDocumentDeleteEnvelope>> {
  return coreFetch<CoreMatterDocumentDeleteEnvelope>(
    `/v1/matters/${encodeURIComponent(matterId)}/documents/${encodeURIComponent(documentId)}`,
    { method: "DELETE" },
    auth,
  );
}

export async function listMatters(auth?: CoreAuthContext): Promise<CoreClientResult<CoreMatter[]>> {
  return coreFetch<CoreMatter[]>("/v1/matters", undefined, auth);
}

export async function createMatter(payload: {
  name: string;
  tier?: string;
  client_id?: string;
  client_name?: string;
  matter_type?: string;
}, auth?: CoreAuthContext): Promise<CoreClientResult<CoreMatter>> {
  return coreFetch<CoreMatter>(
    "/v1/matters",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tier: "free",
        ...payload,
      }),
    },
    auth,
  );
}

export async function routeLegalTask(payload: {
  query: string;
  matter_context?: Record<string, unknown>;
  user_type?: string;
  surface_context?: string;
  matter_id?: string;
  selected_text?: string;
  document_text?: string;
}, auth?: CoreAuthContext): Promise<CoreClientResult<CoreRouterEnvelope>> {
  return coreFetch<CoreRouterEnvelope>("/v1/router/inspect", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_type: "solo",
      surface_context: "mercy_legal_web",
      matter_context: {},
      ...payload,
    }),
  }, auth);
}

export async function submitMatterIntake(payload: {
  matter_id?: string;
  client_id?: string;
  client_name?: string;
  name?: string;
  matter_name?: string;
  matter_type?: string;
  tier?: string;
  jurisdiction?: string;
  client_role?: string;
  opposing_parties?: string[];
  deadlines?: Array<Record<string, unknown>>;
  key_facts?: Record<string, unknown>;
  documents?: Array<Record<string, unknown>>;
  history?: Array<Record<string, unknown>>;
  requested_relief?: string;
  sensitivity_flags?: string[];
  missing_information?: string[];
  surface_context?: string;
  user_type?: string;
}, auth?: CoreAuthContext): Promise<CoreClientResult<CoreMatterIntakeEnvelope>> {
  return coreFetch<CoreMatterIntakeEnvelope>("/v1/matter/intake", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_type: "solo",
      surface_context: "mercy_legal_web",
      ...payload,
    }),
  }, auth);
}

export async function submitFullMatterIntake(payload: {
  matter_id?: string;
  client?: Record<string, unknown>;
  matter?: Record<string, unknown>;
  facts?: Record<string, unknown>;
  documents?: Array<Record<string, unknown> | string>;
  deadlines?: Array<Record<string, unknown> | string>;
  conflicts?: Record<string, unknown>;
  scope?: Record<string, unknown>;
  consent?: Record<string, unknown>;
  key_facts?: Record<string, unknown>;
  requested_relief?: string;
  opposing_parties?: string[];
  sensitivity_flags?: string[];
  tier?: string;
  surface_context?: string;
  user_type?: string;
}, auth?: CoreAuthContext): Promise<CoreClientResult<CoreFullMatterIntakeEnvelope>> {
  return coreFetch<CoreFullMatterIntakeEnvelope>("/v1/matter/intake/full", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_type: "solo",
      surface_context: "mercy_legal_web",
      ...payload,
    }),
  }, auth);
}

export async function retrieveRag(payload: {
  query: string;
  matter_id?: string;
  matter_context?: Record<string, unknown>;
  top_k?: number;
  practice_area?: string;
  date_from?: string;
  date_to?: string;
  user_type?: string;
  surface_context?: string;
}, auth?: CoreAuthContext): Promise<CoreClientResult<CoreRagEnvelope>> {
  return coreFetch<CoreRagEnvelope>(
    "/v1/rag/retrieve",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        top_k: 5,
        user_type: "solo",
        surface_context: "mercy_legal_web",
        matter_context: {
          jurisdiction: "District of Columbia",
          authority_type: ["statute", "rule", "case", "regulation", "ethics_opinion", "court_rule"],
        },
        ...payload,
      }),
    },
    auth,
  );
}

export async function executeAgent(payload: {
  task: string;
  params?: Record<string, unknown>;
  matter_id?: string;
  matter_context?: Record<string, unknown>;
  user_type?: string;
  surface_context?: string;
}, auth?: CoreAuthContext): Promise<CoreClientResult<CoreAgentEnvelope>> {
  return coreFetch<CoreAgentEnvelope>(
    "/v1/agent/execute",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_type: "solo",
        surface_context: "mercy_legal_web",
        matter_context: {
          jurisdiction: "District of Columbia",
          ...(payload.matter_context ?? {}),
        },
        ...payload,
      }),
    },
    auth,
  );
}

export async function uploadDiscoveryDocument(payload: {
  file: File;
  matter_id?: string;
  document_text?: string;
}, auth?: CoreAuthContext): Promise<CoreClientResult<CoreDiscoveryEnvelope>> {
  const form = new FormData();
  form.append("file", payload.file);
  if (payload.matter_id) {
    form.append("matter_id", payload.matter_id);
  }
  if (payload.document_text) {
    form.append("document_text", payload.document_text);
  }
  return coreFetch<CoreDiscoveryEnvelope>(
    "/v1/workspace/discovery/upload",
    {
      method: "POST",
      body: form,
    },
    auth,
  );
}
