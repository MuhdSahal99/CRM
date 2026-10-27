import { createDb, type Db } from "@crm/db";
import { connectAsAuth, createMember, createOrg, requireEnv } from "@crm/db/testing";
import { sql } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type TenantContext, withTenant } from "../tenant.ts";
import { provisionOrg, SYSTEM_MODULES } from "./seed-org.ts";

describe("provisionOrg (T1.18)", () => {
  let auth: pg.Client;
  let db: Db;
  let admin: TenantContext;
  let rep: TenantContext;

  beforeAll(async () => {
    auth = await connectAsAuth();
    const org = await createOrg(auth);
    const [a, r] = [await createMember(auth, org, "admin"), await createMember(auth, org, "rep")];
    admin = { orgId: org, userId: a, role: "admin", visibleOwnerIds: [a], seeAll: true };
    rep = { orgId: org, userId: r, role: "rep", visibleOwnerIds: [r], seeAll: false };
    db = createDb(requireEnv("TEST_DATABASE_URL"), { max: 1 });
  });
  afterAll(() => Promise.all([auth?.end(), db?.$client.end()]));

  const modules = () => withTenant(rep, async (tx) => (await tx.execute(sql`SELECT api_name, created_by FROM modules ORDER BY sort_order`)).rows, db);

  it("gives the org its system modules, as the admin, and is idempotent", async () => {
    await withTenant(admin, provisionOrg, db);
    await withTenant(admin, provisionOrg, db);
    expect(await modules()).toEqual(SYSTEM_MODULES.map((m) => ({ api_name: m.apiName, created_by: admin.userId })));
  });

  it("seeds the Accounts fields, their picklists and one default layout that places every field", async () => {
    const rows = await withTenant(rep, async (tx) => (await tx.execute<{ api_name: string; column_name: string; placed: number; layouts: number }>(sql`
      SELECT f.api_name, f.column_name,
        (SELECT count(*)::int FROM layout_fields lf WHERE lf.field_id = f.id) AS placed,
        (SELECT count(*)::int FROM layouts l WHERE l.module_id = m.id AND l.is_default) AS layouts
      FROM fields f JOIN modules m ON m.id = f.module_id WHERE m.api_name = 'Accounts'`)).rows, db);
    expect(rows.find((r) => r.api_name === "Account_Name")).toMatchObject({ column_name: "account_name", placed: 1, layouts: 1 });
    expect(rows.every((r) => r.placed === 1)).toBe(true);
    const values = await withTenant(rep, async (tx) => (await tx.execute(sql`
      SELECT v.value FROM picklist_values v JOIN picklists p ON p.id = v.picklist_id WHERE p.api_name = 'Account_Type' ORDER BY v.sort_order`)).rows, db);
    expect(values.map((v) => v.value)).toContain("Customer");
  });

  it("T5.01: seeds exactly one default pipeline whose stages are i18n keys; Proposal/Price Quote is 75; OMR is the base currency", async () => {
    await withTenant(admin, provisionOrg, db);
    const [pipelines, stages, base] = await withTenant(rep, async (tx) => [
      (await tx.execute(sql`SELECT count(*)::int AS n FROM pipelines WHERE is_default`)).rows[0]!.n,
      (await tx.execute<{ api_value: string; name_key: string; probability: number }>(sql`SELECT api_value, name_key, probability FROM stages ORDER BY sort_order`)).rows,
      (await tx.execute(sql`SELECT code FROM currencies WHERE is_base`)).rows[0]!.code,
    ], db);
    expect(pipelines).toBe(1);
    expect(stages).toHaveLength(10);
    expect(stages.every((s) => /^stages\.[a-z_]+$/.test(s.name_key))).toBe(true);
    expect(stages.find((s) => s.api_value === "Proposal/Price Quote")!.probability).toBe(75);
    expect(base).toBe("OMR");
  });

  it("is refused for a non-admin (metadata writes are admin-only)", async () => {
    await expect(withTenant(rep, provisionOrg, db)).rejects.toMatchObject({ cause: { message: expect.stringMatching(/row-level security/) } });
  });
});
