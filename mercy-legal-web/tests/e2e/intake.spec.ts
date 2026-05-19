import { expect, installMercySession, mockFullMatterIntake, seedMatter, test, uniqueName } from "./helpers";

test.describe.configure({ mode: "parallel" });

test("intake wizard creates a matter and redirects to matter detail", async ({ page, request }, testInfo) => {
  await installMercySession(page);
  const matterName = uniqueName("D.C. consumer protection intake", testInfo);
  const matter = await seedMatter(request, matterName);
  const matterId = await mockFullMatterIntake(page, matterName, matter.matter_id);

  await page.goto("/intake");
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
  await page.getByRole("button", { name: /Create Matter & Start Draft/i }).click();

  await expect(page).toHaveURL(new RegExp(`/matters/${matterId}$`));
  await expect(page.getByText(matterName)).toBeVisible();
});
