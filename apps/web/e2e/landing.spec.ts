import { expect, test } from "@playwright/test";

async function noPageScroll(page: import("@playwright/test").Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.scrollingElement!.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

test("landing page renders and the sample invoice recomputes", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sales CRM that counts every baisa");
  await noPageScroll(page);

  const invoice = page.getByRole("article", { name: "Sample tax invoice" }).first();
  await expect(invoice).toContainText("OMR 358.000");
  // One more network switch: 4 × 100.000 − 10% = 360.000 net, VAT 18.000; sub total 434.690 → grand 452.500.
  await invoice.getByRole("button", { name: "More: Network switch, 24-port" }).click();
  await expect(invoice).toContainText("OMR 452.500");

  await page.screenshot({ path: info.outputPath(`${info.project.name}.png`), fullPage: true });
  expect(errors).toEqual([]);
});
