import { createDb, newId } from "@crm/db";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { clearThrottle } from "./global-setup";

// Seeded users (docs/PRODUCTION_READINESS.md); the password comes from SEED_PASSWORD in the root .env.local.
export const PASSWORD = process.env.SEED_PASSWORD ?? "";

/**
 * Waits until the page is interactive: every button and input in <main> and in an open dialog has its React handlers attached.
 * A click before this lands on server-rendered markup and is lost (the dev server hydrates late on a busy machine).
 */
export async function hydrated(page: Page) {
  await page.waitForFunction(
    () => {
      const els = [...document.querySelectorAll("main button, main input, main select, main textarea, [role=dialog] button")];
      return els.every((e) => Object.keys(e).some((k) => k.startsWith("__reactProps")));
    },
    null,
    { timeout: 30_000 },
  );
}

/**
 * Clicks until the click has its effect. On a dev server a late Fast Refresh can remount the page after it hydrates and
 * drop the first click; this retries the click together with the outcome it must produce (no fixed sleep).
 */
export async function clickUntil(target: Locator, outcome: () => Promise<void>) {
  await expect(async () => {
    await target.click({ timeout: 5_000 });
    await outcome();
  }).toPass({ timeout: 30_000 });
}

/** Runs a spec at phone and desktop width only (colour scheme is irrelevant), each test as its own client IP. */
export function phoneAndDesktop() {
  test.beforeEach(async ({ page }, info) => {
    test.skip(!/^w(360|1440)-light$/.test(info.project.name), "runs at phone and desktop widths; colour scheme is irrelevant");
    if (!PASSWORD) throw new Error("SEED_PASSWORD is not set (root .env.local)");
    await clearThrottle();
    // Every local request otherwise shares one per-IP sign-in bucket (AC-31, 10 per 15 min).
    // Every navigation inside the app returns once the page is interactive, so no spec clicks into a pre-hydration page.
    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await goto(url, options);
      if (new URL(page.url()).pathname.startsWith("/app")) await hydrated(page);
      return response;
    };
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

/** A throwaway Saqient rep in the dev database who can sign in, for tests that change or deactivate a user. */
export async function createDisposableRep(): Promise<{ id: string; email: string }> {
  const db = createDb(process.env.DATABASE_AUTH_URL!, { max: 1 }); // crm_auth: the only role that writes auth tables
  try {
    const id = newId();
    const email = `e2e-${id}@example.test`;
    await db.execute(sql`INSERT INTO "user" (id, name, email, created_at, updated_at) VALUES (${id}, 'E2E Rep', ${email}, now(), now())`);
    await db.execute(sql`INSERT INTO account (id, user_id, account_id, provider_id, password, created_at, updated_at)
      VALUES (${newId()}, ${id}, ${id}, 'credential', ${await hashPassword(PASSWORD)}, now(), now())`);
    await db.execute(sql`INSERT INTO member (id, org_id, user_id, role, manager_id, created_at)
      SELECT ${newId()}, m.org_id, ${id}, 'rep', m.user_id, now() FROM member m JOIN "user" u ON u.id = m.user_id
      WHERE u.email = 'manager@saqient.test'`);
    return { id, email };
  } finally {
    await db.$client.end();
  }
}
