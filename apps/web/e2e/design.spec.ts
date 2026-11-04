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
  await expect(page.locator(".recharts-funnel-trapezoid").first()).toBeVisible({ timeout: 30_000 });

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
    for (const region of ["Calendar", "Deal pipeline"]) await expect(panel.getByRole("region", { name: region })).toBeVisible();
    await expect(panel.getByRole("group", { name: "Call in progress with Amal Haddad" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Row actions" }).first()).toBeVisible();
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

test("glass kit overlays open inside their themed panel; toasts offer Undo", async ({ page }, info) => {
  await page.goto("/design");
  await expect(page.locator(".recharts-surface").first()).toBeVisible({ timeout: 30_000 }); // charts mount after hydration, so clicks land
  const light = page.locator('[data-kit="light"]');
  await light.scrollIntoViewIfNeeded();
  for (const [trigger, name] of [["Open modal", "Close deal as lost"], ["Open drawer", "Deal details"]] as const) {
    await light.getByRole("button", { name: trigger }).click();
    const layer = page.getByRole("dialog", { name });
    await expect(layer).toBeVisible();
    // Portalled into the panel, so it carries the panel's light theme rather than the page's dark one.
    expect(await layer.evaluate((el) => Boolean(el.closest('[data-kit="light"]')))).toBe(true);
    await page.screenshot({ path: info.outputPath(`${info.project.name}-${trigger.replace(/\W/g, "")}-light.png`) });
    await page.keyboard.press("Escape");
    await expect(layer).toBeHidden();
  }
  await light.getByRole("button", { name: "Show toast" }).click();
  await expect(page.getByText("Deal moved to Proposal.")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Move undone.")).toBeVisible();
});

test("glass kit board: a deal moves with the keyboard on its grip", async ({ page }) => {
  await page.goto("/design");
  await expect(page.locator(".recharts-surface").first()).toBeVisible({ timeout: 30_000 });
  const dark = page.locator('[data-kit="dark"]');
  await dark.scrollIntoViewIfNeeded();
  const grip = dark.getByRole("button", { name: /^Drag Muscat Port fit-out/ });
  await grip.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(300); // dnd-kit attaches its key listeners a tick after pick-up
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText(/Muscat Port fit-out is over (?!Proposal)/)).toBeAttached(); // the live region names the stage
  await page.keyboard.press("Space");
  await expect(page.getByText(/Muscat Port fit-out moved to /)).toBeVisible();
});
