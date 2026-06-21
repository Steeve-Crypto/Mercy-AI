import {
  agentEnvelopeFixture,
  expect,
  expectReliabilityPanel,
  installMercySession,
  mockAgentResponse,
  seedMatter,
  test,
  uniqueName,
} from "./helpers";
import type { Page } from "@playwright/test";

test.describe.configure({ mode: "parallel" });

async function runMercyChat(page: Page, prompt: string) {
  await page.getByPlaceholder(/Ask (Agent X|Mercy)/i).fill(prompt);
  await page.getByRole("button", { name: /Run Mercy|Send/i }).click();
}

test("chat returns an Agent X response with the full Reliability Panel", async ({ page, request }, testInfo) => {
  await installMercySession(page);
  await mockAgentResponse(page, agentEnvelopeFixture());
  const matter = await seedMatter(request, uniqueName("D.C. indemnity analysis", testInfo));

  await page.goto(`/chat?matterId=${encodeURIComponent(matter.matter_id)}`);
  await runMercyChat(
    page,
    "Analyze enforceability risks under District of Columbia law for a commercial lease indemnity clause that shifts all negligence liability to a small business tenant. Cite only verified D.C. authority and flag attorney review issues.",
  );

  await expect(page.getByText(/Agent X/i).last()).toBeVisible({ timeout: 60_000 });
  await expectReliabilityPanel(page);
  await expect(page.getByTestId("agent-route")).not.toContainText(/No route yet/i);
  await expect(page.getByTestId("agent-confidence")).toContainText(/\d+%|%/);
});

test("missing citations show a reliability warning", async ({ page, request }, testInfo) => {
  await installMercySession(page);
  await mockAgentResponse(
    page,
    agentEnvelopeFixture({
      citations: [],
      guardrailStatus: "warn",
      groundingStatus: "warn",
      humanReviewRequired: true,
      answer: "No verified citations were available for this D.C. claim.",
    }),
  );
  const matter = await seedMatter(request, uniqueName("D.C. missing citation warning", testInfo));

  await page.goto(`/chat?matterId=${encodeURIComponent(matter.matter_id)}`);
  await runMercyChat(page, "Assess a D.C. wage claim but identify missing citation support.");

  await expectReliabilityPanel(page);
  await expect(page.getByTestId("guardrail-status")).toContainText(/warn/i);
  await expect(page.getByTestId("citations-panel")).toContainText(/did not retrieve source support/i);
});

test("low confidence response requires attorney review", async ({ page, request }, testInfo) => {
  await installMercySession(page);
  await mockAgentResponse(
    page,
    agentEnvelopeFixture({
      confidence: 0.41,
      guardrailStatus: "warn",
      groundingStatus: "warn",
      humanReviewRequired: true,
      answer: "Low-confidence D.C. analysis returned for review.",
    }),
  );
  const matter = await seedMatter(request, uniqueName("D.C. low confidence warning", testInfo));

  await page.goto(`/chat?matterId=${encodeURIComponent(matter.matter_id)}`);
  await runMercyChat(page, "Analyze an ambiguous D.C. ethics issue with limited facts.");

  await expectReliabilityPanel(page);
  await expect(page.getByTestId("agent-confidence")).toContainText(/41%/);
  await expect(page.getByTestId("attorney-review-flag")).toContainText(/Required before relying/i);
});

test("unsupported legal claim triggers guardrail and grounding warning", async ({ page, request }, testInfo) => {
  await installMercySession(page);
  await mockAgentResponse(
    page,
    agentEnvelopeFixture({
      confidence: 0.52,
      guardrailStatus: "block",
      groundingStatus: "block",
      citations: [],
      humanReviewRequired: true,
      missingInputs: ["verified D.C. authority", "client-specific facts"],
      answer: "Unsupported claim blocked pending D.C. grounding.",
    }),
  );
  const matter = await seedMatter(request, uniqueName("D.C. unsupported claim warning", testInfo));

  await page.goto(`/chat?matterId=${encodeURIComponent(matter.matter_id)}`);
  await runMercyChat(page, "Assert an unsupported D.C. legal rule without citations.");

  await expectReliabilityPanel(page);
  await expect(page.getByTestId("guardrail-status")).toContainText(/block/i);
  await expect(page.getByTestId("grounding-status")).toContainText(/block/i);
  await expect(page.getByText(/Missing inputs: verified D\.C\. authority/i)).toBeVisible();
});

test("missing D.C. grounding remains visible in the Reliability Panel", async ({ page, request }, testInfo) => {
  await installMercySession(page);
  await mockAgentResponse(
    page,
    agentEnvelopeFixture({
      citations: [
        {
          label: "Unverified secondary blog",
          source_type: "secondary_source",
          verification_status: "unverified",
          note: "Secondary commentary only; District of Columbia source metadata was not returned.",
        },
      ],
      guardrailStatus: "warn",
      groundingStatus: "warn",
      humanReviewRequired: true,
      answer: "D.C. grounding is incomplete and requires source verification.",
    }),
  );
  const matter = await seedMatter(request, uniqueName("D.C. grounding missing warning", testInfo));

  await page.goto(`/chat?matterId=${encodeURIComponent(matter.matter_id)}`);
  await runMercyChat(page, "Review D.C. citation grounding for a consumer protection demand.");

  await expectReliabilityPanel(page);
  await expect(page.getByTestId("dc-grounding")).toContainText(/Source verification required before use/i);
});
