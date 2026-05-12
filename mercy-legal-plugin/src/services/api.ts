/*
Purpose: Agent-network client for the Mercy Word add-in.

All legal work routes through the FastAPI MoE router and LangGraph-compatible
agent network. The service keeps a small local cache/queue so drafting and
review workflows remain usable when the core is temporarily offline.
*/

import {
  AgentActionResult,
  AnalysisResult,
  ChatMessage,
  CoreMatterContext,
  CoreMcpManifest,
  CoreMcpSkillResult,
  CoreResponseMetadata,
  RiskFinding
} from "../types";

const DEFAULT_CORE_URL = "http://127.0.0.1:8000";
const viteEnv = (import.meta as ImportMeta & { env?: { VITE_MERCY_CORE_API_URL?: string } }).env;
const CORE_API_URL = (viteEnv?.VITE_MERCY_CORE_API_URL || DEFAULT_CORE_URL).replace(/\/+$/, "");
const MATTER_ID = "word-addin-session-matter";
const CACHE_PREFIX = "mercy-agent-cache:";
const QUEUE_KEY = "mercy-agent-offline-queue";
let unsafeStoragePurged = false;

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
    matter_id: request.matter_id ?? MATTER_ID,
    surface_context: request.surface_context ?? "mercy_legal_plugin",
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
  writeJson(cacheKeyValue, storageSafeResponse(response));
}

async function coreFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${CORE_API_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
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

async function postCoreIntake(payload: Record<string, unknown>): Promise<CoreIntakeResponse> {
  return coreFetch<CoreIntakeResponse>("/v1/matter/intake/full", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      matter_id: MATTER_ID,
      client: {
        client_id: "word-addin-client",
        client_name: "Word add-in client"
      },
      matter: {
        matter_name: "Word document review",
        matter_type: "document review and drafting",
        jurisdiction: "District of Columbia",
        client_role: "client",
        opposing_parties: ["counterparty pending"]
      },
      conflicts: {
        checked: false,
        status: "incomplete",
        opposing_parties: ["counterparty pending"]
      },
      scope: {
        confirmed: false,
        scope_of_work: "Review active Word document and prepare attorney review notes.",
        excluded_work: ["final legal advice without attorney approval"],
        client_responsibilities: ["confirm counterparty identity", "provide complete agreement"]
      },
      consent: {
        sensitivity_flags: ["confidential_word_document"]
      },
      surface_context: "mercy_legal_plugin",
      user_type: "solo",
      ...payload
    })
  });
}

async function postAgent(request: AgentRequest): Promise<CoreAgentResponse> {
  return coreFetch<CoreAgentResponse>("/v1/agent/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      matter_id: MATTER_ID,
      matter_context: {
        jurisdiction: "District of Columbia",
        surface_context: "mercy_legal_plugin",
        ...(request.matter_context ?? {})
      },
      user_type: "solo",
      surface_context: "mercy_legal_plugin",
      ...request
    })
  });
}

async function agentExecute(action: string, request: AgentRequest, fallbackText: string): Promise<CoreAgentResponse> {
  purgeUnsafeStoredAgentData();
  const key = cacheKey(action, request);
  if (!isOnline()) {
    queueRequest(action, key, request);
    const cached = cachedAgent(key);
    if (cached) {
      return { ...cached, guardrail_status: cached.guardrail_status ?? "warn" };
    }
    throw new Error("Core offline; request queued for sync.");
  }

  try {
    const response = await postAgent(request);
    saveCachedAgent(key, response);
    return response;
  } catch (error) {
    queueRequest(action, key, request);
    const cached = cachedAgent(key);
    if (cached) {
      return cached;
    }
    const reason = error instanceof Error ? error.message : "Agent request failed";
    return fallbackAgentResponse(action, request.task, `${fallbackText}\n\nOffline queue: ${reason}`);
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
      answer: content,
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

function agentContent(response: CoreAgentResponse): string {
  const result = response.agent_result ?? {};
  const direct = result.draft ?? result.answer ?? result.summary;
  if (typeof direct === "string" && direct.trim()) {
    return direct;
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
  return "Mercy agent response requires attorney review.";
}

function metadataFromAgent(
  response: CoreAgentResponse,
  matterContext?: CoreMatterContext,
  intakeSummary?: CoreResponseMetadata["intakeSummary"],
  cacheStatus: CoreResponseMetadata["cacheStatus"] = "live"
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
    syncStatus: cacheStatus === "live" ? "live core" : "offline queue",
    skillResults: response.mcp_skill_results ?? []
  };
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
  const excerpt = content.split(/\n+/).find((line) => line.trim().length > 20)?.trim() ?? "Agent output requires attorney review.";
  return [
    {
      id: "agent-review",
      level: metadata.guardrailStatus === "pass" ? "low" : metadata.guardrailStatus === "block" ? "high" : "medium",
      title: "Agent network review signal",
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
  return {
    source: "fallback",
    coreUrl: CORE_API_URL,
    humanReviewRequired: true,
    fallbackReason: reason,
    guardrailStatus: "warn",
    groundingStatus: "warn",
    cacheStatus: "queued",
    syncStatus: "queued for sync"
  };
}

function fallbackAnalysis(documentText: string, reason: string): AnalysisResult {
  return {
    score: 78,
    summary:
      "Preview fallback: Mercy queued this review for the live agent network. Treat this as a local drafting aid only until sync completes.",
    findings: [
      {
        id: "offline-risk",
        level: "medium",
        title: "Live grounding unavailable",
        excerpt: documentText.slice(0, 160) || "No document text available.",
        dcContext: "D.C. attorney review, confidentiality, and source verification remain required.",
        recommendation: "Reconnect to the Mercy core and rerun the agent review before relying on this output."
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
  syncOfflineAgentQueue,
  queuedAgentRequestCount,

  async analyzeDocument(documentText: string): Promise<AnalysisResult> {
    try {
      const intake = await postCoreIntake({
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
            document_text: documentText
          },
          params: {
            document_text: documentText,
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
      const intake = await postCoreIntake({
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
            selected_text: selectedText
          },
          params: {
            selected_text: selectedText,
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
      const intake = await postCoreIntake({
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
            document_text: context
          },
          params: {
            instruction,
            document_text: context,
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
        "Preview fallback: Party responsibility is limited to direct losses arising from its own breach, negligence, or willful misconduct, subject to applicable District of Columbia law.",
        reason
      );
    }
  },

  async runMcpSkill(skillName: string, activeText: string): Promise<AgentActionResult> {
    const taskBySkill: Record<string, string> = {
      cite_and_verify: `Verify citation status and D.C. grounding for: ${activeText || "selected text"}`,
      check_dc_ethics: "Check D.C. ethics compliance, confidentiality, citation, and attorney-review flags.",
      update_matter_context: "Update matter context with new Word document facts.",
      export_to_word: "Draft export to Word using Office.js-ready payload."
    };
    const paramsBySkill: Record<string, Record<string, unknown>> = {
      cite_and_verify: { law_or_case: activeText || "D.C. Bar Ethics Op. 388" },
      check_dc_ethics: { draft: activeText, content: activeText },
      update_matter_context: { matter_id: MATTER_ID, new_facts: { word_addin_note: activeText || "Matter reviewed in Word add-in." } },
      export_to_word: { content: activeText || "Mercy export payload pending attorney review.", format: "docx" }
    };
    const response = await agentExecute(
      skillName,
      {
        task: taskBySkill[skillName] ?? `Run MCP skill ${skillName}.`,
        matter_id: MATTER_ID,
        matter_context: { matter_id: MATTER_ID, jurisdiction: "District of Columbia", selected_text: activeText },
        params: paramsBySkill[skillName] ?? {}
      },
      `Preview fallback: ${skillName} queued for sync.`
    );
    return {
      title: skillName.replace(/_/g, " "),
      content: agentContent(response),
      core: metadataFromAgent(response, undefined, undefined, response.agent_network_version === "offline-fallback" ? "queued" : "live")
    };
  }
};
