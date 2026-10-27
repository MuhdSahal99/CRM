import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsApp, connectAsAuth, createMember, createOrg, queryAs } from "./db";

// T3.05: SCHEMA § notes. RLS/FORCE/tenant_isolation are checked for every table by rls.test.ts.
describe("notes table (T3.05)", () => {
  let app: pg.Client;
  const repA = {} as Record<string, string>;
  const repB = {} as Record<string, string>;
  let task: string;
  let account: string;

  beforeAll(async () => {
    app = await connectAsApp();
    const auth = await connectAsAuth();
    const org = await createOrg(auth);
    const manager = await createMember(auth, org, "manager");
    const [a, b] = [await createMember(auth, org, "rep", manager), await createMember(auth, org, "rep", manager)];
    await auth.end();
    Object.assign(repA, { org_id: org, user_id: a, role: "rep", visible_owner_ids: a });
    Object.assign(repB, { org_id: org, user_id: b, role: "rep", visible_owner_ids: b });
    [{ id: task }] = await queryAs(app, repA, `INSERT INTO activities (id, org_id, owner_id, type, subject) VALUES (gen_random_uuid(), app.org_id(), $1, 'task', 'T') RETURNING id`, [a]);
    [{ id: account }] = await queryAs(app, repA, `INSERT INTO accounts (id, org_id, owner_id, account_name) VALUES (gen_random_uuid(), app.org_id(), $1, 'A') RETURNING id`, [a]);
  });
  afterAll(() => app?.end());

  const add = (c: Record<string, string>, type: string, id: string, body = "hello") =>
    queryAs(app, c, `INSERT INTO notes (id, org_id, record_type, record_id, body) VALUES (gen_random_uuid(), app.org_id(), $1, $2, $3) RETURNING id`, [type, id, body]);

  it("record_visibility: a note on a record rep B cannot see is invisible to B, and B cannot write one", async () => {
    const [note] = await add(repA, "activity", task);
    const count = (c: Record<string, string>) => queryAs(app, c, `SELECT count(*)::int AS n FROM notes WHERE id = $1`, [note.id]).then((r) => r[0].n);
    expect(await count(repA)).toBe(1);
    expect(await count(repB)).toBe(0);
    await expect(add(repB, "activity", task)).rejects.toThrow(/linked record does not exist/);
  });

  it("a note on a public account is visible to every rep in the org", async () => {
    const [note] = await add(repA, "account", account);
    expect(await queryAs(app, repB, `SELECT id FROM notes WHERE id = $1`, [note.id])).toHaveLength(1);
  });

  it("needs a body of 1 to 32000 characters and a record that exists", async () => {
    await expect(add(repA, "account", account, "")).rejects.toThrow(/notes_body_length/);
    await expect(add(repA, "account", account, "x".repeat(32001))).rejects.toThrow(/notes_body_length/);
    await expect(add(repA, "account", crypto.randomUUID())).rejects.toThrow(/linked record does not exist/);
  });
});
