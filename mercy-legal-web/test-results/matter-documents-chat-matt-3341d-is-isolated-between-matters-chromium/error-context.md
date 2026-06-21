# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: matter-documents-chat.spec.ts >> matter document context is isolated between matters
- Location: tests\e2e\matter-documents-chat.spec.ts:29:5

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /Documents/i })

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
  1  | import { expect, installMercySession, pdfFixture, seedMatter, seedMatterDocument, test, uniqueName } from "./helpers";
  2  | 
  3  | test.describe.configure({ mode: "parallel" });
  4  | 
  5  | test("matter documents tab uploads a PDF and attaches it to chat", async ({ page, request }, testInfo) => {
  6  |   await installMercySession(page);
  7  |   const matter = await seedMatter(request, uniqueName("D.C. commercial lease documents", testInfo));
  8  |   const pdf = pdfFixture(testInfo);
  9  |   await seedMatterDocument(request, matter, pdf.name);
  10 | 
  11 |   await page.goto(`/matters/${matter.matter_id}`);
  12 |   await page.getByRole("button", { name: /Documents/i }).click();
  13 |   await expect(page.getByTestId("matter-document-card").filter({ hasText: pdf.name })).toBeVisible({
  14 |     timeout: 45_000,
  15 |   });
  16 |   const attachHref = await page
  17 |     .getByTestId("matter-document-card")
  18 |     .filter({ hasText: pdf.name })
  19 |     .getByRole("link", { name: /Use in Mercy/i })
  20 |     .getAttribute("href");
  21 |   if (!attachHref) throw new Error("Attach link did not expose an href");
  22 |   await page.goto(attachHref);
  23 | 
  24 |   await expect(page).toHaveURL(/\/chat\?matterId=.*attachedDocs=.*attached=1/);
  25 |   await expect(page.getByText(/Document attached to Agent X/i)).toBeVisible();
  26 |   await expect(page.getByText(pdf.name)).toBeVisible();
  27 | });
  28 | 
  29 | test("matter document context is isolated between matters", async ({ page, request }, testInfo) => {
  30 |   await installMercySession(page);
  31 |   const matterA = await seedMatter(request, uniqueName("D.C. landlord notice Matter A", testInfo));
  32 |   const matterB = await seedMatter(request, uniqueName("D.C. landlord notice Matter B", testInfo));
  33 |   const pdf = pdfFixture(testInfo, "matter-a-only-notice.pdf");
  34 |   await seedMatterDocument(request, matterA, pdf.name);
  35 | 
  36 |   await page.goto(`/matters/${matterA.matter_id}`);
> 37 |   await page.getByRole("button", { name: /Documents/i }).click();
     |                                                          ^ Error: locator.click: Test timeout of 60000ms exceeded.
  38 |   await expect(page.getByTestId("matter-document-card").filter({ hasText: pdf.name })).toBeVisible({
  39 |     timeout: 45_000,
  40 |   });
  41 | 
  42 |   await page.goto(`/matters/${matterB.matter_id}`);
  43 |   await page.getByRole("button", { name: /Documents/i }).click();
  44 |   await expect(page.getByText(pdf.name)).toHaveCount(0);
  45 | 
  46 |   await page.goto(`/chat?matterId=${encodeURIComponent(matterB.matter_id)}`);
  47 |   await expect(page.getByText(pdf.name)).toHaveCount(0);
  48 | });
  49 | 
```