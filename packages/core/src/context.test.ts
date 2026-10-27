import { createDb, type Db } from "@crm/db";
import { seed } from "@crm/db/seed";
import { requireEnv, TEST_SEED_PASSWORD as PASSWORD, testUrlFor } from "@crm/db/testing";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "./auth";
import { resolveContext } from "./context";

const BASE = "http://localhost:3000";

describe("resolveContext (T1.11, ADR-0005)", () => {
  let db: Db;
  let redis: Redis;
  let auth: ReturnType<typeof createAuth>;

  /** Signs in and returns request headers carrying the session cookie, as a browser would send them. */
  async function cookieFor(email: string): Promise<Headers> {
    const res = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": `10.9.${Math.floor(Math.random() * 256)}.1` },
        body: JSON.stringify({ email, password: PASSWORD }),
      }),
    );
    expect(res.status).toBe(200);
    return new Headers({ cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") });
  }
  const idOf = async (email: string) =>
    (await db.execute<{ id: string }>(sql`SELECT id FROM "user" WHERE email = ${email}`)).rows[0]!.id;
  const resolve = (headers: Headers) => resolveContext(headers, { auth, db });

  beforeAll(async () => {
    db = createDb(testUrlFor("crm_auth", "CRM_AUTH_PASSWORD"), { max: 2 });
    redis = new Redis(requireEnv("REDIS_URL"), { db: 14 }); // not auth.test's db 15: its throttle counts must stay exact
    await redis.flushdb();
    await seed(db, PASSWORD);
    auth = createAuth({ db, redis, secret: "test-secret-".padEnd(40, "x"), baseURL: BASE });
  });
  afterAll(async () => {
    await db?.$client.end();
    redis?.disconnect();
  });

  it("the manager sees self, rep A and rep B", async () => {
    const ctx = await resolve(await cookieFor("manager@saqient.test"));
    const ids = await Promise.all(["manager", "rep.a", "rep.b", "deactivated"].map((u) => idOf(`${u}@saqient.test`)));
    expect(ctx).toMatchObject({ userId: ids[0], role: "manager", seeAll: false });
    // The deactivated rep still reports to the manager: their records stay visible until transferred (US-03).
    expect([...ctx!.visibleOwnerIds].sort()).toEqual([...ids].sort());
  });

  it("rep A sees only rep A", async () => {
    const ctx = await resolve(await cookieFor("rep.a@saqient.test"));
    expect(ctx).toMatchObject({ role: "rep", seeAll: false, visibleOwnerIds: [await idOf("rep.a@saqient.test")] });
  });

  it("an admin gets see_all, scoped to their own org", async () => {
    const ctx = await resolve(await cookieFor("admin@demo.test"));
    const demo = (await db.execute<{ id: string }>(sql`SELECT id FROM orgs WHERE slug = 'demo'`)).rows[0]!.id;
    expect(ctx).toMatchObject({ orgId: demo, role: "admin", seeAll: true });
  });

  it("no cookie or a forged cookie resolves to nothing", async () => {
    expect(await resolve(new Headers())).toBeNull();
    expect(await resolve(new Headers({ cookie: "__Secure-better-auth.session_token=forged.value" }))).toBeNull();
  });

  it("AC-32: once a user is deactivated, their existing cookie stops resolving immediately", async () => {
    const userId = crypto.randomUUID();
    const orgId = (await db.execute<{ id: string }>(sql`SELECT id FROM orgs WHERE slug = 'saqient'`)).rows[0]!.id;
    const email = `leaver-${userId}@saqient.test`;
    await db.execute(sql`INSERT INTO "user" (id, name, email, created_at, updated_at) VALUES (${userId}, 'Leaver', ${email}, now(), now())`);
    await db.execute(sql`INSERT INTO account (id, user_id, account_id, provider_id, password, created_at, updated_at)
      VALUES (gen_random_uuid(), ${userId}, ${userId}, 'credential', ${await hashPassword(PASSWORD)}, now(), now())`);
    await db.execute(sql`INSERT INTO member (id, org_id, user_id, role, created_at) VALUES (gen_random_uuid(), ${orgId}, ${userId}, 'rep', now())`);

    const headers = await cookieFor(email);
    expect(await resolve(headers)).toMatchObject({ userId });

    // Either flag alone is enough: membership deactivated (US-03), then the user banned (US-01).
    await db.execute(sql`UPDATE member SET status = 'deactivated' WHERE user_id = ${userId}`);
    expect(await resolve(headers)).toBeNull();
    await db.execute(sql`UPDATE member SET status = 'active' WHERE user_id = ${userId}`);
    await db.execute(sql`UPDATE "user" SET banned = true WHERE id = ${userId}`);
    expect(await resolve(headers)).toBeNull();
  });
});
