import { createDb, newId } from "@crm/db";
import { expect, type Page, test } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";

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
