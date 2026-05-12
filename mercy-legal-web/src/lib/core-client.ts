/*
Purpose: Typed client for the existing Mercy FastAPI Shared Intelligence Core.
This file is the Standalone Platform bridge for PD001: it lets the Next.js
dashboard read live core health, product capabilities, and matter state while
retaining a clear local/demo fallback when the backend is not running.

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

export type CoreCapabilities = {
  product: string;
  core: string;
  positioning: string;
  windows: string[];
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
  router: CoreRouterEnvelope | null;
  intake: CoreFullMatterIntakeEnvelope | null;
  demoMatterContext: CoreMatterContext;
  demoIntakeSummary: CoreIntakeSummary;
  usingDemoContext: boolean;
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

const DASHBOARD_DEMO_MATTER_CONTEXT: CoreMatterContext = {
  matter_id: "demo-only-shaw-lease-review",
  name: "Shaw lease amendment review",
  client_id: "demo-only-client",
  client_name: "Demo commercial tenant",
  matter_type: "commercial lease review",
  jurisdiction: "District of Columbia",
  client_role: "tenant",
  opposing_parties: ["Demo landlord"],
  deadlines: [
    {
      label: "Demo client review target",
      date: "2026-05-20",
      source: "local_dashboard_demo",
    },
  ],
  requested_relief: "Narrow indemnity language and preserve D.C. venue protections.",
  key_facts: {
    selected_clause: "Demo clause: tenant indemnifies landlord for broad claims.",
    workflow: "dashboard_demo_only",
  },
  documents: [
    {
      document_id: "demo-only-lease-amendment",
      title: "Demo lease amendment excerpt",
      source: "local_dashboard_demo",
    },
  ],
  sensitivity_flags: ["demo_only"],
  missing_information: ["counterparty negligence carveout", "insurance limits"],
  history: [
    {
      event: "local_demo_context_loaded",
      source: "mercy_legal_web",
    },
  ],
  tier: "free",
  created_at: "2026-05-12T00:00:00.000Z",
  last_updated: "2026-05-12T00:00:00.000Z",
  facts: {
    selected_clause: "Demo clause: tenant indemnifies landlord for broad claims.",
  },
  drafts: [],
  billing_events: [],
  route_history: [],
};

const DASHBOARD_DEMO_INTAKE_SUMMARY: CoreIntakeSummary = {
  version: "local-dashboard-demo",
  matter_id: DASHBOARD_DEMO_MATTER_CONTEXT.matter_id,
  matter_name: DASHBOARD_DEMO_MATTER_CONTEXT.name,
  client_name: DASHBOARD_DEMO_MATTER_CONTEXT.client_name,
  jurisdiction: DASHBOARD_DEMO_MATTER_CONTEXT.jurisdiction,
  client_role: DASHBOARD_DEMO_MATTER_CONTEXT.client_role,
  requested_relief: DASHBOARD_DEMO_MATTER_CONTEXT.requested_relief,
  document_count: DASHBOARD_DEMO_MATTER_CONTEXT.documents?.length ?? 0,
  deadline_count: DASHBOARD_DEMO_MATTER_CONTEXT.deadlines?.length ?? 0,
  missing_information_count: DASHBOARD_DEMO_MATTER_CONTEXT.missing_information?.length ?? 0,
  conflict_status: "demo_not_checked",
  scope_status: "demo_not_confirmed",
  ready_for_attorney_review: false,
  last_updated: DASHBOARD_DEMO_MATTER_CONTEXT.last_updated,
};

async function coreFetch<T>(path: string, init?: RequestInit): Promise<CoreClientResult<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(`${MERCY_CORE_API_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
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
        error: detail ?? `Core request failed: ${response.status}`,
      };
    }

    return { ok: true, data: data as T, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Core request failed";
    return { ok: false, data: null, error: message };
  } finally {
    clearTimeout(timeout);
  }
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
    router: null,
    intake: null,
    demoMatterContext: DASHBOARD_DEMO_MATTER_CONTEXT,
    demoIntakeSummary: DASHBOARD_DEMO_INTAKE_SUMMARY,
    usingDemoContext: true,
    error: firstError,
  };
}

export async function getMatter(matterId: string): Promise<CoreClientResult<CoreMatter>> {
  return coreFetch<CoreMatter>(`/v1/matters/${encodeURIComponent(matterId)}`);
}

export async function routeLegalTask(payload: {
  query: string;
  matter_context?: Record<string, unknown>;
  user_type?: string;
  surface_context?: string;
  matter_id?: string;
  selected_text?: string;
  document_text?: string;
}): Promise<CoreClientResult<CoreRouterEnvelope>> {
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
  });
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
}): Promise<CoreClientResult<CoreMatterIntakeEnvelope>> {
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
  });
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
}): Promise<CoreClientResult<CoreFullMatterIntakeEnvelope>> {
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
  });
}
