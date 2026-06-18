import { test as base, expect, type APIRequestContext, type Page, type Route, type TestInfo } from "@playwright/test";
import { Buffer } from "node:buffer";

export { expect };

export const test = base.extend({
  page: async ({ context, page }, use) => {
    await context.clearCookies();
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await use(page);
  },
});

export const coreUrl = process.env.NEXT_PUBLIC_MERCY_CORE_API_URL || process.env.MERCY_CORE_API_URL || "http://127.0.0.1:8000";
export const tenantId = process.env.MERCY_TENANT_ID || process.env.NEXT_PUBLIC_MERCY_TENANT_ID || "playwright-tenant";
export const userId = process.env.MERCY_USER_ID || process.env.NEXT_PUBLIC_MERCY_USER_ID || "playwright-user";
export const apiToken =
  process.env.MERCY_API_TOKEN || process.env.MERCY_CORE_API_TOKEN || process.env.NEXT_PUBLIC_MERCY_API_TOKEN || "playwright-local-token";

export function uniqueName(prefix: string, testInfo?: TestInfo): string {
  const worker = testInfo ? `w${testInfo.workerIndex}` : "w";
  return `${prefix} ${worker} ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`;
}

export function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${apiToken}`,
    "X-Mercy-Tenant-Id": tenantId,
    "X-Mercy-User-Id": userId,
    "X-Mercy-Roles": "attorney",
  };
}

export async function installMercySession(page: Page): Promise<void> {
  await page.addInitScript(
    ({ token, tenant, user }) => {
      window.localStorage.setItem("mercy.auth.token", token);
      window.localStorage.setItem("mercy.auth.tenantId", tenant);
      window.localStorage.setItem("mercy.auth.userId", user);
      window.localStorage.setItem("mercy.auth.roles", "attorney");
    },
    { token: apiToken, tenant: tenantId, user: userId },
  );
}

export async function seedMatter(request: APIRequestContext, name = uniqueName("D.C. lease review")) {
  const response = await request.post(`${coreUrl}/v1/matters`, {
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    data: {
      name,
      client_name: "Capitol Row Tenant Association",
      matter_type: "D.C. commercial lease review",
      tier: "free",
    },
  });
  if (!response.ok()) {
    throw new Error(`Matter seed failed with ${response.status()}: ${await response.text()}`);
  }
  return response.json() as Promise<{ matter_id: string; name: string }>;
}

export async function seedMatterDocument(
  request: APIRequestContext,
  matter: { matter_id: string; name?: string },
  filename: string,
) {
  const document = {
    document_id: filename.toLowerCase().replace(/[^a-z0-9-_]+/g, "-"),
    filename,
    title: filename,
    mime_type: "application/pdf",
    type: "application/pdf",
    status: "Ready",
    extraction_status: "Ready",
    extraction_progress: 100,
    uploaded_at: new Date().toISOString(),
    size: 2048,
    facts_extracted: 2,
    citation_count: 1,
    storage_path: `playwright/${filename}`,
  };
  const response = await request.post(`${coreUrl}/v1/matter/intake`, {
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    data: {
      matter_id: matter.matter_id,
      name: matter.name,
      jurisdiction: "District of Columbia",
      matter_type: "D.C. commercial lease review",
      documents: [document],
      surface_context: "playwright_document_seed",
    },
  });
  if (!response.ok()) {
    throw new Error(`Document seed failed with ${response.status()}: ${await response.text()}`);
  }
  return document;
}

export function pdfFixture(testInfo: TestInfo, name = "dc-lease-notice.pdf") {
  const body = [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >> endobj",
    "4 0 obj << /Length 79 >> stream",
    "BT /F1 12 Tf 36 96 Td (D.C. lease notice and cure rights for attorney review.) Tj ET",
    "endstream endobj",
    "xref",
    "0 5",
    "0000000000 65535 f ",
    "0000000009 00000 n ",
    "0000000058 00000 n ",
    "0000000115 00000 n ",
    "0000000203 00000 n ",
    "trailer << /Root 1 0 R /Size 5 >>",
    "startxref",
    "331",
    "%%EOF",
  ].join("\n");
  return {
    name: `pw-${Math.random().toString(36).slice(2, 8)}-${name}`,
    mimeType: "application/pdf",
    buffer: Buffer.from(body, "utf8"),
  };
}

type AgentFixtureOptions = {
  confidence?: number;
  guardrailStatus?: "pass" | "warn" | "block";
  groundingStatus?: "pass" | "warn" | "block";
  citations?: Array<Record<string, string>>;
  humanReviewRequired?: boolean;
  missingInputs?: string[];
  answer?: string;
};

export function agentEnvelopeFixture(options: AgentFixtureOptions = {}) {
  const confidence = options.confidence ?? 0.82;
  const guardrailStatus = options.guardrailStatus ?? "pass";
  const citations = options.citations ?? [
    {
      label: "D.C. Code official source",
      source_type: "official_dc_statute",
      verification_status: "verified",
      note: "Official D.C. source metadata returned for attorney verification.",
    },
  ];
  const route = {
    router_version: "playwright",
    route_mode: "analysis",
    expert: "dc_research",
    expert_label: "D.C. Legal Research",
    confidence,
    selected_capability: "analysis",
    guardrail_status: guardrailStatus,
    guardrail_profile: {
      status: guardrailStatus,
      required_checks: ["citation_verification", "attorney_review"],
      review_flags: guardrailStatus === "pass" ? [] : ["grounding_warning"],
    },
    citations,
    missing_inputs: options.missingInputs ?? [],
    alternate_routes: [],
    fallback_path: "attorney_review",
    surface_context: "mercy_legal_web",
    premium_gate: "none",
    next_action: "review",
    execute: true,
    user_type: "solo",
    safety_notes: ["Attorney review required before relying on legal output."],
    confidentiality: {
      mode: "tenant_isolated",
      training_use: "none",
      redaction_required_for_observability: true,
    },
  };
  const envelope = {
    envelope_version: "playwright",
    route,
    expert: "dc_research",
    confidence_score: confidence,
    guardrail_status: guardrailStatus,
    citations,
    dc_ethics_metadata: {
      human_review_required: options.humanReviewRequired ?? (confidence < 0.7 || guardrailStatus !== "pass"),
      confidentiality_required: true,
      citation_verification_required: true,
      record_verification_required: true,
      fee_reasonableness_required: false,
      dc_bar_ethics_opinion: "D.C. attorney review required for AI-assisted output.",
      guardrail_status: guardrailStatus,
      review_flags: guardrailStatus === "pass" ? [] : ["grounding_warning"],
      data_posture: "tenant_isolated",
      training_use: "none",
    },
    matter_context_snapshot: {
      reference: "playwright",
      hash: "playwright",
      storage_mode: "test",
    },
    audit_timestamp: new Date().toISOString(),
  };
  return {
    agent_network_version: "playwright",
    selected_agent: "dc_research",
    selected_expert: "dc_research",
    task: "Playwright reliability fixture",
    agent_result: {
      answer: options.answer ?? "Reliability fixture response for D.C. attorney review.",
    },
    citations,
    grounding_policy: {
      status: options.groundingStatus ?? guardrailStatus,
      strict_grounding: true,
      no_unverified_output: true,
      issues: guardrailStatus === "pass" ? [] : ["D.C. grounding or citation verification requires review."],
      instruction: "Do not rely on this output until verified by a D.C. attorney.",
    },
    trace_id: `pw-${Date.now()}`,
    langsmith_project_url: "https://smith.langchain.com/o/playwright/projects/mercy",
    response_envelope: envelope,
    route,
    expert: "dc_research",
    confidence_score: confidence,
    guardrail_status: guardrailStatus,
    dc_ethics_metadata: envelope.dc_ethics_metadata,
    matter_context_snapshot: envelope.matter_context_snapshot,
    audit_timestamp: envelope.audit_timestamp,
    human_review_required: envelope.dc_ethics_metadata.human_review_required,
  };
}

export async function mockAgentResponse(page: Page, fixture: ReturnType<typeof agentEnvelopeFixture>): Promise<void> {
  const handler = async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fixture),
    });
  };
  await page.route("**/v1/agent/execute", handler);
  await page.route("**/api/core/v1/agent/execute", handler);
}

export async function mockFullMatterIntake(page: Page, matterName: string, matterId?: string): Promise<string> {
  const resolvedMatterId = matterId ?? `pw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const handler = async (route: Route) => {
    const fixture = agentEnvelopeFixture();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        matter_id: resolvedMatterId,
        updated: true,
        matter_context: {
          matter_id: resolvedMatterId,
          name: matterName,
          client_id: "playwright-client",
          client_name: "Anacostia Small Business Coalition",
          matter_type: "D.C. consumer protection",
          jurisdiction: "District of Columbia",
          tier: "free",
          created_at: new Date().toISOString(),
          facts: {},
          drafts: [],
          billing_events: [],
          documents: [],
        },
        response_envelope: fixture.response_envelope,
        route: fixture.route,
        expert: fixture.expert,
        confidence_score: fixture.confidence_score,
        guardrail_status: fixture.guardrail_status,
        citations: fixture.citations,
        dc_ethics_metadata: fixture.dc_ethics_metadata,
        matter_context_snapshot: fixture.matter_context_snapshot,
        audit_timestamp: fixture.audit_timestamp,
        human_review_required: fixture.human_review_required,
        intake_flow_version: "playwright",
        intake_summary: {
          version: "playwright",
          matter_id: resolvedMatterId,
          matter_name: matterName,
          jurisdiction: "District of Columbia",
          document_count: 0,
          deadline_count: 1,
          missing_information_count: 0,
          conflict_status: "started",
          scope_status: "reviewed",
          ready_for_attorney_review: true,
        },
        conflict_check: {
          status: "started",
          checked: true,
          human_review_required: true,
          opposing_parties: ["District vendor", "property manager"],
          related_parties: [],
          warnings: [],
        },
        scope_confirmation: {
          status: "reviewed",
          excluded_work: [],
          client_responsibilities: [],
          attorney_approval_required: true,
        },
        prompt_library: {
          version: "playwright",
          jurisdiction: "District of Columbia",
          prompts: [],
        },
        next_steps: ["Open matter detail"],
      }),
    });
  };
  await page.route("**/v1/matter/intake/full", handler);
  await page.route("**/api/core/v1/matter/intake/full", handler);
  return resolvedMatterId;
}

export async function expectReliabilityPanel(page: Page): Promise<void> {
  const panel = page.getByTestId("reliability-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("agent-route")).toBeVisible();
  await expect(page.getByTestId("agent-confidence")).toBeVisible();
  await expect(panel.getByText(/Guardrails/i)).toBeVisible();
  await expect(page.getByTestId("citations-panel")).toBeVisible();
  await expect(page.getByTestId("attorney-review-flag")).toBeVisible();
  await expect(page.getByTestId("trace-panel")).toBeVisible();
  await expect(page.getByTestId("dc-grounding")).toBeVisible();
}
