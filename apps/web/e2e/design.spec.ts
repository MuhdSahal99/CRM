import { expect, test } from "@playwright/test";

test("design page renders without page-level horizontal scroll", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/design");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Charts mount client-side; wait for the funnel SVG before the screenshot.
  await expect(page.locator(".recharts-funnel-trapezoid").first()).toBeVisible();

  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.scrollingElement!.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

  await page.screenshot({ path: info.outputPath(`${info.project.name}.png`), fullPage: true });
  await page.locator("#rtl").screenshot({ path: info.outputPath(`${info.project.name}-rtl.png`) });
  expect(errors).toEqual([]);
});
