import { createDb, type Db, schema } from "@crm/db";
import { seed } from "@crm/db/seed";
import { requireEnv, TEST_SEED_PASSWORD as PASSWORD, testUrlFor } from "@crm/db/testing";
import { getAuthTables } from "better-auth/db";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authOptions, createAuth } from "./auth";

const BASE = "http://localhost:3000";
const randomIp = () => `10.${Array.from({ length: 3 }, () => Math.floor(Math.random() * 256)).join(".")}`;

describe("Better Auth server (T1.09, ADR-0004)", () => {
  let db: Db;
  let redis: Redis;
  let auth: ReturnType<typeof createAuth>;

  const post = (path: string, body: object, ip = randomIp()) =>
    auth.handler(
      new Request(`${BASE}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": ip },
        body: JSON.stringify(body),
      }),
    );
  const signIn = (email: string, password: string, ip?: string) => post("/sign-in/email", { email, password }, ip);

  beforeAll(async () => {
    db = createDb(testUrlFor("crm_auth", "CRM_AUTH_PASSWORD"), { max: 2 });
    redis = new Redis(requireEnv("REDIS_URL"), { db: 15 }); // own Redis db: counters outlive the test DB reset
    await redis.flushdb();
    await seed(db, PASSWORD);
    auth = createAuth({ db, redis, secret: "test-secret-".padEnd(40, "x"), baseURL: BASE });
  });
  afterAll(async () => {
    await db?.$client.end();
    redis?.disconnect();
  });

  it("signs in a seeded user with an httpOnly, Secure, SameSite=Lax session cookie", async () => {
    const res = await signIn("rep.a@saqient.test", PASSWORD);
    expect(res.status).toBe(200);
    const cookie = res.headers.getSetCookie().find((c) => c.includes("session_token"));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it("US-01: refuses a deactivated user with 403", async () => {
    expect((await signIn("deactivated@saqient.test", PASSWORD)).status).toBe(403);
  });

  it("AC-31: a wrong password and an unknown email get the same answer (no user enumeration)", async () => {
    const wrong = await signIn("rep.a@saqient.test", "not-the-password");
    const unknown = await signIn("nobody@saqient.test", "not-the-password");
    expect([wrong.status, await wrong.json()]).toEqual([unknown.status, await unknown.json()]);
    expect(wrong.status).toBe(401);
  });

  it("AC-31: repeated bad passwords from one IP are throttled; other IPs are not", async () => {
    const ip = randomIp();
    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) statuses.push((await signIn("rep.b@saqient.test", `wrong-${i}`, ip)).status);
    expect(statuses).toContain(429);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect((await signIn("admin@demo.test", PASSWORD)).status).toBe(200); // another IP and account
  });

  it("AC-31: attempts on one account are throttled across IPs; other accounts are not", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) statuses.push((await signIn("Manager@Saqient.test", `wrong-${i}`)).status); // new IP each time
    expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(20)).toEqual([429, 429]);
    expect((await signIn("manager@saqient.test", PASSWORD)).status).toBe(429); // the account, not the casing
    expect((await signIn("admin@saqient.test", PASSWORD)).status).toBe(200);
  });

  it("has no public sign-up: users join by invitation only (US-03)", async () => {
    const res = await post("/sign-up/email", { email: `x-${crypto.randomUUID()}@example.com`, password: "long-enough-password", name: "X" });
    expect(res.ok).toBe(false);
  });

  it("matches our Drizzle schema: every table and field Better Auth uses exists", () => {
    const tables = getAuthTables(authOptions({ db, redis, secret: "x".repeat(40), baseURL: BASE }));
    const ours: Record<string, object> = schema;
    const missing = Object.values(tables).flatMap(({ modelName, fields }) => {
      const table = ours[modelName];
      if (!table) return [modelName];
      return Object.entries(fields)
        .map(([key, field]) => field.fieldName ?? key)
        .filter((name) => !(name in table))
        .map((name) => `${modelName}.${name}`);
    });
    expect(Object.keys(tables).length).toBeGreaterThanOrEqual(7);
    expect(missing).toEqual([]);
  });
});
