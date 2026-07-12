/*
Purpose: Agent-network client for the Mercy Word and Outlook add-ins.

All legal work routes through the FastAPI MoE router and LangGraph-compatible
agent network. The service keeps a small local cache/queue so drafting and
review workflows remain usable when the core is temporarily offline.
*/

import {
  AgentActionResult,
  AnalysisResult,
  ChatMessage,
  CoreMatterContext,
  CoreMatterListItem,
  CoreMcpManifest,
  CoreMcpSkillResult,
  CoreResponseMetadata,
  CoreBetaStatus,
  CoreTemplateGallery,
  CoreTemplateGalleryItem,
  RiskFinding
} from "../types";

const DEFAULT_CORE_URL = "http://127.0.0.1:8000";
const viteEnv = (import.meta as ImportMeta & {
  env?: {
    VITE_MERCY_API_TOKEN?: string;
    VITE_MERCY_CORE_API_URL?: string;
    VITE_MERCY_WEB_AUTH_URL?: string;
    VITE_MERCY_OFFICE_PKCE_FALLBACK_ENABLED?: string;
    VITE_MERCY_ENV?: string;
    VITE_MERCY_AUTH_MODE?: string;
    VITE_MERCY_TENANT_ID?: string;
    VITE_MERCY_USER_ID?: string;
  };
}).env;

// Production builds (Vite replaces import.meta.env at build time) MUST supply real HTTPS endpoints via .env.production or
// environment variables. The defaults below are only for local dev against `npm run dev` + source manifests.
const CORE_API_URL = (viteEnv?.VITE_MERCY_CORE_API_URL || DEFAULT_CORE_URL).replace(/\/+$/, "");
const WEB_AUTH_URL = (viteEnv?.VITE_MERCY_WEB_AUTH_URL || "https://127.0.0.1:3000").replace(/\/+$/, "");

// Guard: prevent shipping a bundle that would call localhost in production.
// Vite replaces import.meta.env at build; we use a safe any cast because the project's
// tsconfig + vite/client reference may not expose the full shape in this context.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isProdBuild = Boolean((import.meta as any)?.env?.PROD);
if (isProdBuild) {
  if (CORE_API_URL.includes("127.0.0.1") || CORE_API_URL.includes("localhost")) {
    throw new Error(
      "Production build of mercy-legal-plugin detected localhost CORE_API_URL. " +
        "Set VITE_MERCY_CORE_API_URL (and VITE_MERCY_WEB_AUTH_URL) via .env.production or build environment before `npm run build`."
    );
  }
  if (WEB_AUTH_URL.includes("127.0.0.1") || WEB_AUTH_URL.includes("localhost")) {
    throw new Error(
      "Production build of mercy-legal-plugin detected localhost WEB_AUTH_URL. " +
        "Set VITE_MERCY_WEB_AUTH_URL via .env.production or build environment before `npm run build`."
    );
  }
}
const MATTER_ID = "word-addin-session-matter";
let ACTIVE_MATTER_ID = MATTER_ID;
let ACTIVE_MATTER: CoreMatterListItem | null = null;
const CACHE_PREFIX = "mercy-agent-cache:";
const QUEUE_KEY = "mercy-agent-offline-queue";
const RECENT_SAFE_RESPONSES_KEY = "mercy-agent-recent-safe-responses";
let unsafeStoragePurged = false;

export type MercyAuthStatus = {
  tenantId: string;
  userId: string;
  roles: string;
  hasToken: boolean;
  source: "office-naa" | "office-pkce" | "office-settings" | "url-handoff" | "env" | "local-dev" | "sign-in-required";
};

type CoreIntakeResponse = {
  matter_context: CoreMatterContext;
  matter_id: string;
  intake_summary?: CoreResponseMetadata["intakeSummary"];
};

type CoreAgentResponse = {
  agent_network_version: string;
  selected_agent: string;
  selected_expert: string;
  task: string;
  agent_result?: Record<string, unknown>;
  mcp_skills_used?: string[];
  mcp_skill_results?: CoreMcpSkillResult[];
  citations?: CoreResponseMetadata["citations"];
  grounding_policy?: CoreResponseMetadata["agent"] extends infer T
    ? T extends { grounding_policy?: infer G }
      ? G
      : never
    : never;
  human_review_required?: boolean;
  trace_id?: string;
  langsmith_project_url?: string;
  route?: CoreResponseMetadata["route"];
  response_envelope?: CoreResponseMetadata["envelope"];
  guardrail_status?: string;
  cache_status?: CoreResponseMetadata["cacheStatus"];
  sync_status?: string;
  retry_when_online?: boolean;
  beta?: {
    model_tier: string;
    quota: CoreResponseMetadata["betaQuota"];
    feedback_endpoint: string;
    attorney_review_required: boolean;
  };
};

type AgentRequest = {
  task: string;
  params?: Record<string, unknown>;
  matter_id?: string;
  matter_context?: Record<string, unknown>;
  surface_context?: string;
  user_type?: string;
};

type QueuedAgentRequest = {
  id: string;
  createdAt: string;
  cacheKey: string;
  action: string;
  request: AgentRequest;
  redaction: StorageRedactionSummary;
};

type StorageRedactionSummary = {
  status: "redacted";
  removedPaths: string[];
  originalContentRequired: boolean;
};

const SENSITIVE_STORAGE_KEYS = new Set([
  "content",
  "context",
  "document_excerpt",
  "document_text",
  "draft",
  "facts",
  "instruction",
  "key_facts",
  "law_or_case",
  "new_facts",
  "selected_text",
  "text",
  "word_addin_note"
]);

const SAFE_STORAGE_STRING_KEYS = new Set([
  "format",
  "jurisdiction",
  "matter_id",
  "source",
  "surface_context",
  "top_k",
  "user_type"
]);

const STORAGE_SAFE_AGENT_RESULT = {
  status: "warn",
  answer: "Cached metadata only. Reconnect to the Mercy core and rerun the action with the active document open.",
  grounding_policy: {
    status: "warn",
    strict_grounding: true,
    no_unverified_output: false,
    issues: ["local_cache_redacted"],
    instruction: "Local cache excludes confidential document text and generated legal content."
  }
};

function authContext(): { token?: string; tenantId: string; userId: string; roles: string } {
  initializeAuthHandoff();
  const store = storage();
  const localDev = localDevAuthDefaultsEnabled();
  const token = store?.getItem("mercy.auth.token") || (localDev ? viteEnv?.VITE_MERCY_API_TOKEN : undefined);
  return {
    token: token || undefined,
    tenantId: localDev ? viteEnv?.VITE_MERCY_TENANT_ID || "local-dev-tenant" : "verified-by-core",
    userId: localDev ? viteEnv?.VITE_MERCY_USER_ID || "word-addin-user" : "verified-by-core",
    roles: localDev ? store?.getItem("mercy.auth.roles") || "attorney" : "verified-by-core"
  };
}

function localDevAuthDefaultsEnabled(): boolean {
  return viteEnv?.VITE_MERCY_ENV === "local" && viteEnv?.VITE_MERCY_AUTH_MODE === "dev";
}

function authHeaders(): Record<string, string> {
  const auth = authContext();
  if (!localDevAuthDefaultsEnabled()) {
    return {
      ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {})
    };
  }
  return {
    ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    "X-Mercy-Tenant-Id": auth.tenantId,
    "X-Mercy-User-Id": auth.userId,
    "X-Mercy-Roles": auth.roles
  };
}

function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string, fallback: T): T {
  const store = storage();
  if (!store) {
    return fallback;
  }
  try {
    const value = store.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  const store = storage();
  if (!store) {
    return;
  }
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

function purgeUnsafeStoredAgentData(): void {
  const store = storage();
  if (!store || unsafeStoragePurged) {
    return;
  }
  unsafeStoragePurged = true;

  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key?.startsWith(CACHE_PREFIX) && key !== `${CACHE_PREFIX}skills`) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => store.removeItem(key));

    const queue = readJson<QueuedAgentRequest[]>(QUEUE_KEY, []);
    const safeQueue = queue.filter((item) => item.redaction?.status === "redacted");
    if (safeQueue.length !== queue.length) {
      writeJson(QUEUE_KEY, safeQueue);
    }
  } catch {
    return;
  }
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function cacheKey(action: string, request: AgentRequest): string {
  const fingerprint = {
    action,
    matter_id: request.matter_id ?? ACTIVE_MATTER_ID,
    surface_context: request.surface_context ?? "office_addin",
    user_type: request.user_type ?? "solo",
    task_class: action,
    param_keys: Object.keys(request.params ?? {}).sort(),
    context_keys: Object.keys(request.matter_context ?? {}).sort()
  };
  return `${CACHE_PREFIX}${action}:${stableHash(JSON.stringify(fingerprint))}`;
}

function shouldRedactValue(path: string, value: unknown): boolean {
  const key = path.split(".").pop() ?? path;
  if (SENSITIVE_STORAGE_KEYS.has(key)) {
    return true;
  }
  if (typeof value === "string" && !SAFE_STORAGE_STRING_KEYS.has(key)) {
    return value.length > 80 || /client|tenant|landlord|clause|agreement|contract|liability|indemn/i.test(value);
  }
  return false;
}

function redactForStorage(value: unknown, path = "request", removedPaths: string[] = []): unknown {
  if (shouldRedactValue(path, value)) {
    removedPaths.push(path);
    return "[REDACTED_CONFIDENTIAL]";
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => redactForStorage(item, `${path}.${index}`, removedPaths));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        redactForStorage(nestedValue, `${path}.${key}`, removedPaths)
      ])
    );
  }
  return value;
}

function storageSafeRequest(action: string, request: AgentRequest): { request: AgentRequest; redaction: StorageRedactionSummary } {
  const removedPaths: string[] = [];
  const redacted = redactForStorage(
    {
      ...request,
      task: `Offline ${action.replace(/_/g, " ")} request. Confidential source content was redacted before local storage.`
    },
    "request",
    removedPaths
  ) as AgentRequest;

  return {
    request: redacted,
    redaction: {
      status: "redacted",
      removedPaths: Array.from(new Set(removedPaths)).sort(),
      originalContentRequired: removedPaths.length > 0
    }
  };
}

function storageSafeResponse(response: CoreAgentResponse): CoreAgentResponse {
  return {
    agent_network_version: response.agent_network_version,
    selected_agent: response.selected_agent,
    selected_expert: response.selected_expert,
    task: "Cached metadata only. Confidential task text was not persisted.",
    agent_result: STORAGE_SAFE_AGENT_RESULT,
    mcp_skills_used: response.mcp_skills_used ?? [],
    mcp_skill_results: response.mcp_skill_results?.map((result) => redactForStorage(result) as CoreMcpSkillResult) ?? [],
    citations: response.response_envelope?.citations ?? response.citations ?? [],
    grounding_policy: response.grounding_policy,
    human_review_required: response.human_review_required ?? true,
    trace_id: response.trace_id,
    langsmith_project_url: response.langsmith_project_url,
    route: response.route,
    response_envelope: response.response_envelope,
    guardrail_status: response.response_envelope?.guardrail_status ?? response.guardrail_status ?? "warn"
  };
}

function queueRequest(action: string, cacheKeyValue: string, request: AgentRequest): void {
  const queue = readJson<QueuedAgentRequest[]>(QUEUE_KEY, []);
  const safe = storageSafeRequest(action, request);
  queue.push({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    action,
    cacheKey: cacheKeyValue,
    request: safe.request,
    redaction: safe.redaction
  });
  writeJson(QUEUE_KEY, queue.slice(-20));
}

function cachedAgent(cacheKeyValue: string): CoreAgentResponse | null {
  return readJson<CoreAgentResponse | null>(cacheKeyValue, null);
}

function saveCachedAgent(cacheKeyValue: string, response: CoreAgentResponse): void {
  const safeResponse = storageSafeResponse(response);
  writeJson(cacheKeyValue, safeResponse);
  saveRecentSafeResponse(safeResponse);
}

function saveRecentSafeResponse(response: CoreAgentResponse): void {
  const recent = readJson<CoreAgentResponse[]>(RECENT_SAFE_RESPONSES_KEY, []);
  writeJson(RECENT_SAFE_RESPONSES_KEY, [response, ...recent].slice(0, 8));
}

function recentSafeResponses(): CoreAgentResponse[] {
  purgeUnsafeStoredAgentData();
  return readJson<CoreAgentResponse[]>(RECENT_SAFE_RESPONSES_KEY, []);
}

// Single source of truth for the backend base. All network calls (coreFetch, postCoreIntake, postAgent, etc.)
// to the Mercy core must go through here so that production builds (VITE_MERCY_CORE_API_URL injected at
// build time via .env.production or env vars) are respected and localhost is never shipped.
function getCoreBase(): string {
  return CORE_API_URL;
}

async function coreFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getCoreBase();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...authHeaders(),
      ...(init?.headers ?? {})
    }
  });
  const data = (await response.json()) as T | { detail?: string };
  if (!response.ok) {
    const detail = typeof data === "object" && data !== null && "detail" in data ? data.detail : null;
    throw new Error(detail ? String(detail) : `Core request failed: ${response.status}`);
  }
  return data as T;
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringValues(value: unknown): string[] {
  return Array.isArray(value) ? value.map(stringValue).filter((item): item is string => Boolean(item)) : [];
}

function recordValues(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(recordValue).filter((item) => Object.keys(item).length > 0) : [];
}

function mergeStrings(...values: Array<string[] | undefined>): string[] {
  return [...new Set(values.flatMap((items) => items ?? []).filter(Boolean))];
}

function mergeDocumentReferences(
  current: Array<Record<string, unknown>> = [],
  request: Array<Record<string, unknown>> = []
): Array<Record<string, unknown>> {
  const merged = new Map<string, Record<string, unknown>>();
  for (const [index, document] of [...current, ...request].entries()) {
    const identity = stringValue(document.document_id) ?? stringValue(document.id) ?? `office-reference-${index}`;
    merged.set(identity, document);
  }
  return [...merged.values()];
}

function safeWorkflowFacts(value: unknown): Record<string, unknown> {
  const facts = recordValue(value);
  return Object.fromEntries(Object.entries(facts).filter(([key]) => !SENSITIVE_STORAGE_KEYS.has(key.toLowerCase())));
}

/**
 * Build request-scoped Office context without mutating the selected matter.
 *
 * Office analysis, drafting, and template actions are read-only with respect to
 * matter metadata. Matter creation and intake remain explicit web/core actions;
 * document or email content is sent only in the agent request that the attorney
 * initiated and is never written through the full-intake endpoint as a preflight.
 */
function buildOfficeRequestContext(payload: Record<string, unknown>): CoreIntakeResponse {
  const auth = authContext();
  const matter = recordValue(payload.matter);
  const activeDocuments = ACTIVE_MATTER?.documents ?? [];
  const requestDocuments = recordValues(payload.documents);
  const documents = mergeDocumentReferences(activeDocuments, requestDocuments);
  const missingInformation = mergeStrings(ACTIVE_MATTER?.missing_information, stringValues(payload.missing_information));
  const sensitivityFlags = mergeStrings(ACTIVE_MATTER?.sensitivity_flags, stringValues(payload.sensitivity_flags));
  const requestedRelief = stringValue(payload.requested_relief) ?? ACTIVE_MATTER?.requested_relief ?? null;
  const matterName = ACTIVE_MATTER?.name ?? stringValue(matter.matter_name) ?? "Unsaved Office session";
  const matterContext: CoreMatterContext = {
    matter_id: ACTIVE_MATTER_ID,
    name: matterName,
    client_id: ACTIVE_MATTER?.client_id ?? "office-session-client",
    tenant_id: ACTIVE_MATTER?.tenant_id ?? auth.tenantId,
    created_by_user_id: ACTIVE_MATTER?.created_by_user_id ?? auth.userId,
    client_name: ACTIVE_MATTER?.client_name ?? null,
    matter_type: ACTIVE_MATTER?.matter_type ?? stringValue(matter.matter_type) ?? "Office document work",
    jurisdiction: ACTIVE_MATTER?.jurisdiction ?? stringValue(matter.jurisdiction) ?? "District of Columbia",
    client_role: ACTIVE_MATTER?.client_role ?? stringValue(matter.client_role) ?? null,
    opposing_parties: [...(ACTIVE_MATTER?.opposing_parties ?? [])],
    deadlines: [...(ACTIVE_MATTER?.deadlines ?? [])],
    requested_relief: requestedRelief,
    key_facts: {
      ...(ACTIVE_MATTER?.key_facts ?? ACTIVE_MATTER?.facts ?? {}),
      ...safeWorkflowFacts(payload.key_facts)
    },
    documents,
    sensitivity_flags: sensitivityFlags,
    missing_information: missingInformation,
    history: [...(ACTIVE_MATTER?.history ?? [])],
    last_updated: ACTIVE_MATTER?.last_updated
  };
  return {
    matter_id: ACTIVE_MATTER_ID,
    matter_context: matterContext,
    intake_summary: {
      version: "office-ephemeral-context-1.0",
      matter_id: ACTIVE_MATTER_ID,
      matter_name: matterName,
      client_name: matterContext.client_name,
      jurisdiction: matterContext.jurisdiction,
      client_role: matterContext.client_role,
      requested_relief: requestedRelief,
      document_count: documents.length,
      deadline_count: matterContext.deadlines?.length ?? 0,
      missing_information_count: missingInformation.length,
      conflict_status: ACTIVE_MATTER ? "preserved_from_selected_matter" : "not_evaluated_for_unsaved_office_session",
      scope_status: ACTIVE_MATTER ? "preserved_from_selected_matter" : "not_confirmed_for_unsaved_office_session",
      ready_for_attorney_review: missingInformation.length === 0,
      last_updated: matterContext.last_updated ?? null
    }
  };
}

async function postAgent(request: AgentRequest): Promise<CoreAgentResponse> {
  // Uses the same prod-aware base URL (injected at build via VITE_MERCY_CORE_API_URL).
  return coreFetch<CoreAgentResponse>("/v1/agent/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      matter_id: ACTIVE_MATTER_ID,
      matter_context: {
        jurisdiction: "District of Columbia",
        surface_context: "office_addin",
        matter_id: ACTIVE_MATTER_ID,
        matter_name: ACTIVE_MATTER?.name,
        documents: ACTIVE_MATTER?.documents ?? [{ document_id: "active-office-document", title: "Active Office document", source: "office_addin" }],
        ...(request.matter_context ?? {})
      },
      user_type: "solo",
      surface_context: "office_addin",
      ...request
    })
  });
}

function withCacheState(
  response: CoreAgentResponse,
  cacheStatus: CoreResponseMetadata["cacheStatus"],
  retryWhenOnline = false
): CoreAgentResponse {
  return {
    ...response,
    cache_status: cacheStatus,
    sync_status:
      cacheStatus === "live"
        ? "live core"
        : retryWhenOnline
          ? "retry when online with the active document open"
          : cacheStatus,
    retry_when_online: retryWhenOnline
  };
}

async function agentExecute(action: string, request: AgentRequest, fallbackText: string): Promise<CoreAgentResponse> {
  purgeUnsafeStoredAgentData();
  const key = cacheKey(action, request);
  if (!isOnline()) {
    queueRequest(action, key, request);
    const cached = cachedAgent(key);
    if (cached) {
      return withCacheState({ ...cached, guardrail_status: cached.guardrail_status ?? "warn" }, "cached", true);
    }
    throw new Error("Core offline; request queued for sync.");
  }

  try {
    const response = await postAgent(request);
    saveCachedAgent(key, response);
    return withCacheState(response, "live");
  } catch (error) {
    queueRequest(action, key, request);
    const cached = cachedAgent(key);
    if (cached) {
      return withCacheState(cached, "cached", true);
    }
    const reason = error instanceof Error ? error.message : "Agent request failed";
    return withCacheState(fallbackAgentResponse(action, request.task, `${fallbackText}\n\nOffline queue: ${reason}`), "queued", true);
  }
}

function fallbackAgentResponse(action: string, task: string, content: string): CoreAgentResponse {
  return {
    agent_network_version: "offline-fallback",
    selected_agent: "OfflinePreview",
    selected_expert: "compliance_guardrails",
    task,
    agent_result: {
      status: "warn",
      answer: addReviewDisclaimer(content),
      grounding_policy: {
        status: "warn",
        strict_grounding: true,
        no_unverified_output: false,
        issues: ["core_unavailable"],
        instruction: "Preview only. Sync with the Mercy core before relying on this output."
      }
    },
    mcp_skills_used: [],
    mcp_skill_results: [],
    citations: [
      {
        label: "[VERIFY CITE]",
        source_type: "placeholder",
        verification_status: "missing_required",
        note: "Core unavailable; attorney verification required.",
        provenance: { source: "offline_fallback", action }
      }
    ],
    grounding_policy: {
      status: "warn",
      strict_grounding: true,
      no_unverified_output: false,
      issues: ["core_unavailable"],
      instruction: "Preview only. Sync with the Mercy core before relying on this output."
    },
    human_review_required: true,
    guardrail_status: "warn"
  };
}

async function getTemplateGallery(): Promise<CoreTemplateGallery | null> {
  try {
    return await coreFetch<CoreTemplateGallery>("/v1/templates/gallery");
  } catch {
    return null;
  }
}

async function getBetaStatus(): Promise<CoreBetaStatus | null> {
  try {
    return await coreFetch<CoreBetaStatus>("/v1/beta/status");
  } catch {
    return null;
  }
}

async function listMatters(search = ""): Promise<CoreMatterListItem[]> {
  try {
    const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
    const matters = await coreFetch<CoreMatterListItem[]>(`/v1/matters${query}`);
    return matters;
  } catch {
    return [];
  }
}

function setActiveMatter(matter: CoreMatterListItem | null): void {
  ACTIVE_MATTER = matter;
  ACTIVE_MATTER_ID = matter?.matter_id ?? MATTER_ID;
}

function addReviewDisclaimer(content: string): string {
  const disclaimer = "This is AI-assisted drafting - attorney must review and verify all content before use.";
  if (content.includes(disclaimer)) {
    return content;
  }
  return `${disclaimer}\n\n${content}`;
}

function agentContent(response: CoreAgentResponse): string {
  const result = response.agent_result ?? {};
  const direct = result.draft ?? result.answer ?? result.summary;
  if (typeof direct === "string" && direct.trim()) {
    return addReviewDisclaimer(direct);
  }
  const compliance = result.compliance;
  if (typeof compliance === "object" && compliance !== null) {
    return `Compliance status: ${(compliance as { status?: string }).status ?? "review required"}`;
  }
  const verification = result.verification;
  if (typeof verification === "object" && verification !== null) {
    const citation = (verification as { verified_citation?: { label?: string } }).verified_citation;
    return `Citation verification: ${citation?.label ?? "[VERIFY CITE]"}`;
  }
  return addReviewDisclaimer("Mercy agent response requires attorney review.");
}

function metadataFromAgent(
  response: CoreAgentResponse,
  matterContext?: CoreMatterContext,
  intakeSummary?: CoreResponseMetadata["intakeSummary"],
  cacheStatus: CoreResponseMetadata["cacheStatus"] = response.cache_status ?? "live"
): CoreResponseMetadata {
  const route = response.response_envelope?.route ?? response.route;
  const groundingPolicy = response.grounding_policy ?? response.agent_result?.grounding_policy;
  const groundingStatus =
    typeof groundingPolicy === "object" && groundingPolicy !== null && "status" in groundingPolicy
      ? String((groundingPolicy as { status?: string }).status)
      : response.guardrail_status;
  const ragasStatus = response.agent_result?.ragas_eval_hook ? "available" : undefined;
  const langsmithUrl = response.langsmith_project_url
    ? `${response.langsmith_project_url}${response.trace_id ? `?trace=${response.trace_id}` : ""}`
    : undefined;
  const auth = authContext();
  const citationStatuses = response.response_envelope?.citations ?? response.citations ?? route?.citations ?? [];
  const officialGrounding = citationStatuses.some((citation) => citation.verification_status.includes("official"))
    ? "Grounded in verified official D.C. source metadata"
    : citationStatuses.length
      ? "candidate citations require official-source verification"
      : "no source grounding returned";

  return {
    source: response.agent_network_version === "offline-fallback" ? "fallback" : "core",
    coreUrl: CORE_API_URL,
    humanReviewRequired: response.human_review_required ?? true,
    agent: {
      selected_agent: response.selected_agent,
      selected_expert: response.selected_expert,
      mcp_skills_used: response.mcp_skills_used ?? [],
      grounding_policy: groundingPolicy as CoreResponseMetadata["agent"] extends infer T
        ? T extends { grounding_policy?: infer G }
          ? G
          : never
        : never
    },
    guardrailStatus: response.response_envelope?.guardrail_status ?? response.guardrail_status ?? route?.guardrail_status,
    reviewFlags: response.response_envelope?.dc_ethics_metadata.review_flags,
    route,
    citations: response.response_envelope?.citations ?? response.citations ?? route?.citations,
    envelope: response.response_envelope,
    matterContext,
    intakeSummary,
    groundingStatus,
    ragasStatus,
    traceId: response.trace_id,
    langsmithUrl,
    cacheStatus,
    syncStatus: response.sync_status ?? (cacheStatus === "live" ? "live core" : "offline queue"),
    retryWhenOnline: response.retry_when_online,
    queuedRequestCount: queuedAgentRequestCount(),
    tenantId: matterContext?.tenant_id ?? auth.tenantId,
    userId: matterContext?.created_by_user_id ?? auth.userId,
    officialSourceGrounding: officialGrounding,
    skillResults: response.mcp_skill_results ?? [],
    betaQuota: response.beta?.quota
  };
}

function officeRoamingSettings(): { get?: (key: string) => unknown; set?: (key: string, value: unknown) => void; saveAsync?: () => void } | null {
  const officeContext = typeof Office !== "undefined" ? Office.context : undefined;
  return (officeContext as { roamingSettings?: { get?: (key: string) => unknown; set?: (key: string, value: unknown) => void; saveAsync?: () => void } } | undefined)?.roamingSettings ?? null;
}

function persistAuthValue(key: string, value: string, source: MercyAuthStatus["source"]): void {
  const store = storage();
  store?.setItem(key, value);
  store?.setItem("mercy.auth.source", source);
  const roaming = officeRoamingSettings();
  roaming?.set?.(key, value);
  roaming?.set?.("mercy.auth.source", source);
  roaming?.saveAsync?.();
}

function persistOfficeSessionToken(token: string, source: MercyAuthStatus["source"] = "office-pkce"): void {
  const store = storage();
  store?.setItem("mercy.auth.token", token);
  store?.setItem("mercy.auth.source", source);
  store?.removeItem("mercy.auth.tenantId");
  store?.removeItem("mercy.auth.userId");
  store?.removeItem("mercy.auth.roles");
  const roaming = officeRoamingSettings();
  roaming?.set?.("mercy.auth.token", token);
  roaming?.set?.("mercy.auth.source", source);
  roaming?.saveAsync?.();
}

function hydrateAuthFromUrl(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const params = new URLSearchParams(`${window.location.search.replace(/^\?/, "")}&${window.location.hash.replace(/^#/, "")}`);
  const token = params.get("mercy_token") || params.get("access_token");
  if (!token) {
    return false;
  }
  persistAuthValue("mercy.auth.token", token, "url-handoff");
  return true;
}

function hydrateAuthFromOffice(): boolean {
  const roaming = officeRoamingSettings();
  const store = storage();
  if (!roaming || !store) {
    return false;
  }
  let hydrated = false;
  ["mercy.auth.token"].forEach((key) => {
    const existing = store.getItem(key);
    const value = roaming.get?.(key);
    if (!existing && typeof value === "string" && value.trim()) {
      store.setItem(key, value);
      hydrated = true;
    }
  });
  if (hydrated) {
    store.setItem("mercy.auth.source", "office-settings");
  }
  return hydrated;
}

export function initializeAuthHandoff(): MercyAuthStatus {
  const store = storage();
  const fromUrl = hydrateAuthFromUrl();
  const fromOffice = hydrateAuthFromOffice();
  const localDev = localDevAuthDefaultsEnabled();
  const token = store?.getItem("mercy.auth.token") || (localDev ? viteEnv?.VITE_MERCY_API_TOKEN : undefined);
  const tenantId = localDev ? viteEnv?.VITE_MERCY_TENANT_ID || "local-dev-tenant" : "verified by Mercy core";
  const userId = localDev ? viteEnv?.VITE_MERCY_USER_ID || "office-addin-user" : "verified by Mercy core";
  const roles = localDev ? store?.getItem("mercy.auth.roles") || "attorney" : "verified by Mercy core";
  const storedSource = store?.getItem("mercy.auth.source") as MercyAuthStatus["source"] | null;
  const source: MercyAuthStatus["source"] = fromUrl
    ? "url-handoff"
    : fromOffice
      ? "office-settings"
      : token && storedSource
        ? storedSource
        : token
          ? viteEnv?.VITE_MERCY_API_TOKEN
            ? "env"
            : "office-pkce"
          : localDev
            ? "local-dev"
            : "sign-in-required";
  return { tenantId, userId, roles, hasToken: Boolean(token), source };
}

type OfficeAuthDialogMessage = {
  type?: string;
  ok?: boolean;
  access_token?: string;
  error?: string;
};

type OfficeNaaOptions = {
  allowSignInPrompt?: boolean;
  fallbackToPkce?: boolean;
};

async function getOfficeBootstrapToken(allowSignInPrompt: boolean): Promise<string> {
  const runtimeAuth = (globalThis as { OfficeRuntime?: { auth?: { getAccessToken?: (options?: Record<string, unknown>) => Promise<string> } } }).OfficeRuntime?.auth;
  const officeAuth = (globalThis as { Office?: { auth?: { getAccessToken?: (options?: Record<string, unknown>) => Promise<string> } } }).Office?.auth;
  const getAccessToken = runtimeAuth?.getAccessToken ?? officeAuth?.getAccessToken;
  if (!getAccessToken) {
    throw new Error("Microsoft Office SSO is unavailable in this host.");
  }
  return getAccessToken({
    allowSignInPrompt,
    allowConsentPrompt: allowSignInPrompt,
    forMSGraphAccess: false
  });
}

async function exchangeMicrosoftBootstrapToken(bootstrapToken: string): Promise<string> {
  const response = await fetch(`${CORE_API_URL}/v1/auth/microsoft/exchange`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ bootstrap_token: bootstrapToken })
  });
  const data = (await response.json()) as { access_token?: string; detail?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(data.detail || "Microsoft Office SSO exchange failed.");
  }
  return data.access_token;
}

export async function beginOfficeNaaSignIn(surface: "Word" | "Outlook" | "Office" = "Office", options: OfficeNaaOptions = {}): Promise<MercyAuthStatus> {
  void surface;
  const bootstrapToken = await getOfficeBootstrapToken(Boolean(options.allowSignInPrompt));
  const mercyToken = await exchangeMicrosoftBootstrapToken(bootstrapToken);
  persistOfficeSessionToken(mercyToken, "office-naa");
  return initializeAuthHandoff();
}

export async function beginOfficePkceSignIn(surface: "Word" | "Outlook" | "Office" = "Office"): Promise<MercyAuthStatus> {
  const startUrl = `${WEB_AUTH_URL}/api/auth/office/start?surface=${encodeURIComponent(surface.toLowerCase())}`;
  if (typeof Office === "undefined" || !Office.context?.ui?.displayDialogAsync) {
    throw new Error("Office dialog sign-in is unavailable in this host.");
  }

  return new Promise((resolve, reject) => {
    Office.context.ui.displayDialogAsync(
      startUrl,
      { height: 65, width: 45, displayInIframe: false },
      (result) => {
        if (result.status !== Office.AsyncResultStatus.Succeeded || !result.value) {
          reject(new Error(result.error?.message || "Mercy sign-in dialog could not be opened."));
          return;
        }
        const dialog = result.value;
        const closeDialog = () => {
          try {
            dialog.close();
          } catch {
            return;
          }
        };
        dialog.addEventHandler(Office.EventType.DialogMessageReceived, (event) => {
          try {
            const rawMessage = "message" in event ? String(event.message) : "{}";
            const message = JSON.parse(rawMessage) as OfficeAuthDialogMessage;
            if (message.type !== "mercy-office-auth") {
              return;
            }
            if (!message.ok || !message.access_token) {
              closeDialog();
              reject(new Error(message.error || "Mercy sign-in did not return a valid session token."));
              return;
            }
            persistOfficeSessionToken(message.access_token);
            closeDialog();
            resolve(initializeAuthHandoff());
          } catch {
            closeDialog();
            reject(new Error("Mercy sign-in response could not be read."));
          }
        });
        dialog.addEventHandler(Office.EventType.DialogEventReceived, () => {
          reject(new Error("Mercy sign-in dialog was closed before authentication completed."));
        });
      },
    );
  });
}

export async function beginOfficeHybridSignIn(surface: "Word" | "Outlook" | "Office" = "Office"): Promise<MercyAuthStatus> {
  try {
    return await beginOfficeNaaSignIn(surface, { allowSignInPrompt: true });
  } catch (error) {
    if (viteEnv?.VITE_MERCY_OFFICE_PKCE_FALLBACK_ENABLED === "false") {
      throw error;
    }
    return beginOfficePkceSignIn(surface);
  }
}

function scoreFromMetadata(metadata: CoreResponseMetadata): number {
  const status = metadata.guardrailStatus ?? metadata.groundingStatus;
  if (status === "pass") {
    return 24;
  }
  if (status === "block") {
    return 88;
  }
  const flags = metadata.reviewFlags?.length ?? 0;
  return Math.min(92, 58 + flags * 5);
}

function findingFromAgent(content: string, metadata: CoreResponseMetadata): RiskFinding[] {
  const excerpt = content.split(/\n+/).find((line) => line.trim().length > 20)?.trim() ?? "Mercy output requires attorney review.";
  return [
    {
      id: "agent-review",
      level: metadata.guardrailStatus === "pass" ? "low" : metadata.guardrailStatus === "block" ? "high" : "medium",
      title: "Mercy review signal",
      excerpt: excerpt.slice(0, 180),
      dcContext:
        "This output was routed through the MoE legal router and agent network with D.C. ethics, citation, grounding, and attorney-review checks.",
      recommendation:
        metadata.groundingStatus === "pass"
          ? "Verify official sources, record support, and final wording before use."
          : "Resolve grounding or guardrail warnings before relying on the output."
    }
  ];
}

function fallbackMetadata(reason: string): CoreResponseMetadata {
  const auth = authContext();
  return {
    source: "fallback",
    coreUrl: CORE_API_URL,
    humanReviewRequired: true,
    fallbackReason: `Core service temporarily unavailable - working in offline mode. ${reason}`,
    guardrailStatus: "warn",
    groundingStatus: "warn",
    cacheStatus: "queued",
    syncStatus: "queued for sync",
    retryWhenOnline: true,
    queuedRequestCount: queuedAgentRequestCount(),
    tenantId: auth.tenantId,
    userId: auth.userId,
    officialSourceGrounding: "core unavailable; official D.C. grounding pending"
  };
}

function fallbackAnalysis(documentText: string, reason: string): AnalysisResult {
  return {
    score: 78,
    summary:
      "Core service temporarily unavailable - working in offline mode. Mercy queued this review for the live agent network. Treat this as a local drafting aid only until sync completes.",
    findings: [
      {
        id: "offline-risk",
        level: "medium",
        title: "Live grounding unavailable",
        excerpt: documentText.slice(0, 160) || "No document text available.",
        dcContext: "D.C. attorney review, confidentiality, and source verification remain required.",
        recommendation: "Use Retry queue when online, then rerun the agent review before relying on this output."
      }
    ],
    core: fallbackMetadata(reason)
  };
}

function fallbackMessage(content: string, reason: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content,
    core: fallbackMetadata(reason)
  };
}

export async function getAgentSkills(): Promise<CoreMcpManifest | null> {
  purgeUnsafeStoredAgentData();
  try {
    const manifest = await coreFetch<CoreMcpManifest>("/v1/agent/skills");
    writeJson(`${CACHE_PREFIX}skills`, manifest);
    return manifest;
  } catch {
    return readJson<CoreMcpManifest | null>(`${CACHE_PREFIX}skills`, null);
  }
}

async function skillManifest(): Promise<CoreMcpManifest | null> {
  return getAgentSkills();
}

function schemaProperties(skill?: CoreMcpManifest["skills"][number]): Record<string, unknown> {
  const schema = skill?.input_schema;
  if (!schema || typeof schema !== "object") {
    return {};
  }
  const properties = (schema as { properties?: Record<string, unknown> }).properties;
  return properties && typeof properties === "object" ? properties : {};
}

function buildSkillParams(skillName: string, activeText: string, skill?: CoreMcpManifest["skills"][number]): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const properties = schemaProperties(skill);
  const normalizedText = activeText || "Selected Office content unavailable; reopen the Word document or Outlook message and try again.";
  for (const key of Object.keys(properties)) {
    if (key === "law_or_case") {
      params[key] = normalizedText || "D.C. Bar Ethics Op. 388";
    } else if (key === "draft" || key === "content" || key === "query") {
      params[key] = normalizedText;
    } else if (key === "matter_id") {
      params[key] = ACTIVE_MATTER_ID;
    } else if (key === "new_facts") {
      params[key] = { office_addin_note: normalizedText };
    } else if (key === "format") {
      params[key] = "docx";
    } else if (key === "matter_context") {
      params[key] = { matter_id: ACTIVE_MATTER_ID, jurisdiction: "District of Columbia" };
    }
  }
  if (!Object.keys(params).length) {
    return {
      law_or_case: normalizedText,
      draft: normalizedText,
      content: normalizedText,
      matter_id: ACTIVE_MATTER_ID,
      new_facts: { office_addin_note: normalizedText },
      format: "docx"
    };
  }
  return params;
}

export async function syncOfflineAgentQueue(): Promise<number> {
  purgeUnsafeStoredAgentData();
  if (!isOnline()) {
    return 0;
  }
  const queue = readJson<QueuedAgentRequest[]>(QUEUE_KEY, []);
  if (!queue.length) {
    return 0;
  }
  const remaining: QueuedAgentRequest[] = [];
  let synced = 0;
  for (const item of queue) {
    try {
      const response = await postAgent(item.request);
      saveCachedAgent(item.cacheKey, response);
      synced += 1;
    } catch {
      remaining.push(item);
    }
  }
  writeJson(QUEUE_KEY, remaining);
  return synced;
}

export function queuedAgentRequestCount(): number {
  purgeUnsafeStoredAgentData();
  return readJson<QueuedAgentRequest[]>(QUEUE_KEY, []).length;
}

export const api = {
  getAgentSkills,
  getTemplateGallery,
  getBetaStatus,
  listMatters,
  initializeAuthHandoff,
  beginOfficeNaaSignIn,
  beginOfficeHybridSignIn,
  beginOfficePkceSignIn,
  setActiveMatter,
  syncOfflineAgentQueue,
  queuedAgentRequestCount,
  recentSafeResponses,

  async analyzeDocument(documentText: string): Promise<AnalysisResult> {
    try {
      const intake = buildOfficeRequestContext({
        requested_relief: "Identify D.C. contract risks and attorney-review next steps.",
        key_facts: {
          workflow: "document_analysis",
          document_excerpt: documentText.slice(0, 1000)
        },
        documents: [{ document_id: "active-word-document", title: "Active Word document", source: "office_addin" }],
        missing_information: ["client objective", "counterparty name"],
        sensitivity_flags: ["confidential_client_document"]
      });
      const response = await agentExecute(
        "analyze_document",
        {
          task: "Analyze this D.C. legal document for contract risk, ethics guardrails, citations, and attorney review notes.",
          matter_id: intake.matter_id,
          matter_context: {
            matter_id: intake.matter_id,
            jurisdiction: "District of Columbia",
            document_text: documentText,
            attached_documents: ACTIVE_MATTER?.documents ?? [{ document_id: "active-word-document", title: "Active Word document", source: "office_addin" }]
          },
          params: {
            document_text: documentText,
            attached_document_ids: (ACTIVE_MATTER?.documents ?? []).map((document) => document.document_id ?? document.id).filter(Boolean),
            top_k: 4,
            format: "docx"
          }
        },
        "Preview fallback: document analysis queued for the Mercy agent network."
      );
      const content = agentContent(response);
      const metadata = metadataFromAgent(response, intake.matter_context, intake.intake_summary);
      return {
        score: scoreFromMetadata(metadata),
        summary: content,
        findings: findingFromAgent(content, metadata),
        core: metadata
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Agent analysis request failed";
      return fallbackAnalysis(documentText, reason);
    }
  },

  async explainClause(selectedText: string): Promise<ChatMessage> {
    try {
      const intake = buildOfficeRequestContext({
        requested_relief: "Explain selected clause with D.C. legal risk notes.",
        key_facts: {
          workflow: "selected_clause_explanation",
          selected_text: selectedText.slice(0, 1000)
        },
        documents: [{ document_id: "active-word-selection", title: "Selected Word clause", source: "office_addin_selection" }],
        missing_information: ["full agreement context"],
        sensitivity_flags: ["confidential_selected_text"]
      });
      const response = await agentExecute(
        "explain_clause",
        {
          task: "Explain this selected D.C. contract clause and identify attorney-review risks.",
          matter_id: intake.matter_id,
          matter_context: {
            matter_id: intake.matter_id,
            jurisdiction: "District of Columbia",
            selected_text: selectedText,
            attached_documents: ACTIVE_MATTER?.documents ?? [{ document_id: "active-word-selection", title: "Selected Word clause", source: "office_addin_selection" }]
          },
          params: {
            selected_text: selectedText,
            attached_document_ids: (ACTIVE_MATTER?.documents ?? []).map((document) => document.document_id ?? document.id).filter(Boolean),
            top_k: 4,
            format: "docx"
          }
        },
        "Preview fallback: clause explanation queued for the Mercy agent network."
      );
      return {
        id: crypto.randomUUID(),
        role: "assistant",
        content: agentContent(response),
        core: metadataFromAgent(response, intake.matter_context, intake.intake_summary)
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Agent clause explanation request failed";
      return fallbackMessage(
        "Preview fallback: this clause may allocate legal or financial responsibility. Reconnect to the Mercy core for grounded D.C. analysis.",
        reason
      );
    }
  },

  async draftRevision(instruction: string, context: string): Promise<ChatMessage> {
    try {
      const intake = buildOfficeRequestContext({
        requested_relief: instruction,
        key_facts: {
          workflow: "draft_revision",
          instruction,
          document_excerpt: context.slice(0, 1000)
        },
        documents: [{ document_id: "active-word-draft-context", title: "Active Word drafting context", source: "office_addin" }],
        missing_information: context ? [] : ["document context"],
        sensitivity_flags: ["confidential_drafting_context"]
      });
      const response = await agentExecute(
        "draft_revision",
        {
          task: `Draft or revise Word document language for D.C. attorney review: ${instruction}`,
          matter_id: intake.matter_id,
          matter_context: {
            matter_id: intake.matter_id,
            jurisdiction: "District of Columbia",
            document_text: context,
            attached_documents: ACTIVE_MATTER?.documents ?? [{ document_id: "active-word-draft-context", title: "Active Word drafting context", source: "office_addin" }]
          },
          params: {
            instruction,
            document_text: context,
            attached_document_ids: (ACTIVE_MATTER?.documents ?? []).map((document) => document.document_id ?? document.id).filter(Boolean),
            top_k: 4,
            format: "docx"
          }
        },
        "Preview fallback: drafting request queued for the Mercy agent network."
      );
      return {
        id: crypto.randomUUID(),
        role: "assistant",
        content: agentContent(response),
        core: metadataFromAgent(response, intake.matter_context, intake.intake_summary)
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Agent drafting request failed";
      return fallbackMessage(
        addReviewDisclaimer(
          "Core service temporarily unavailable - working in offline mode. Drafting was queued for the live Mercy agent network. Reconnect to the Mercy core and rerun with the active document open before relying on any revision."
        ),
        reason
      );
    }
  },

  async runMcpSkill(skillName: string, activeText: string): Promise<AgentActionResult> {
    const manifest = await skillManifest();
    const discoveredSkill = manifest?.skills.find((skill) => skill.name === skillName);
    const taskBySkill: Record<string, string> = {
      cite_and_verify: `Verify citation status and D.C. grounding for: ${activeText || "selected text"}`,
      check_dc_ethics: "Check D.C. ethics compliance, confidentiality, citation, and attorney-review flags.",
      update_matter_context: "Update matter context with attorney-approved Office document or email context.",
      export_to_word: "Draft export to Word using an Office.js-ready payload."
    };
    const skillParams = buildSkillParams(skillName, activeText, discoveredSkill);
    const response = await agentExecute(
      skillName,
      {
        task: taskBySkill[skillName] ?? discoveredSkill?.description ?? `Run MCP skill ${skillName}.`,
        matter_id: ACTIVE_MATTER_ID,
        matter_context: {
          matter_id: ACTIVE_MATTER_ID,
          jurisdiction: "District of Columbia",
          selected_text: activeText,
          attached_documents: ACTIVE_MATTER?.documents ?? [{ document_id: "active-office-selection", title: "Selected Office content", source: "office_addin" }]
        },
        params: skillParams
      },
      `Preview fallback: ${skillName} queued for sync.`
    );
    return {
      title: skillName.replace(/_/g, " "),
      content: agentContent(response),
      core: metadataFromAgent(response, undefined, undefined, response.agent_network_version === "offline-fallback" ? "queued" : "live")
    };
  },

  async generateTemplate(template: CoreTemplateGalleryItem, documentText: string): Promise<AgentActionResult> {
    try {
      const intake = buildOfficeRequestContext({
        requested_relief: template.generation_task,
        matter: {
          matter_name: `${template.title} - Word matter`,
          matter_type: template.matter_type,
          jurisdiction: "District of Columbia",
          client_role: "client"
        },
        key_facts: {
          workflow: "template_gallery_generation",
          template_id: template.template_id,
          practice_area: template.practice_area,
          document_excerpt: documentText.slice(0, 1000)
        },
        documents: documentText
          ? [{ document_id: "active-word-template-context", title: "Active Word context", source: "office_addin" }]
          : [],
        missing_information: template.required_inputs,
        sensitivity_flags: ["confidential_template_generation_context"]
      });
      const response = await agentExecute(
        `template_${template.template_id}`,
        {
          task: template.generation_task,
          matter_id: intake.matter_id,
          matter_context: {
            matter_id: intake.matter_id,
            jurisdiction: "District of Columbia",
            matter_type: template.matter_type,
            practice_area: template.practice_area,
            document_text: documentText,
            attached_documents: ACTIVE_MATTER?.documents ?? []
          },
          params: {
            template_id: template.template_id,
            prompt_template_id: template.prompt_template_id,
            template_title: template.title,
            required_inputs: template.required_inputs,
            source_query: template.source_query,
            attached_document_ids: (ACTIVE_MATTER?.documents ?? []).map((document) => document.document_id ?? document.id).filter(Boolean),
            top_k: 5,
            format: "docx"
          }
        },
        `Preview fallback: ${template.title} generation queued for the Mercy agent network.`
      );
      return {
        title: template.title,
        content: agentContent(response),
        core: metadataFromAgent(response, intake.matter_context, intake.intake_summary, response.agent_network_version === "offline-fallback" ? "queued" : "live")
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Template generation request failed";
      return {
        title: template.title,
        content: addReviewDisclaimer(
          "Core service temporarily unavailable - working in offline mode. Template generation was queued for the live Mercy agent network."
        ),
        core: fallbackMetadata(reason)
      };
    }
  },

  async submitFeedback(payload: {
    rating: "up" | "down";
    comment?: string;
    action?: string;
    trace_id?: string;
    route_expert?: string;
    guardrail_status?: string;
    template_id?: string;
  }): Promise<void> {
    await coreFetch("/v1/beta/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }
};
