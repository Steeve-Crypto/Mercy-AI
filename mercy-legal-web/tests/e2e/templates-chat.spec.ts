import { expect, installMercySession, test } from "./helpers";

test.describe.configure({ mode: "parallel" });

test("templates gallery Use Template opens chat with a prefilled D.C. legal prompt", async ({ page }) => {
  await installMercySession(page);
  await page.goto("/templates");

  await expect(page.getByRole("heading", { name: /Templates/i })).toBeVisible();
  const href = await page.getByRole("link", { name: /Use Template/i }).first().getAttribute("href");
  if (!href) throw new Error("Use Template link did not expose an href");
  await page.goto(href);

  await expect(page).toHaveURL(/\/chat\?templateId=/);
  const composer = page.getByPlaceholder(/Ask Mercy/i);
  await expect(composer).toBeVisible();
  await expect(composer).toHaveValue(/Use the ".+" template with Agent X\./);
});
