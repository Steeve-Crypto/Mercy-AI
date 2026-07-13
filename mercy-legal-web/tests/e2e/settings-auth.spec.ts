import { expect, installMercySession, tenantId, test, userId } from "./helpers";

test("settings renders authorization roles as provisioning-managed", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await installMercySession(page);
  await page.goto("/settings");

  await expect(page.getByRole("heading", { name: "Account & Profile" })).toBeVisible();
  await expect(page.locator('[aria-readonly="true"]')).toHaveText("attorney");
  const main = page.getByRole("main");
  await expect(main.getByText(tenantId, { exact: true })).toBeVisible();
  await expect(main.getByText(userId, { exact: true })).toBeVisible();
  await expect(page.getByText("Managed by Mercy workspace provisioning.")).toBeVisible();
  await expect(page.getByLabel("Role", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveText("");
  expect(consoleErrors).toEqual([]);

  await page.screenshot({ path: testInfo.outputPath("settings-role-readonly.png"), fullPage: true });
});
