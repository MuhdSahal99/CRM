import { expect, type Page, test } from "@playwright/test";

// Seeded users (docs/PRODUCTION_READINESS.md); the password comes from SEED_PASSWORD in the root .env.local.
export const PASSWORD = process.env.SEED_PASSWORD ?? "";

/** Runs a spec at phone and desktop width only (colour scheme is irrelevant), each test as its own client IP. */
export function phoneAndDesktop() {
  test.beforeEach(async ({ page }, info) => {
    test.skip(!/^w(360|1440)-light$/.test(info.project.name), "runs at phone and desktop widths; colour scheme is irrelevant");
    if (!PASSWORD) throw new Error("SEED_PASSWORD is not set (root .env.local)");
    // Every local request otherwise shares one per-IP sign-in bucket (AC-31, 10 per 15 min).
    await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.${Array.from({ length: 3 }, () => Math.floor(Math.random() * 256)).join(".")}` });
  });
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs in and waits for the app home (a cold dev server compiles /app on first visit). */
export async function signInToApp(page: Page, email: string) {
  await signIn(page, email);
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
}

/** ADR-0016: no page-level horizontal scroll. */
export async function noPageScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.scrollingElement!.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}
