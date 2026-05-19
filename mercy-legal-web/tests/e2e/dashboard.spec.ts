import { expect, installMercySession, test } from "./helpers";

test.describe.configure({ mode: "parallel" });

test("dashboard loads and shows attorney quick actions", async ({ page }) => {
  await installMercySession(page);
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: /Mercy command center/i })).toBeVisible();
  await expect(page.getByText(/Quick start/i)).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /Ask Agent X/i })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /New Intake/i })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /Research D\.C\. law/i })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /Use a template/i })).toBeVisible();
});
