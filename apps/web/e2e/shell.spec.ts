import { expect, test } from "@playwright/test";
import { noPageScroll, phoneAndDesktop, signInToApp } from "./helpers";

phoneAndDesktop();

test("T1.22: /app without a session redirects to /login", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
});

test("T1.22: with a session, /app renders inside the app shell", async ({ page }) => {
  await signInToApp(page, "rep.a@saqient.test");
  await expect(page.locator("[data-app-shell]")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await noPageScroll(page);
});
