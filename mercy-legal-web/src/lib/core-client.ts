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

function browserAuthContext(): CoreAuthContext {
  if (typeof window === "undefined") {
    return {};
  }

  return {
    token: window.localStorage.getItem("mercy.auth.token") || process.env.NEXT_PUBLIC_MERCY_API_TOKEN,
    tenantId:
      window.localStorage.getItem("mercy.auth.tenantId") ||
      process.env.NEXT_PUBLIC_MERCY_TENANT_ID ||
      "local-dev-tenant",
    userId:
      window.localStorage.getItem("mercy.auth.userId") ||
      process.env.NEXT_PUBLIC_MERCY_USER_ID ||
      "local-web-user",
    roles: window.localStorage.getItem("mercy.auth.roles") || "attorney",
  };
}

function serverAuthContext(): CoreAuthContext {
  return {
    token: process.env.MERCY_CORE_API_TOKEN || process.env.MERCY_API_TOKEN,
    tenantId: process.env.MERCY_TENANT_ID || process.env.NEXT_PUBLIC_MERCY_TENANT_ID || "local-dev-tenant",
    userId: process.env.MERCY_USER_ID || process.env.NEXT_PUBLIC_MERCY_USER_ID || "local-web-server",
    roles: process.env.MERCY_ROLES || "attorney",
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
  const timeout = setTimeout(() => controller.abort(), 2500);

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

export async function getCoreSnapshot(): Promise<CoreSnapshot> {
  const [health, capabilities] = await Promise.all([
    coreFetch<CoreHealth>("/health"),
    coreFetch<CoreCapabilities>("/v1/product/capabilities"),
  ]);

  const matters = health.ok
    ? await coreFetch<CoreMatter[]>("/v1/matters")
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

export async function getMatter(matterId: string, auth?: CoreAuthContext): Promise<CoreClientResult<CoreMatter>> {
  return coreFetch<CoreMatter>(`/v1/matters/${encodeURIComponent(matterId)}`, undefined, auth);
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
