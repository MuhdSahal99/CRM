import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsApp, connectAsAuth, createMember, createOrg, queryAs } from "./db";

// T2.09: SCHEMA § contacts. RLS/FORCE/tenant_isolation are checked for every table by rls.test.ts.
describe("contacts table (T2.09)", () => {
  let app: pg.Client;
  const ctx = { a: {} as Record<string, string>, b: {} as Record<string, string> };

  beforeAll(async () => {
    app = await connectAsApp();
    const auth = await connectAsAuth();
    for (const k of ["a", "b"] as const) {
      const org = await createOrg(auth);
      ctx[k] = { org_id: org, user_id: await createMember(auth, org), role: "rep" };
    }
    await auth.end();
  });
  afterAll(() => app?.end());

  const insert = (c: Record<string, string>, cols: Record<string, unknown>) => {
    const names = Object.keys(cols);
    return queryAs(app, c, `INSERT INTO contacts (id, org_id, owner_id, last_name${names.map((n) => `, ${n}`).join("")})
      VALUES (gen_random_uuid(), app.org_id(), $1, 'Balushi'${names.map((_, i) => `, $${i + 2}`).join("")}) RETURNING id`, [c.user_id, ...Object.values(cols)]);
  };

  it("stores only E.164 mobiles", async () => {
    await expect(insert(ctx.a, { mobile: "+96891234567" })).resolves.toHaveLength(1);
    await expect(insert(ctx.a, { mobile: "91234567" })).rejects.toThrow(/contacts_mobile_e164/);
  });

  it("AC-13: the composite FK rejects an account from another org", async () => {
    const [foreign] = await queryAs(app, ctx.b, `INSERT INTO accounts (id, org_id, owner_id, account_name) VALUES (gen_random_uuid(), app.org_id(), $1, 'B') RETURNING id`, [ctx.b.user_id]);
    await expect(insert(ctx.a, { account_id: foreign.id })).rejects.toThrow(/contacts_account_fk/);
  });
});
