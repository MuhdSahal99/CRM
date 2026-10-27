import { expect, test } from "@playwright/test";
import { noPageScroll, PASSWORD, phoneAndDesktop, signIn } from "./helpers";

phoneAndDesktop();

test("a seeded rep signs in and lands on /app", async ({ page }) => {
  await signIn(page, "rep.a@saqient.test", PASSWORD);
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 }); // a cold dev server compiles /app on first visit
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await noPageScroll(page);
});

test("a wrong password shows the inline error and stays on /login", async ({ page }) => {
  await signIn(page, "rep.b@saqient.test", "not-the-password");
  await expect(page.locator("#login-error")).toHaveText("The email or password is not right. Check both and try again.");
  await expect(page).toHaveURL(/\/login$/);
  await noPageScroll(page);
});

test("a deactivated user sees the deactivated message", async ({ page }) => {
  await signIn(page, "deactivated@saqient.test", PASSWORD);
  await expect(page.locator("#login-error")).toHaveText("This account has been deactivated. Ask your admin.");
  await expect(page).toHaveURL(/\/login$/);
});

test("without a session, /app redirects to /login", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
});
