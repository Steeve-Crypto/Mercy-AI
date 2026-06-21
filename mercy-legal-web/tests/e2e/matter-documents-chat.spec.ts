import { expect, installMercySession, pdfFixture, seedMatter, seedMatterDocument, test, uniqueName, waitForAppReady } from "./helpers";

test.describe.configure({ mode: "parallel" });

test("matter documents tab uploads a PDF and attaches it to chat", async ({ page, request }, testInfo) => {
  await installMercySession(page);
  const matter = await seedMatter(request, uniqueName("D.C. commercial lease documents", testInfo));
  const pdf = pdfFixture(testInfo);
  await seedMatterDocument(request, matter, pdf.name);

  await page.goto(`/matters/${matter.matter_id}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForAppReady(page, "matter-workspace-ready");
  await page.getByRole("button", { name: /^Documents(?:\s+\d+)?$/ }).click({ timeout: 30_000 });
  await expect(page.getByTestId("matter-document-card").filter({ hasText: pdf.name })).toBeVisible({
    timeout: 45_000,
  });
  const attachHref = await page
    .getByTestId("matter-document-card")
    .filter({ hasText: pdf.name })
    .getByRole("link", { name: /Use in Mercy/i })
    .getAttribute("href");
  if (!attachHref) throw new Error("Attach link did not expose an href");
  await page.goto(attachHref);
  await waitForAppReady(page, "mercy-workbench-ready");

  await expect(page).toHaveURL(/\/chat\?matterId=.*attachedDocs=.*attached=1/);
  await expect(page.getByText(/Document attached to Agent X/i)).toBeVisible();
  await expect(page.getByText(pdf.name)).toBeVisible();
});

test("matter document context is isolated between matters", async ({ page, request }, testInfo) => {
  await installMercySession(page);
  const matterA = await seedMatter(request, uniqueName("D.C. landlord notice Matter A", testInfo));
  const matterB = await seedMatter(request, uniqueName("D.C. landlord notice Matter B", testInfo));
  const pdf = pdfFixture(testInfo, "matter-a-only-notice.pdf");
  await seedMatterDocument(request, matterA, pdf.name);

  await page.goto(`/matters/${matterA.matter_id}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForAppReady(page, "matter-workspace-ready");
  await page.getByRole("button", { name: /^Documents(?:\s+\d+)?$/ }).click({ timeout: 30_000 });
  await expect(page.getByTestId("matter-document-card").filter({ hasText: pdf.name })).toBeVisible({
    timeout: 45_000,
  });

  await page.goto(`/matters/${matterB.matter_id}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForAppReady(page, "matter-workspace-ready");
  await page.getByRole("button", { name: /^Documents(?:\s+\d+)?$/ }).click({ timeout: 30_000 });
  await expect(page.getByText(pdf.name)).toHaveCount(0);

  await page.goto(`/chat?matterId=${encodeURIComponent(matterB.matter_id)}`);
  await waitForAppReady(page, "mercy-workbench-ready");
  await expect(page.getByText(pdf.name)).toHaveCount(0);
});
