import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsApp, connectAsAuth, createMember, createOrg, queryAs } from "./db";

// T3.01: SCHEMA § activities. RLS/FORCE/tenant_isolation are checked for every table by rls.test.ts.
describe("activities table (T3.01)", () => {
  let app: pg.Client;
  const orgA = {} as Record<string, string>;
  const repA = {} as Record<string, string>;
  const repB = {} as Record<string, string>;
  let otherAccount: string;

  beforeAll(async () => {
    app = await connectAsApp();
    const auth = await connectAsAuth();
    const [a, b] = [await createOrg(auth), await createOrg(auth)];
    const manager = await createMember(auth, a, "manager");
    const [ua, ub, ub2] = [await createMember(auth, a, "rep", manager), await createMember(auth, a, "rep", manager), await createMember(auth, b)];
    await auth.end();
    Object.assign(repA, { org_id: a, user_id: ua, role: "rep", visible_owner_ids: ua });
    Object.assign(repB, { org_id: a, user_id: ub, role: "rep", visible_owner_ids: ub });
    Object.assign(orgA, { org_id: a, user_id: manager, role: "manager", visible_owner_ids: [manager, ua, ub].join(",") });
    const [foreign] = await queryAs(app, { org_id: b, user_id: ub2, role: "rep", visible_owner_ids: ub2 }, `INSERT INTO accounts (id, org_id, owner_id, account_name) VALUES (gen_random_uuid(), app.org_id(), $1, 'B') RETURNING id`, [ub2]);
    otherAccount = foreign.id;
  });
  afterAll(() => app?.end());

  const insert = (c: Record<string, string>, type: string, cols: Record<string, unknown> = {}) => {
    const all = { subject: "S", ...cols };
    const names = Object.keys(all);
    return queryAs(app, c, `INSERT INTO activities (id, org_id, owner_id, type, ${names.join(", ")})
      VALUES (gen_random_uuid(), app.org_id(), $1, $2, ${names.map((_, i) => `$${i + 3}`).join(", ")}) RETURNING id`, [c.user_id, type, ...Object.values(all)]);
  };

  it("a meeting needs start_at and end_at, in order", async () => {
    await expect(insert(repA, "meeting")).rejects.toThrow(/activities_meeting_times/);
    await expect(insert(repA, "meeting", { start_at: "2026-01-02T10:00Z", end_at: "2026-01-02T09:00Z" })).rejects.toThrow(/activities_meeting_times/);
    await expect(insert(repA, "meeting", { start_at: "2026-01-02T10:00Z", end_at: "2026-01-02T11:00Z" })).resolves.toHaveLength(1);
  });

  it("a call needs its type, start and a non-negative duration", async () => {
    await expect(insert(repA, "call", { call_type: "Inbound", call_start_at: "2026-01-02T10:00Z" })).rejects.toThrow(/activities_call_fields/);
    await expect(insert(repA, "call", { call_type: "Inbound", call_start_at: "2026-01-02T10:00Z", call_duration_seconds: -1 })).rejects.toThrow(/activities_call_duration/);
    await expect(insert(repA, "call", { call_type: "Inbound", call_start_at: "2026-01-02T10:00Z", call_duration_seconds: 60 })).resolves.toHaveLength(1);
  });

  it("completed_at follows status", async () => {
    const [{ id }] = await insert(repA, "task", { status: "Not Started" });
    const read = async () => (await queryAs(app, repA, `SELECT completed_at FROM activities WHERE id = $1`, [id]))[0].completed_at;
    expect(await read()).toBeNull();
    await queryAs(app, repA, `UPDATE activities SET status = 'Completed' WHERE id = $1`, [id]);
    expect(await read()).toBeInstanceOf(Date);
    await queryAs(app, repA, `UPDATE activities SET status = 'In Progress' WHERE id = $1`, [id]);
    expect(await read()).toBeNull();
  });

  it("check_record_ref: a what_id in another org, or none at all, is rejected", async () => {
    await expect(insert(repA, "task", { what_type: "account", what_id: otherAccount })).rejects.toThrow(/linked record does not exist/);
    await expect(insert(repA, "task", { what_type: "account", what_id: crypto.randomUUID() })).rejects.toThrow(/linked record does not exist/);
    await expect(insert(repA, "task", { what_type: "account", what_id: null })).rejects.toThrow(/activities_what_pair/);
    const [own] = await queryAs(app, repA, `INSERT INTO accounts (id, org_id, owner_id, account_name) VALUES (gen_random_uuid(), app.org_id(), $1, 'A') RETURNING id`, [repA.user_id]);
    await expect(insert(repA, "task", { what_type: "account", what_id: own.id })).resolves.toHaveLength(1);
  });

  it("ADR-0005: rep B sees none of rep A's tasks, even on a public account; the manager sees both", async () => {
    const [account] = await queryAs(app, repA, `INSERT INTO accounts (id, org_id, owner_id, account_name) VALUES (gen_random_uuid(), app.org_id(), $1, 'Shared') RETURNING id`, [repA.user_id]);
    const [task] = await insert(repA, "task", { subject: "Private to A", what_type: "account", what_id: account.id });
    const count = (c: Record<string, string>) => queryAs(app, c, `SELECT count(*)::int AS n FROM activities WHERE id = $1`, [task.id]).then((r) => r[0].n);
    expect(await count(repB)).toBe(0);
    expect(await count(repA)).toBe(1);
    expect(await count(orgA)).toBe(1);
    expect(await queryAs(app, repB, `SELECT app.can_see('activity', $1) AS seen`, [task.id])).toEqual([{ seen: false }]);
  });
});
