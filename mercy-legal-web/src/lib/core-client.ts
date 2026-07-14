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
  (process.env.MERCY_CORE_API_URL ||
    process.env.NEXT_PUBLIC_MERCY_CORE_API_URL ||
    DEFAULT_CORE_URL).replace(/\/+$/, "");

export type CoreHealth = {
  status: string;
  product: string;
  clerk_os_version: string;
};

export type CoreAuthContext = {
  token?: string | null;
  tenantId?: string | null;
  firmId?: string | null;
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

export type CoreVaultDocumentsEnvelope = {
  documents: CoreMatterDocument[];
  generated_at: string;
};

export type CoreVaultDocumentAttachEnvelope = {
  document: CoreMatterDocument;
  matter_id: string;
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
  matter_id?: string | null;
  document_id?: string | null;
};

export type CoreRetrievalSourceScope = "public_dc_sources" | "tenant_documents" | "mixed" | string;

export type CoreRetrievalReference = {
  chunk_id?: string | null;
  source_id?: string | null;
  source_type?: string | null;
  citation_label?: string | null;
  document_id?: string | null;
  matter_id?: string | null;
  verification_status?: string | null;
  combined_score?: number | null;
};

export type CoreRagEnvelope = {
  rag_version: string;
  query: string;
  results: CoreRagResult[];
  citations: CoreCitation[];
  source_scope?: CoreRetrievalSourceScope;
  source_refs?: CoreRetrievalReference[];
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
  persistence?: {
    retrieval_run_id?: string | null;
    reliability_snapshot_id?: string | null;
  };
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
  source_scope?: CoreRetrievalSourceScope | null;
  source_refs?: CoreRetrievalReference[];
  persistence?: {
    retrieval_run_id?: string | null;
    reliability_snapshot_id?: string | null;
  };
  retrieval?: {
    source_scope?: CoreRetrievalSourceScope | null;
    source_refs?: CoreRetrievalReference[];
    persistence?: {
      retrieval_run_id?: string | null;
      reliability_snapshot_id?: string | null;
    };
    metadata_filters?: Record<string, unknown>;
    verification?: Record<string, unknown>;
  };
  retrieval_warnings?: Array<Record<string, string>>;
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

export type CoreMicrosoftIdentityMapping = {
  id: string;
  microsoft_tenant_id: string;
  microsoft_object_id: string;
  email?: string | null;
  email_domain?: string | null;
  mercy_user_id: string;
  tenant_id: string;
  firm_id?: string | null;
  account_type: "firm" | "solo" | string;
  attorney_seat_limit: number;
  effective_scope_type: "firm" | "solo" | string;
  effective_scope_id: string;
  roles: string[];
  status: "pending" | "trialing" | "active" | "suspended" | "canceled" | string;
  created_at?: string | null;
  updated_at?: string | null;
  last_login_at?: string | null;
};

export type CoreMicrosoftIdentityMappingsEnvelope = {
  version: string;
  mappings: CoreMicrosoftIdentityMapping[];
};

export type CoreMicrosoftIdentityMappingEnvelope = {
  version: string;
  mapping: CoreMicrosoftIdentityMapping;
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
  if (!localDevDefaults) {
    return {};
  }
  return {
    token: window.localStorage.getItem("mercy.auth.token") || (localDevDefaults ? process.env.NEXT_PUBLIC_MERCY_API_TOKEN : undefined),
    tenantId:
      window.localStorage.getItem("mercy.auth.tenantId") ||
      (localDevDefaults ? process.env.NEXT_PUBLIC_MERCY_TENANT_ID || "local-dev-tenant" : undefined),
    firmId:
      window.localStorage.getItem("mercy.auth.firmId") ||
      (localDevDefaults ? process.env.NEXT_PUBLIC_MERCY_FIRM_ID : undefined),
    userId:
      window.localStorage.getItem("mercy.auth.userId") ||
      (localDevDefaults ? process.env.NEXT_PUBLIC_MERCY_USER_ID || "local-web-user" : undefined),
    roles: window.localStorage.getItem("mercy.auth.roles") || (localDevDefaults ? "attorney" : undefined),
  };
}

function coreRequestUrl(path: string): string {
  if (typeof window !== "undefined") {
    return `/api/core${path}`;
  }
  return `${MERCY_CORE_API_URL}${path}`;
}

function serverAuthContext(): CoreAuthContext {
  const localDevDefaults = localDevAuthDefaultsEnabled();
  return {
    token: process.env.MERCY_CORE_API_TOKEN || process.env.MERCY_API_TOKEN,
    tenantId: process.env.MERCY_TENANT_ID || process.env.NEXT_PUBLIC_MERCY_TENANT_ID || (localDevDefaults ? "local-dev-tenant" : undefined),
    firmId: process.env.MERCY_FIRM_ID || process.env.NEXT_PUBLIC_MERCY_FIRM_ID,
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
  if (context.firmId) {
    headers["X-Mercy-Firm-Id"] = context.firmId;
  }
  if (context.userId) {
    headers["X-Mercy-User-Id"] = context.userId;
  }
  if (context.roles) {
    headers["X-Mercy-Roles"] = context.roles;
  }
  return headers;
}

async function coreFetch<T>(
  path: string,
  init?: RequestInit,
  auth?: CoreAuthContext,
  options?: { timeoutMs?: number },
): Promise<CoreClientResult<T>> {
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 15000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(coreRequestUrl(path), {
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

export async function getCoreHealth(): Promise<CoreClientResult<CoreHealth>> {
  return coreFetch<CoreHealth>("/health");
}

export async function getMonitoringMetrics(auth?: CoreAuthContext): Promise<CoreClientResult<CoreMonitoringMetrics>> {
  return coreFetch<CoreMonitoringMetrics>("/v1/monitoring/metrics", undefined, auth);
}

export async function listMicrosoftIdentityMappings(auth?: CoreAuthContext): Promise<CoreClientResult<CoreMicrosoftIdentityMappingsEnvelope>> {
  return coreFetch<CoreMicrosoftIdentityMappingsEnvelope>("/v1/admin/microsoft-identity-mappings", undefined, auth);
}

export async function upsertMicrosoftIdentityMapping(payload: {
  microsoft_tenant_id: string;
  microsoft_object_id: string;
  email?: string;
  mercy_user_id: string;
  tenant_id: string;
  firm_id?: string;
  roles: string[];
  status: "pending" | "trialing" | "active" | "suspended" | "canceled";
  attorney_seat_limit?: number;
}, auth?: CoreAuthContext): Promise<CoreClientResult<CoreMicrosoftIdentityMappingEnvelope>> {
  return coreFetch<CoreMicrosoftIdentityMappingEnvelope>(
    "/v1/admin/microsoft-identity-mappings",
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

export async function updateMicrosoftIdentityMappingStatus(
  microsoftTenantId: string,
  microsoftObjectId: string,
  status: "pending" | "trialing" | "active" | "suspended" | "canceled",
  auth?: CoreAuthContext,
): Promise<CoreClientResult<CoreMicrosoftIdentityMappingEnvelope>> {
  return coreFetch<CoreMicrosoftIdentityMappingEnvelope>(
    `/v1/admin/microsoft-identity-mappings/${encodeURIComponent(microsoftTenantId)}/${encodeURIComponent(microsoftObjectId)}/status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    },
    auth,
  );
}

export async function getUserProfile(auth?: CoreAuthContext): Promise<CoreClientResult<CoreUserProfile>> {
  return coreFetch<CoreUserProfile>("/v1/user/profile", undefined, auth);
}

export type CoreUserProfileUpdate = Omit<Partial<CoreUserProfile>, "user_id" | "tenant_id" | "role">;

export async function updateUserProfile(payload: CoreUserProfileUpdate, auth?: CoreAuthContext): Promise<CoreClientResult<CoreUserProfile>> {
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

export async function listVaultDocuments(auth?: CoreAuthContext): Promise<CoreClientResult<CoreVaultDocumentsEnvelope>> {
  return coreFetch<CoreVaultDocumentsEnvelope>("/v1/vault/documents", undefined, auth);
}

export async function attachVaultDocumentToMatter(
  documentId: string,
  matterId: string,
  auth?: CoreAuthContext,
): Promise<CoreClientResult<CoreVaultDocumentAttachEnvelope>> {
  return coreFetch<CoreVaultDocumentAttachEnvelope>(
    `/v1/vault/documents/${encodeURIComponent(documentId)}/matter`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matter_id: matterId }),
    },
    auth,
  );
}

export function matterDocumentPreviewUrl(matterId: string, documentId: string): string {
  const path = `/v1/matters/${encodeURIComponent(matterId)}/documents/${encodeURIComponent(documentId)}/preview`;
  return coreRequestUrl(path);
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
  const hasDocumentScope = Boolean(payload.matter_context?.document_id || payload.matter_context?.attached_document_ids);
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
        ...payload,
        matter_context: {
          jurisdiction: "District of Columbia",
          authority_type: ["statute", "rule", "case", "regulation", "ethics_opinion", "court_rule"],
          include_vault_documents: Boolean(payload.matter_id || hasDocumentScope),
          include_private_documents: Boolean(payload.matter_id || hasDocumentScope),
          source_policy: "official_dc_sources_first",
          workflow_mode: "dc_research",
          ...(payload.matter_context ?? {}),
        },
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
  const hasDocumentScope = Boolean(payload.matter_context?.document_id || payload.matter_context?.attached_document_ids);
  const includeVaultDocuments = Boolean(payload.params?.include_vault_documents ?? payload.matter_id ?? hasDocumentScope);
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
        ...payload,
        matter_context: {
          jurisdiction: "District of Columbia",
          include_vault_documents: includeVaultDocuments,
          include_private_documents: includeVaultDocuments,
          ...(payload.matter_context ?? {}),
        },
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

/* ─── Mercy LARS / ALTS-MoE client ─────────────────────────────────────── */

export type LarsPhase =
  | "assignment"
  | "plan"
  | "research"
  | "synthesis"
  | "verification"
  | "attorney_review"
  | "complete";

export type LarsJobSummary = {
  job_id: string;
  status: string;
  matter_id?: string | null;
  query?: string;
  deliverable_type?: string;
  deadline?: string | null;
  research_depth?: string;
  jurisdiction?: string;
  created_at?: string;
  updated_at?: string;
  user_id?: string;
  phase?: string;
  pending_gates?: Array<Record<string, unknown>>;
  pending_review_count?: number;
  artifact_count?: number;
  budget_state?: {
    cost_usd_used?: number;
    max_cost_usd?: number;
    model_calls_used?: number;
    max_model_calls?: number;
  };
};

export type LarsTreeNode = {
  node_id: string;
  branch_id: string;
  parent_ids: string[];
  child_ids: string[];
  node_type: string;
  status: string;
  label: string;
  purpose?: string | null;
  hypothesis?: string | null;
  confidence: number;
  overall_score: number;
  has_contradictions: boolean;
  authority_count: number;
  retention_decision?: string;
  assigned_agents?: string[];
};

export type LarsArtifact = {
  artifact_id: string;
  kind: string;
  title: string;
  version?: number;
  versions?: Array<Record<string, unknown>>;
  review_status?: string;
  content_markdown?: string;
  created_at?: string;
  derived?: boolean;
  attorney_review_required?: boolean;
  authorities?: Array<Record<string, unknown>>;
  protection?: {
    manual_lock?: boolean;
    locked_by?: string;
    locked_at?: string;
    locked_content_markdown?: string;
    sections?: Record<string, Record<string, unknown>>;
  };
};

export type LarsJobPayload = {
  mode?: string;
  lars_version?: string;
  phase?: LarsPhase | string;
  phases?: string[];
  job?: {
    job_id: string;
    status: string;
    tenant_id?: string;
    user_id?: string;
    firm_id?: string | null;
    assignment?: Record<string, unknown>;
    root_node_id?: string;
    nodes?: Record<string, Record<string, unknown>>;
    gates?: Array<Record<string, unknown>>;
    events?: Array<Record<string, unknown>>;
    artifacts?: Array<Record<string, unknown>>;
    authorities?: Record<string, Record<string, unknown>>;
    contradictions?: Record<string, Record<string, unknown>>;
    budgets?: Record<string, unknown>;
    last_action?: string | null;
    last_error?: string | null;
    created_at?: string;
    updated_at?: string;
    completed_at?: string | null;
    metadata?: Record<string, unknown>;
  };
  controller?: Record<string, unknown>;
  tree?: {
    root_node_id?: string;
    node_count?: number;
    nodes?: LarsTreeNode[];
    active_branch_ids?: string[];
    retained_branch_ids?: string[];
    pruned_branch_ids?: string[];
  };
  artifacts_catalog?: LarsArtifact[];
  budget_snapshot?: Record<string, unknown>;
  timeline?: Array<{
    event_id?: string;
    event_type?: string;
    timestamp?: string;
    summary?: string;
    detail?: Record<string, unknown>;
  }>;
  pending_gates?: Array<Record<string, unknown>>;
  gate_history?: Array<Record<string, unknown>>;
  unresolved_contradictions?: Array<Record<string, unknown>>;
  authorities?: Array<Record<string, unknown>>;
  attorney_notes?: Array<Record<string, unknown>>;
  background_running?: boolean;
  depth_budget_profiles?: Record<string, Record<string, unknown>>;
  attorney_review_required?: boolean;
  store?: Record<string, unknown>;
  validation?: Record<string, unknown>;
  assignment?: Record<string, unknown>;
};

export type LarsAssignmentInput = {
  query: string;
  matter_id?: string;
  legal_questions?: string[];
  deliverable_type?: string;
  jurisdiction?: string;
  factual_assumptions?: string[];
  disputed_facts?: string[];
  selected_document_ids?: string[];
  research_depth?: "focused" | "standard" | "deep" | "custom" | string;
  deadline?: string;
  official_source_preference?: boolean;
  require_adverse_authority_review?: boolean;
  approval_checkpoints?: string[];
  require_research_plan_approval?: boolean;
  max_model_calls?: number;
  max_tool_calls?: number;
  max_duration_seconds?: number;
  max_cost_usd?: number;
  max_active_branches?: number;
  max_tree_depth?: number;
  auto_approve_assignment?: boolean;
  force_start?: boolean;
  surface_context?: string;
};

const LARS_TIMEOUT_MS = 60000;

export async function listLarsJobs(
  limit = 50,
  auth?: CoreAuthContext,
  options?: { matterId?: string; status?: string },
): Promise<CoreClientResult<{ jobs: LarsJobSummary[]; lars_version?: string }>> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (options?.matterId) params.set("matter_id", options.matterId);
  if (options?.status) params.set("status", options.status);
  return coreFetch(`/v1/lars/jobs?${params.toString()}`, undefined, auth);
}

export async function compileLarsAssignment(
  payload: LarsAssignmentInput,
  auth?: CoreAuthContext,
): Promise<CoreClientResult<LarsJobPayload>> {
  return coreFetch(
    "/v1/lars/assignments/compile",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surface_context: "web", ...payload }),
    },
    auth,
    { timeoutMs: LARS_TIMEOUT_MS },
  );
}

export async function createLarsJob(
  payload: LarsAssignmentInput,
  auth?: CoreAuthContext,
): Promise<CoreClientResult<LarsJobPayload>> {
  return coreFetch(
    "/v1/lars/jobs",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surface_context: "web", ...payload }),
    },
    auth,
    { timeoutMs: LARS_TIMEOUT_MS },
  );
}

export async function getLarsJob(jobId: string, auth?: CoreAuthContext): Promise<CoreClientResult<LarsJobPayload>> {
  return coreFetch(`/v1/lars/jobs/${encodeURIComponent(jobId)}`, undefined, auth, { timeoutMs: 30000 });
}

export async function pauseLarsJob(jobId: string, auth?: CoreAuthContext): Promise<CoreClientResult<LarsJobPayload>> {
  return coreFetch(
    `/v1/lars/jobs/${encodeURIComponent(jobId)}/pause`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    auth,
  );
}

export async function resumeLarsJob(
  jobId: string,
  maxSteps = 4,
  auth?: CoreAuthContext,
): Promise<CoreClientResult<LarsJobPayload>> {
  return coreFetch(
    `/v1/lars/jobs/${encodeURIComponent(jobId)}/resume`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ max_steps: maxSteps }),
    },
    auth,
    { timeoutMs: LARS_TIMEOUT_MS },
  );
}

export async function cancelLarsJob(jobId: string, auth?: CoreAuthContext): Promise<CoreClientResult<LarsJobPayload>> {
  return coreFetch(
    `/v1/lars/jobs/${encodeURIComponent(jobId)}/cancel`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    auth,
  );
}

export async function decideLarsGate(
  jobId: string,
  gateId: string,
  payload: { decision: string; notes?: string; continue_steps?: number },
  auth?: CoreAuthContext,
): Promise<CoreClientResult<LarsJobPayload>> {
  return coreFetch(
    `/v1/lars/jobs/${encodeURIComponent(jobId)}/gates/${encodeURIComponent(gateId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    auth,
    { timeoutMs: LARS_TIMEOUT_MS },
  );
}

export async function getLarsNode(
  jobId: string,
  nodeId: string,
  auth?: CoreAuthContext,
): Promise<CoreClientResult<Record<string, unknown>>> {
  return coreFetch(
    `/v1/lars/jobs/${encodeURIComponent(jobId)}/nodes/${encodeURIComponent(nodeId)}`,
    undefined,
    auth,
  );
}

export async function applyLarsNodeAction(
  jobId: string,
  nodeId: string,
  payload: { action: string; notes?: string },
  auth?: CoreAuthContext,
): Promise<CoreClientResult<LarsJobPayload>> {
  return coreFetch(
    `/v1/lars/jobs/${encodeURIComponent(jobId)}/nodes/${encodeURIComponent(nodeId)}/actions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    auth,
    { timeoutMs: LARS_TIMEOUT_MS },
  );
}

export async function resolveLarsContradiction(
  jobId: string,
  contradictionId: string,
  payload: { resolution_status: string; notes?: string; escalate?: boolean },
  auth?: CoreAuthContext,
): Promise<CoreClientResult<LarsJobPayload>> {
  return coreFetch(
    `/v1/lars/jobs/${encodeURIComponent(jobId)}/contradictions/${encodeURIComponent(contradictionId)}/resolve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    auth,
  );
}

export async function addLarsNote(
  jobId: string,
  payload: { text: string; node_id?: string },
  auth?: CoreAuthContext,
): Promise<CoreClientResult<LarsJobPayload>> {
  return coreFetch(
    `/v1/lars/jobs/${encodeURIComponent(jobId)}/notes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    auth,
  );
}

export async function getLarsEvents(
  jobId: string,
  sinceIndex = 0,
  auth?: CoreAuthContext,
): Promise<CoreClientResult<Record<string, unknown>>> {
  return coreFetch(
    `/v1/lars/jobs/${encodeURIComponent(jobId)}/events?since_index=${sinceIndex}&limit=100`,
    undefined,
    auth,
  );
}

export async function getLarsOfficeInsert(
  jobId: string,
  kind = "executive_summary",
  auth?: CoreAuthContext,
): Promise<CoreClientResult<Record<string, unknown>>> {
  return coreFetch(
    `/v1/lars/jobs/${encodeURIComponent(jobId)}/office-insert?kind=${encodeURIComponent(kind)}`,
    undefined,
    auth,
  );
}

export async function getLarsStatus(auth?: CoreAuthContext): Promise<CoreClientResult<Record<string, unknown>>> {
  return coreFetch("/v1/lars/status", undefined, auth);
}

export async function getLarsSourceUsage(
  jobId: string,
  auth?: CoreAuthContext,
): Promise<CoreClientResult<Record<string, unknown>>> {
  return coreFetch(`/v1/lars/jobs/${encodeURIComponent(jobId)}/sources`, undefined, auth);
}

export async function recoverLarsWorkers(
  auth?: CoreAuthContext,
): Promise<CoreClientResult<Record<string, unknown>>> {
  return coreFetch(
    "/v1/lars/workers/recover",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    auth,
  );
}

export async function protectLarsArtifact(
  jobId: string,
  artifactId: string,
  payload: { protected?: boolean; section_key?: string; notes?: string } = {},
  auth?: CoreAuthContext,
): Promise<CoreClientResult<LarsJobPayload>> {
  return coreFetch(
    `/v1/lars/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifactId)}/protect`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ protected: true, ...payload }),
    },
    auth,
    { timeoutMs: LARS_TIMEOUT_MS },
  );
}
