# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: chat-reliability.spec.ts >> missing D.C. grounding remains visible in the Reliability Panel
- Location: tests\e2e\chat-reliability.spec.ts:106:5

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.fill: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByPlaceholder(/Ask (Agent X|Mercy)/i)

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - link "Mercy.ai" [ref=e5] [cursor=pointer]:
        - /url: /
        - img [ref=e7]
        - generic [ref=e11]: Mercy.ai
      - generic [ref=e12]:
        - paragraph [ref=e13]: Secure firm access
        - heading "Enter the DC legal AI workspace." [level=1] [ref=e14]
        - paragraph [ref=e15]: Auth pages are ready for Clerk/Auth.js connection. The current experience keeps the flow visible while provider keys are added.
        - generic [ref=e16]:
          - generic [ref=e17]:
            - img [ref=e18]
            - text: Matter-isolated workspace
          - generic [ref=e21]:
            - img [ref=e22]
            - text: Word plugin download access
          - generic [ref=e25]:
            - img [ref=e26]
            - text: Stripe subscription checkout
    - generic [ref=e30]:
      - link "Back to home" [ref=e31] [cursor=pointer]:
        - /url: /
        - img
        - text: Back to home
      - generic [ref=e32]:
        - generic [ref=e33]:
          - img [ref=e35]
          - generic [ref=e38]:
            - heading "Welcome back" [level=2] [ref=e39]
            - paragraph [ref=e40]: Sign in to continue to your matters.
        - generic [ref=e41]:
          - generic [ref=e42]:
            - text: Work email
            - textbox "Work email" [ref=e43]:
              - /placeholder: attorney@firm.com
          - generic [ref=e44]:
            - text: Password
            - textbox "Password" [ref=e45]:
              - /placeholder: Enter password
          - button "Sign in" [ref=e46]
        - paragraph [ref=e47]:
          - text: New to Mercy.ai?
          - link "Create account" [ref=e48] [cursor=pointer]:
            - /url: /sign-up
  - button "Open Next.js Dev Tools" [ref=e54] [cursor=pointer]:
    - img [ref=e55]
  - alert [ref=e58]
```

# Test source

```ts
  1   | import {
  2   |   agentEnvelopeFixture,
  3   |   expect,
  4   |   expectReliabilityPanel,
  5   |   installMercySession,
  6   |   mockAgentResponse,
  7   |   seedMatter,
  8   |   test,
  9   |   uniqueName,
  10  | } from "./helpers";
  11  | import type { Page } from "@playwright/test";
  12  | 
  13  | test.describe.configure({ mode: "parallel" });
  14  | 
  15  | async function runMercyChat(page: Page, prompt: string) {
> 16  |   await page.getByPlaceholder(/Ask (Agent X|Mercy)/i).fill(prompt);
      |                                                       ^ Error: locator.fill: Test timeout of 60000ms exceeded.
  17  |   await page.getByRole("button", { name: /Run Mercy|Send/i }).click();
  18  | }
  19  | 
  20  | test("chat returns an Agent X response with the full Reliability Panel", async ({ page, request }, testInfo) => {
  21  |   await installMercySession(page);
  22  |   await mockAgentResponse(page, agentEnvelopeFixture());
  23  |   const matter = await seedMatter(request, uniqueName("D.C. indemnity analysis", testInfo));
  24  | 
  25  |   await page.goto(`/chat?matterId=${encodeURIComponent(matter.matter_id)}`);
  26  |   await runMercyChat(
  27  |     page,
  28  |     "Analyze enforceability risks under District of Columbia law for a commercial lease indemnity clause that shifts all negligence liability to a small business tenant. Cite only verified D.C. authority and flag attorney review issues.",
  29  |   );
  30  | 
  31  |   await expect(page.getByText(/Agent X/i).last()).toBeVisible({ timeout: 60_000 });
  32  |   await expectReliabilityPanel(page);
  33  |   await expect(page.getByTestId("agent-route")).not.toContainText(/No route yet/i);
  34  |   await expect(page.getByTestId("agent-confidence")).toContainText(/\d+%|%/);
  35  | });
  36  | 
  37  | test("missing citations show a reliability warning", async ({ page, request }, testInfo) => {
  38  |   await installMercySession(page);
  39  |   await mockAgentResponse(
  40  |     page,
  41  |     agentEnvelopeFixture({
  42  |       citations: [],
  43  |       guardrailStatus: "warn",
  44  |       groundingStatus: "warn",
  45  |       humanReviewRequired: true,
  46  |       answer: "No verified citations were available for this D.C. claim.",
  47  |     }),
  48  |   );
  49  |   const matter = await seedMatter(request, uniqueName("D.C. missing citation warning", testInfo));
  50  | 
  51  |   await page.goto(`/chat?matterId=${encodeURIComponent(matter.matter_id)}`);
  52  |   await runMercyChat(page, "Assess a D.C. wage claim but identify missing citation support.");
  53  | 
  54  |   await expectReliabilityPanel(page);
  55  |   await expect(page.getByTestId("guardrail-status")).toContainText(/warn/i);
  56  |   await expect(page.getByTestId("citations-panel")).toContainText(/did not retrieve source support/i);
  57  | });
  58  | 
  59  | test("low confidence response requires attorney review", async ({ page, request }, testInfo) => {
  60  |   await installMercySession(page);
  61  |   await mockAgentResponse(
  62  |     page,
  63  |     agentEnvelopeFixture({
  64  |       confidence: 0.41,
  65  |       guardrailStatus: "warn",
  66  |       groundingStatus: "warn",
  67  |       humanReviewRequired: true,
  68  |       answer: "Low-confidence D.C. analysis returned for review.",
  69  |     }),
  70  |   );
  71  |   const matter = await seedMatter(request, uniqueName("D.C. low confidence warning", testInfo));
  72  | 
  73  |   await page.goto(`/chat?matterId=${encodeURIComponent(matter.matter_id)}`);
  74  |   await runMercyChat(page, "Analyze an ambiguous D.C. ethics issue with limited facts.");
  75  | 
  76  |   await expectReliabilityPanel(page);
  77  |   await expect(page.getByTestId("agent-confidence")).toContainText(/41%/);
  78  |   await expect(page.getByTestId("attorney-review-flag")).toContainText(/Required before relying/i);
  79  | });
  80  | 
  81  | test("unsupported legal claim triggers guardrail and grounding warning", async ({ page, request }, testInfo) => {
  82  |   await installMercySession(page);
  83  |   await mockAgentResponse(
  84  |     page,
  85  |     agentEnvelopeFixture({
  86  |       confidence: 0.52,
  87  |       guardrailStatus: "block",
  88  |       groundingStatus: "block",
  89  |       citations: [],
  90  |       humanReviewRequired: true,
  91  |       missingInputs: ["verified D.C. authority", "client-specific facts"],
  92  |       answer: "Unsupported claim blocked pending D.C. grounding.",
  93  |     }),
  94  |   );
  95  |   const matter = await seedMatter(request, uniqueName("D.C. unsupported claim warning", testInfo));
  96  | 
  97  |   await page.goto(`/chat?matterId=${encodeURIComponent(matter.matter_id)}`);
  98  |   await runMercyChat(page, "Assert an unsupported D.C. legal rule without citations.");
  99  | 
  100 |   await expectReliabilityPanel(page);
  101 |   await expect(page.getByTestId("guardrail-status")).toContainText(/block/i);
  102 |   await expect(page.getByTestId("grounding-status")).toContainText(/block/i);
  103 |   await expect(page.getByText(/Missing inputs: verified D\.C\. authority/i)).toBeVisible();
  104 | });
  105 | 
  106 | test("missing D.C. grounding remains visible in the Reliability Panel", async ({ page, request }, testInfo) => {
  107 |   await installMercySession(page);
  108 |   await mockAgentResponse(
  109 |     page,
  110 |     agentEnvelopeFixture({
  111 |       citations: [
  112 |         {
  113 |           label: "Unverified secondary blog",
  114 |           source_type: "secondary_source",
  115 |           verification_status: "unverified",
  116 |           note: "Secondary commentary only; District of Columbia source metadata was not returned.",
```