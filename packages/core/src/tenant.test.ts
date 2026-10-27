import { createDb, type Db } from "@crm/db";
import { connectAsAuth, createMember, createOrg, requireEnv } from "@crm/db/testing";
import { sql } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type TenantContext, withTenant } from "./tenant.ts";

describe("withTenant (ADR-0003)", () => {
  let auth: pg.Client;
  let db: Db;
  const orgs = { a: "", b: "" };
  const users = { a: "", b: "" };

  const ctx = (org: "a" | "b"): TenantContext => ({
    orgId: orgs[org],
    userId: users[org],
    role: "rep",
    visibleOwnerIds: [users[org]],
    seeAll: false,
  });
  const orgIdsIn = async (tx: Parameters<Parameters<typeof withTenant>[1]>[0], table: string) =>
    (await tx.execute<{ org: string }>(sql.raw(`SELECT DISTINCT ${table === "orgs" ? "id" : "org_id"} AS org FROM ${table}`))).rows.map((r) => r.org);

  beforeAll(async () => {
    auth = await connectAsAuth();
    [orgs.a, orgs.b] = await Promise.all([createOrg(auth), createOrg(auth)]);
    [users.a, users.b] = await Promise.all([createMember(auth, orgs.a), createMember(auth, orgs.b)]);
    db = createDb(requireEnv("TEST_DATABASE_URL"), { max: 1 }); // one connection: every call reuses it
  });
  afterAll(() => Promise.all([auth?.end(), db?.$client.end()]));

  it("AC-15: in org A's context, raw SQL returns only org A rows", async () => {
    const seen = await withTenant(ctx("a"), (tx) => Promise.all(["member", "orgs"].map((t) => orgIdsIn(tx, t))), db);
    expect(seen).toEqual([[orgs.a], [orgs.a]]);
  });

  it("sets all five app.* settings for the transaction", async () => {
    const settings = await withTenant(
      ctx("a"),
      async (tx) =>
        (await tx.execute(sql`SELECT current_setting('app.org_id') AS org_id, current_setting('app.user_id') AS user_id,
          current_setting('app.role') AS role, current_setting('app.see_all') AS see_all, app.visible_owner_ids() AS visible`)).rows[0],
      db,
    );
    expect(settings).toEqual({ org_id: orgs.a, user_id: users.a, role: "rep", see_all: "off", visible: [users.a] });
  });

  it("AC-12: two orgs interleaved on one pooled connection each see only their own rows, and no context is left behind", async () => {
    const pause = () => new Promise((r) => setTimeout(r, 20));
    const run = (org: "a" | "b") =>
      withTenant(ctx(org), async (tx) => {
        await pause();
        const pid = (await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0]!.pid;
        return { pid, seen: await orgIdsIn(tx, "member") };
      }, db);

    const [a, b] = await Promise.all([run("a"), run("b"), run("a"), run("b")]);
    expect(a!.pid).toBe(b!.pid); // same physical connection
    expect(a!.seen).toEqual([orgs.a]);
    expect(b!.seen).toEqual([orgs.b]);

    const after = await db.execute<{ org: string; n: number }>(
      sql`SELECT current_setting('app.org_id', true) AS org, (SELECT count(*)::int FROM member) AS n`,
    );
    expect(after.rows[0]).toEqual({ org: "", n: 0 });
  });

  it("rolls back everything, including its settings, when fn throws", async () => {
    const boom = new Error("boom");
    await expect(
      withTenant(ctx("a"), async (tx) => {
        await tx.execute(sql`SELECT set_config('app.probe', 'leaked', false)`); // session-level unless rolled back
        throw boom;
      }, db),
    ).rejects.toBe(boom);
    const { rows } = await db.execute<{ probe: string | null }>(sql`SELECT current_setting('app.probe', true) AS probe`);
    expect(rows[0]!.probe ?? "").toBe("");
  });
});
