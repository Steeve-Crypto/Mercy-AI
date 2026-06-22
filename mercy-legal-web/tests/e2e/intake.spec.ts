import { expect, installMercySession, mockFullMatterIntake, seedMatter, test, uniqueName, waitForAppReady } from "./helpers";

test.describe.configure({ mode: "parallel" });

test("intake wizard creates a matter and redirects to matter detail", async ({ page, request }, testInfo) => {
  await installMercySession(page);
  const matterName = uniqueName("D.C. consumer protection intake", testInfo);
  const matter = await seedMatter(request, matterName);
  const matterId = await mockFullMatterIntake(page, matterName, matter.matter_id);

  await page.goto("/intake", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForAppReady(page, "intake-workspace-ready");
  await page.getByLabel(/Client name/i).fill("Anacostia Small Business Coalition");
  await page.getByLabel(/Contact/i).fill("client@example.test");
  await page.getByLabel(/Client role/i).fill("Plaintiff");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await page.getByLabel(/Matter title/i).fill(matterName);
  await page.getByLabel(/Practice area/i).fill("D.C. consumer protection");
  await page.getByLabel(/Jurisdiction/i).fill("District of Columbia");
  await page.getByLabel(/Parties/i).fill("District vendor; property manager");
  await page.getByLabel(/Matter description/i).fill(
    "Evaluate D.C. Consumer Protection Procedures Act risk and preservation steps before sending a demand letter.",
  );
  await page.getByLabel(/Deadlines/i).fill("Demand letter target within 10 business days.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await page.getByLabel(/I have started a conflict check/i).check();
  await page.getByLabel(/No known conflict/i).check();
  await page.getByLabel(/expected scope/i).check();
  await page.getByLabel(/attorney review/i).check();
  await page.getByLabel(/Treat this as/i).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: /Create Matter & Start Draft/i }).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(new RegExp(`/matters/${matterId}$`), { timeout: 90_000 });

  await waitForAppReady(page, "matter-workspace-ready");
  await expect(page.getByRole("heading", { level: 1, name: matterName, exact: true })).toBeVisible();
});
