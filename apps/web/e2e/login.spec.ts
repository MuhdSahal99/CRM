import { expect, test, type Page } from "@playwright/test";

// Seeded users (docs/PRODUCTION_READINESS.md); the password comes from SEED_PASSWORD in the root .env.local.
const PASSWORD = process.env.SEED_PASSWORD ?? "";

test.beforeEach(async ({ page }, info) => {
  test.skip(!/^w(360|1440)-light$/.test(info.project.name), "T1.10 runs at phone and desktop widths; colour scheme is irrelevant");
  if (!PASSWORD) throw new Error("SEED_PASSWORD is not set (root .env.local)");
  // Each test is its own client IP: every local request otherwise shares one per-IP sign-in bucket (AC-31, 10 per 15 min).
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.${Array.from({ length: 3 }, () => Math.floor(Math.random() * 256)).join(".")}` });
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function noPageScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.scrollingElement!.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

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
