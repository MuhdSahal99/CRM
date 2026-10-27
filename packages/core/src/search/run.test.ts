import { createDb, type Db } from "@crm/db";
import { connectAsAuth, createMember, createOrg, requireEnv } from "@crm/db/testing";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { provisionOrg } from "../metadata/seed-org.ts";
import { createRecords } from "../modules/write.ts";
import { type TenantContext, withTenant } from "../tenant.ts";
import { searchRecords } from "./run.ts";

// Field permissions apply to search too: a role that cannot see a field cannot find records by it.
describe("searchRecords and hidden fields", () => {
  let db: Db;
  let admin: TenantContext;
  let rep: TenantContext;

  beforeAll(async () => {
    const auth = await connectAsAuth();
    const org = await createOrg(auth);
    const [a, r] = [await createMember(auth, org, "admin"), await createMember(auth, org, "rep")];
    await auth.end();
    admin = { orgId: org, userId: a, role: "admin", visibleOwnerIds: [a], seeAll: true };
    rep = { orgId: org, userId: r, role: "rep", visibleOwnerIds: [r], seeAll: false };
    db = createDb(requireEnv("TEST_DATABASE_URL"), { max: 1 });
    await withTenant(admin, async (tx) => {
      await provisionOrg(tx);
      await createRecords(tx, admin, "Accounts", { data: [{ Account_Name: "Secret Name LLC", Email: "x@secret.om" }] });
      await tx.execute(sql`INSERT INTO field_permissions (org_id, field_id, role, access)
        SELECT app.org_id(), f.id, 'rep', 'hidden' FROM fields f WHERE f.api_name IN ('Account_Name', 'Email')`);
    }, db);
  });
  afterAll(() => db?.$client.end());

  const search = (ctx: TenantContext, q: Record<string, string>) => withTenant(ctx, (tx) => searchRecords(tx, "Accounts", { page: 1, per_page: 20, ...q }), db);

  it("a role with the name field hidden cannot word-search, and its email search ignores the hidden email", async () => {
    expect((await search(admin, { word: "secret" })).data).toHaveLength(1);
    await expect(search(rep, { word: "secret" })).rejects.toMatchObject({ httpStatus: 422 });
    expect((await search(rep, { email: "x@secret.om" })).data).toEqual([]);
    await expect(search(rep, { criteria: "(Account_Name:equals:Secret Name LLC)" })).rejects.toMatchObject({ httpStatus: 422 });
  });
});
