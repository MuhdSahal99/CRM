import { expect, test } from "@playwright/test";

test("design page renders without page-level horizontal scroll", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  // The owner supplies public/bg/dusk.webp later; until then the token gradient shows and the missing file is not an app error.
  await page.route("**/bg/dusk.webp", (r) => r.fulfill({ status: 204 }));
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

test("glass kit: every primitive shows in dark, light and RTL, and the controls work", async ({ page }, info) => {
  await page.goto("/design");
  for (const kit of ["dark", "light", "rtl"] as const) {
    const panel = page.locator(`[data-kit="${kit}"]`);
    await panel.scrollIntoViewIfNeeded();
    await expect(panel.getByRole("heading", { name: "Revenue" })).toBeVisible();
    await expect(panel.getByRole("progressbar", { name: "Target reached" }).first()).toBeVisible();
    await expect(panel.getByRole("table", { name: "Stage mix" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "More actions" }).first()).toBeVisible();
    await expect(panel.getByText("No deals yet")).toBeVisible();
    await panel.screenshot({ path: info.outputPath(`${info.project.name}-kit-${kit}.png`) });
  }

  const dark = page.locator('[data-kit="dark"]');
  const range = dark.getByRole("radiogroup", { name: "Range" });
  await expect(range.getByRole("radio", { name: "6M" })).toBeChecked();
  await range.getByRole("radio", { name: "12M" }).click();
  await expect(range.getByRole("radio", { name: "12M" })).toBeChecked();
  const chip = dark.getByRole("button", { name: "Team" });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(dark.getByLabel("Contact email")).toHaveAccessibleDescription("Enter a complete email address.");
  await expect(dark.getByLabel("Contact email")).toHaveAttribute("aria-invalid", "true");
});
