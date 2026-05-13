export type RiskLevel = "high" | "medium" | "low";

export type SidebarView = "risk" | "clauses" | "chat" | "report";

export type ProcessingState = "idle" | "analyzing" | "explaining" | "inserting" | "drafting" | "syncing" | "skill";

export interface RiskFinding {
  id: string;
  level: RiskLevel;
  title: string;
  excerpt: string;
  dcContext: string;
  recommendation: string;
}

export interface CoreResponseMetadata {
  source: "core" | "fallback";
  coreUrl: string;
  humanReviewRequired: boolean;
  agent?: CoreAgentMetadata;
  guardrailStatus?: string;
  reviewFlags?: string[];
  fallbackReason?: string;
  route?: CoreRouteDecision;
  citations?: CoreCitation[];
  envelope?: CoreResponseEnvelope;
  matterContext?: CoreMatterContext;
  intakeSummary?: CoreIntakeSummary;
  groundingStatus?: string;
  ragasStatus?: string;
  traceId?: string;
  langsmithUrl?: string;
  cacheStatus?: "live" | "cached" | "queued" | "synced" | "offline";
  syncStatus?: string;
  retryWhenOnline?: boolean;
  queuedRequestCount?: number;
  tenantId?: string;
  userId?: string;
  officialSourceGrounding?: string;
  skillResults?: CoreMcpSkillResult[];
}

export interface CoreCitation {
  label: string;
  source_type: string;
  verification_status: string;
  note: string;
  provenance?: Record<string, unknown>;
}

export interface CoreDcEthicsMetadata {
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
}

export interface CoreMatterContextSnapshot {
  reference: string | null;
  hash: string;
  storage_mode: string;
}

export interface CoreResponseEnvelope {
  envelope_version: string;
  route: CoreRouteDecision;
  expert: string;
  confidence_score: number;
  guardrail_status: "pass" | "warn" | "block";
  citations: CoreCitation[];
  dc_ethics_metadata: CoreDcEthicsMetadata;
  matter_context_snapshot: CoreMatterContextSnapshot;
  audit_timestamp: string;
}

export interface CoreAgentMetadata {
  selected_agent: string;
  selected_expert: string;
  mcp_skills_used: string[];
  grounding_policy?: {
    status: string;
    strict_grounding: boolean;
    no_unverified_output: boolean;
    issues: string[];
    instruction: string;
  };
}

export interface CoreMcpSkill {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  tags: string[];
  mcp_compatible: boolean;
}

export interface CoreMcpManifest {
  manifest_version: string;
  agent_network_version: string;
  langgraph: {
    available: boolean;
    runtime: string;
  };
  agents: Array<Record<string, unknown>>;
  skills: CoreMcpSkill[];
  rag_backend?: {
    tenant_isolated?: boolean;
    production_blocked?: boolean;
    source_registry?: {
      official_source_count?: number;
      local_demo_source_count?: number;
      local_demo_active?: boolean;
    };
    ingestion_contract?: {
      official_source_count?: number;
      local_demo_source_count?: number;
      local_demo_active?: boolean;
    };
  };
  strict_grounding: boolean;
  langsmith_tracing: boolean;
}

export interface CoreMcpSkillResult {
  skill_name: string;
  status: "pass" | "warn" | "block";
  human_review_required: boolean;
  citations?: CoreCitation[];
  provenance?: Record<string, unknown>;
  grounding_policy?: CoreAgentMetadata["grounding_policy"];
  [key: string]: unknown;
}

export interface CoreMatterContext {
  matter_id: string;
  name: string;
  client_id: string;
  tenant_id?: string;
  created_by_user_id?: string;
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
  last_updated?: string;
}

export interface CoreIntakeSummary {
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
}

export interface CoreRouteDecision {
  router_version: string;
  route_mode: string;
  expert: string;
  expert_label: string;
  confidence: number;
  selected_capability: string;
  guardrail_status: string;
  citations: CoreCitation[];
  missing_inputs: string[];
  alternate_routes?: Array<Record<string, unknown>>;
  fallback_path: string;
  surface_context: string;
  premium_gate: string;
  next_action: string;
  execute: boolean;
  safety_notes: string[];
}

export interface AgentActionResult {
  title: string;
  content: string;
  core: CoreResponseMetadata;
}

export interface AnalysisResult {
  score: number;
  summary: string;
  findings: RiskFinding[];
  core?: CoreResponseMetadata;
}

export interface Clause {
  id: string;
  title: string;
  category: string;
  jurisdictionNote: string;
  text: string;
}

export interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  core?: CoreResponseMetadata;
}
