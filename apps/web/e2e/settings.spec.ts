import { expect, test } from "@playwright/test";
import { noPageScroll, phoneAndDesktop, signInToApp } from "./helpers";

phoneAndDesktop();

test("T6.07 (US-09): the admin adds an AED rate and the list shows it with its effective date", async ({ page }) => {
  // A unique past date per run: (currency, date) is unique, and the rate in force today is not changed for other specs.
  const date = `20${10 + Math.floor(Math.random() * 10)}-0${1 + Math.floor(Math.random() * 9)}-${10 + Math.floor(Math.random() * 18)}`;
  await signInToApp(page, "admin@saqient.test");
  await page.goto("/app/settings/exchange-rates");
  await expect(page.getByRole("heading", { name: "Exchange rates" })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Rate (OMR per 1)").fill("0.10500000");
  await page.getByLabel("Effective from").fill(date);
  await noPageScroll(page);
  await page.getByRole("button", { name: "Add rate" }).click();
  await expect(page.getByText(date).locator("visible=true").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("0.10500000").locator("visible=true").first()).toBeVisible();
});

test("T6.07: the org settings and VAT pages load for the admin and are 404 for a rep", async ({ page }) => {
  await signInToApp(page, "admin@saqient.test");
  await page.goto("/app/settings/org");
  await expect(page.getByLabel("Legal name")).toBeVisible({ timeout: 30_000 });
  await noPageScroll(page);
  await page.goto("/app/settings/vat");
  await expect(page.getByText("5.0000").locator("visible=true").first()).toBeVisible({ timeout: 30_000 });
  await noPageScroll(page);
  await page.context().clearCookies();
  await signInToApp(page, "rep.a@saqient.test");
  expect((await page.goto("/app/settings/vat"))?.status()).toBe(404);
});
