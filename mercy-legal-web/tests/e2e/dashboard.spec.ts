import { expect, installMercySession, test, waitForAppReady } from "./helpers";

test.describe.configure({ mode: "parallel" });

test("dashboard loads and shows attorney quick actions", async ({ page }) => {
  await installMercySession(page);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForAppReady(page, "mercy-workbench-ready");

  await expect(page.getByRole("heading", { level: 1, name: "Mercy", exact: true })).toBeVisible();
  await expect(page.getByPlaceholder(/Ask Mercy/i)).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Matter context/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Run Mercy/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "New Matter", exact: true })).toBeVisible();
});
