# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: intake.spec.ts >> intake wizard creates a matter and redirects to matter detail
- Location: tests\e2e\intake.spec.ts:5:5

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.fill: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByLabel(/Client name/i)

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
  1  | import { expect, installMercySession, mockFullMatterIntake, seedMatter, test, uniqueName } from "./helpers";
  2  | 
  3  | test.describe.configure({ mode: "parallel" });
  4  | 
  5  | test("intake wizard creates a matter and redirects to matter detail", async ({ page, request }, testInfo) => {
  6  |   await installMercySession(page);
  7  |   const matterName = uniqueName("D.C. consumer protection intake", testInfo);
  8  |   const matter = await seedMatter(request, matterName);
  9  |   const matterId = await mockFullMatterIntake(page, matterName, matter.matter_id);
  10 | 
  11 |   await page.goto("/intake");
> 12 |   await page.getByLabel(/Client name/i).fill("Anacostia Small Business Coalition");
     |                                         ^ Error: locator.fill: Test timeout of 60000ms exceeded.
  13 |   await page.getByLabel(/Contact/i).fill("client@example.test");
  14 |   await page.getByLabel(/Client role/i).fill("Plaintiff");
  15 |   await page.getByRole("button", { name: "Continue", exact: true }).click();
  16 | 
  17 |   await page.getByLabel(/Matter title/i).fill(matterName);
  18 |   await page.getByLabel(/Practice area/i).fill("D.C. consumer protection");
  19 |   await page.getByLabel(/Jurisdiction/i).fill("District of Columbia");
  20 |   await page.getByLabel(/Parties/i).fill("District vendor; property manager");
  21 |   await page.getByLabel(/Matter description/i).fill(
  22 |     "Evaluate D.C. Consumer Protection Procedures Act risk and preservation steps before sending a demand letter.",
  23 |   );
  24 |   await page.getByLabel(/Deadlines/i).fill("Demand letter target within 10 business days.");
  25 |   await page.getByRole("button", { name: "Continue", exact: true }).click();
  26 | 
  27 |   await page.getByLabel(/I have started a conflict check/i).check();
  28 |   await page.getByLabel(/No known conflict/i).check();
  29 |   await page.getByLabel(/expected scope/i).check();
  30 |   await page.getByLabel(/attorney review/i).check();
  31 |   await page.getByLabel(/Treat this as/i).check();
  32 |   await page.getByRole("button", { name: "Continue", exact: true }).click();
  33 |   await page.getByRole("button", { name: /Create Matter & Start Draft/i }).click();
  34 | 
  35 |   await expect(page).toHaveURL(new RegExp(`/matters/${matterId}$`));
  36 |   await expect(page.getByText(matterName)).toBeVisible();
  37 | });
  38 | 
```