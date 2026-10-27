import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsApp, connectAsAuth, createMember, createOrg } from "./db";

const AUTH_TABLES = ["account", "invitation", "member", "orgs", "session", "user", "verification"];
const GLOBAL_AUTH_TABLES = ["account", "session", "user", "verification"];

describe("Better Auth tables (T1.04, ADR-0004)", () => {
  let app: pg.Client;
  let auth: pg.Client;
  beforeAll(async () => {
    [app, auth] = await Promise.all([connectAsApp(), connectAsAuth()]);
  });
  afterAll(() => Promise.all([app?.end(), auth?.end()]));

  it("crm_auth can read the auth tables and no other table", async () => {
    const { rows } = await auth.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v') AND has_table_privilege('crm_auth', c.oid, 'SELECT')
       ORDER BY 1`,
    );
    expect(rows.map((r) => r.relname)).toEqual(AUTH_TABLES);
  });

  it.each(GLOBAL_AUTH_TABLES)("crm_app has no privilege on %s", async (table) => {
    const { rows } = await app.query(
      `SELECT has_table_privilege('crm_app', $1, 'SELECT, INSERT, UPDATE, DELETE') AS any`,
      [`public."${table}"`],
    );
    expect(rows[0].any).toBe(false);
  });

  describe("member", () => {
    const ids = { orgA: "", orgB: "", userA: "", userB: "" };

    beforeAll(async () => {
      [ids.orgA, ids.orgB] = await Promise.all([createOrg(auth), createOrg(auth)]);
      [ids.userA, ids.userB] = await Promise.all([createMember(auth, ids.orgA, "manager"), createMember(auth, ids.orgB, "manager")]);
    });

    const addRep = (orgId: string, managerId: string | null, role = "rep") => createMember(auth, orgId, role, managerId);

    it("accepts a manager from the same org", async () => {
      await expect(addRep(ids.orgA, ids.userA)).resolves.toBeDefined();
    });

    it("rejects a manager from another org (composite FK)", async () => {
      await expect(addRep(ids.orgA, ids.userB)).rejects.toThrow(/foreign key/);
    });

    it("rejects a role outside admin/manager/rep", async () => {
      await expect(addRep(ids.orgA, null, "owner")).rejects.toThrow(/check constraint/);
    });

    it("rejects being your own manager", async () => {
      await expect(
        auth.query(`UPDATE member SET manager_id = user_id WHERE user_id = $1`, [ids.userA]),
      ).rejects.toThrow(/check constraint/);
    });
  });

  it("treats emails case-insensitively", async () => {
    const email = `Case-${crypto.randomUUID()}@Example.com`;
    const insert = `INSERT INTO "user" (id, name, email, created_at, updated_at) VALUES (gen_random_uuid(), 'C', $1, now(), now())`;
    await auth.query(insert, [email]);
    await expect(auth.query(insert, [email.toLowerCase()])).rejects.toThrow(/duplicate key/);
  });
});
