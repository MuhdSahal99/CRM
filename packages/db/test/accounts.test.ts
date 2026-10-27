import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsApp, connectAsAuth, createMember, createOrg, queryAs } from "./db";

// T2.01: SCHEMA § accounts. RLS, FORCE and tenant_isolation are enforced for every table by rls.test.ts (AC-14).
describe("accounts table (T2.01)", () => {
  let app: pg.Client;
  let ctx: Record<string, string>;

  beforeAll(async () => {
    app = await connectAsApp();
    const auth = await connectAsAuth();
    const org = await createOrg(auth);
    const rep = await createMember(auth, org, "rep");
    await auth.end();
    ctx = { org_id: org, user_id: rep, role: "rep" };
  });
  afterAll(() => app?.end());

  const insert = (id: string, parent: string | null = null) =>
    queryAs(app, ctx, `INSERT INTO accounts (id, org_id, owner_id, account_name, parent_account_id) VALUES ($1, app.org_id(), $2, 'Acme', $3) RETURNING *`, [id, ctx.user_id, parent]);

  it("has the trigram name index and the list index", async () => {
    const { rows } = await app.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'accounts'`);
    expect(rows.find((r) => r.indexdef.includes("gin_trgm_ops"))?.indexdef).toMatch(/USING gin \(account_name gin_trgm_ops\)/);
    expect(rows.map((r) => r.indexname)).toContain("accounts_list_idx");
  });

  it("fills REC defaults and the audit columns from the context", async () => {
    const [row] = await insert(crypto.randomUUID());
    expect(row).toMatchObject({ created_by: ctx.user_id, updated_by: ctx.user_id, version: 1, custom: {}, deleted_at: null, needs_review: false });
  });

  it("rejects an account that is its own parent", async () => {
    const id = crypto.randomUUID();
    await expect(insert(id, id)).rejects.toThrow(/accounts_parent_not_self/);
  });

  it("rejects a parent from another org (composite FK)", async () => {
    const auth = await connectAsAuth();
    const other = await createOrg(auth);
    const otherRep = await createMember(auth, other, "rep");
    await auth.end();
    const foreign = crypto.randomUUID();
    await queryAs(app, { org_id: other, user_id: otherRep, role: "rep" }, `INSERT INTO accounts (id, org_id, owner_id, account_name) VALUES ($1, app.org_id(), $2, 'X')`, [foreign, otherRep]);
    await expect(insert(crypto.randomUUID(), foreign)).rejects.toThrow(/accounts_parent_fk/);
  });

  it("crm_app cannot hard-delete an account", async () => {
    await expect(queryAs(app, ctx, "DELETE FROM accounts")).rejects.toThrow(/permission denied/);
  });
});
