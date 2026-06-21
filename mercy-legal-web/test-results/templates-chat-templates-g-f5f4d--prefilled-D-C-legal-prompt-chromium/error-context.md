# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: templates-chat.spec.ts >> templates gallery Use Template opens chat with a prefilled D.C. legal prompt
- Location: tests\e2e\templates-chat.spec.ts:5:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: /Templates/i })
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByRole('heading', { name: /Templates/i })

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
  5  | test("templates gallery Use Template opens chat with a prefilled D.C. legal prompt", async ({ page }) => {
  6  |   await installMercySession(page);
  7  |   await page.goto("/templates");
  8  | 
> 9  |   await expect(page.getByRole("heading", { name: /Templates/i })).toBeVisible();
     |                                                                   ^ Error: expect(locator).toBeVisible() failed
  10 |   const href = await page.getByRole("link", { name: /Use Template/i }).first().getAttribute("href");
  11 |   if (!href) throw new Error("Use Template link did not expose an href");
  12 |   await page.goto(href);
  13 | 
  14 |   await expect(page).toHaveURL(/\/chat\?templateId=/);
  15 |   const composer = page.getByPlaceholder(/Ask Mercy/i);
  16 |   await expect(composer).toBeVisible();
  17 |   await expect(composer).toHaveValue(/Use the ".+" template with Agent X\./);
  18 | });
  19 | 
```