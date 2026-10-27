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

  it("is refused for a non-admin (metadata writes are admin-only)", async () => {
    await expect(withTenant(rep, provisionOrg, db)).rejects.toMatchObject({ cause: { message: expect.stringMatching(/row-level security/) } });
  });
});
