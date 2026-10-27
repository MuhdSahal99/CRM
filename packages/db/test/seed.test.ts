import { verifyPassword } from "better-auth/crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../src/client";
import { SEED_USERS, seed } from "../src/seed";
import { testUrlFor } from "./db";

const password = "seed-test-password";

describe("seed (T1.08)", () => {
  let db: Db;
  beforeAll(() => {
    db = createDb(testUrlFor("crm_auth", "CRM_AUTH_PASSWORD"), { max: 1 });
  });
  afterAll(() => db?.$client.end());

  const snapshot = async () =>
    (
      await db.$client.query(
        `SELECT u.email, o.slug, m.role, m.status, u.banned, mgr.email AS manager,
           (SELECT count(*)::int FROM account a WHERE a.user_id = u.id AND a.provider_id = 'credential') AS credentials
         FROM "user" u JOIN member m ON m.user_id = u.id JOIN orgs o ON o.id = m.org_id
         LEFT JOIN "user" mgr ON mgr.id = m.manager_id
         WHERE u.email LIKE '%.test' ORDER BY u.email`,
      )
    ).rows;

  it("creates both orgs and a user per role, with the reporting line and one deactivated rep", async () => {
    await seed(db, password);
    const rows = await snapshot();
    expect(rows).toHaveLength(SEED_USERS.length);
    expect(rows).toContainEqual({ email: "rep.a@saqient.test", slug: "saqient", role: "rep", status: "active", banned: false, manager: "manager@saqient.test", credentials: 1 });
    expect(rows).toContainEqual({ email: "deactivated@saqient.test", slug: "saqient", role: "rep", status: "deactivated", banned: true, manager: "manager@saqient.test", credentials: 1 });
    expect(rows).toContainEqual({ email: "admin@demo.test", slug: "demo", role: "admin", status: "active", banned: false, manager: null, credentials: 1 });
  });

  it("is idempotent: a second run changes nothing", async () => {
    await seed(db, password);
    const before = await snapshot();
    await seed(db, "a-different-password");
    expect(await snapshot()).toEqual(before);
  });

  it("stores passwords Better Auth can verify", async () => {
    const { rows } = await db.$client.query(
      `SELECT a.password FROM account a JOIN "user" u ON u.id = a.user_id WHERE u.email = 'rep.a@saqient.test'`,
    );
    expect(await verifyPassword({ hash: rows[0].password, password })).toBe(true);
  });

  it("refuses to run in production", async () => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await expect(seed(db, password)).rejects.toThrow(/production/);
    } finally {
      process.env.NODE_ENV = env;
    }
  });
});
