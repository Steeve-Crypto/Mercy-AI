# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard.spec.ts >> dashboard loads and shows attorney quick actions
- Location: tests\e2e\dashboard.spec.ts:5:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: /Mercy command center/i })
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByRole('heading', { name: /Mercy command center/i })

```

```yaml
- main:
  - link "Mercy.ai":
    - /url: /
    - img
    - text: Mercy.ai
  - paragraph: Secure firm access
  - heading "Enter the DC legal AI workspace." [level=1]
  - paragraph: Auth pages are ready for Clerk/Auth.js connection. The current experience keeps the flow visible while provider keys are added.
  - img
  - text: Matter-isolated workspace
  - img
  - text: Word plugin download access
  - img
  - text: Stripe subscription checkout
  - link "Back to home":
    - /url: /
    - img
    - text: Back to home
  - img
  - heading "Welcome back" [level=2]
  - paragraph: Sign in to continue to your matters.
  - text: Work email
  - textbox "Work email":
    - /placeholder: attorney@firm.com
  - text: Password
  - textbox "Password":
    - /placeholder: Enter password
  - button "Sign in"
  - paragraph:
    - text: New to Mercy.ai?
    - link "Create account":
      - /url: /sign-up
- alert
```

# Test source

```ts
  1  | import { expect, installMercySession, test } from "./helpers";
  2  | 
  3  | test.describe.configure({ mode: "parallel" });
  4  | 
  5  | test("dashboard loads and shows attorney quick actions", async ({ page }) => {
  6  |   await installMercySession(page);
  7  |   await page.goto("/dashboard");
  8  | 
> 9  |   await expect(page.getByRole("heading", { name: /Mercy command center/i })).toBeVisible();
     |                                                                              ^ Error: expect(locator).toBeVisible() failed
  10 |   await expect(page.getByText(/Next best actions/i)).toBeVisible();
  11 |   await expect(page.getByRole("main").getByRole("link", { name: /Assistant/i })).toBeVisible();
  12 |   await expect(page.getByRole("main").getByRole("link", { name: /New Matter/i })).toBeVisible();
  13 |   await expect(page.getByRole("main").getByRole("link", { name: /Research D\.C\. law/i })).toBeVisible();
  14 |   await expect(page.getByRole("main").getByRole("link", { name: /Open Matters/i })).toBeVisible();
  15 | });
  16 | 
```