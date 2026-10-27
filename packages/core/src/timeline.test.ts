import { createDb, type Db } from "@crm/db";
import { connectAsAuth, createMember, createOrg, requireEnv } from "@crm/db/testing";
import { sql } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type TenantContext, withTenant } from "./tenant";
import { recordEvent } from "./timeline";

describe("timeline write path (T1.16, SCHEMA § timeline_events)", () => {
  let auth: pg.Client;
  let db: Db;
  let ctx: TenantContext;
  let otherOrgUser: string;

  const eventsFor = (recordId: string) =>
    withTenant(ctx, async (tx) => (await tx.execute(sql`SELECT * FROM timeline_events WHERE record_id = ${recordId}`)).rows, db);

  beforeAll(async () => {
    auth = await connectAsAuth();
    const [orgA, orgB] = await Promise.all([createOrg(auth), createOrg(auth)]);
    const userA = await createMember(auth, orgA, "admin");
    otherOrgUser = await createMember(auth, orgB);
    ctx = { orgId: orgA, userId: userA, role: "admin", visibleOwnerIds: [userA], seeAll: true };
    db = createDb(requireEnv("TEST_DATABASE_URL"), { max: 1 });
  });
  afterAll(() => Promise.all([auth?.end(), db?.$client.end()]));

  it("writes in the caller's transaction, with org and actor from its context", async () => {
    await withTenant(ctx, (tx) => recordEvent(tx, { recordType: "user", recordId: ctx.userId, eventType: "role_changed", changes: { role: ["rep", "admin"] } }), db);
    expect(await eventsFor(ctx.userId)).toEqual([
      expect.objectContaining({ org_id: ctx.orgId, actor_id: ctx.userId, event_type: "role_changed", changes: { role: ["rep", "admin"] } }),
    ]);
  });

  it("disappears when the caller's transaction rolls back", async () => {
    const boom = withTenant(ctx, async (tx) => {
      await recordEvent(tx, { recordType: "org", recordId: ctx.orgId, eventType: "updated" });
      throw new Error("boom");
    }, db);
    await expect(boom).rejects.toThrow("boom");
    expect(await eventsFor(ctx.orgId)).toEqual([]);
  });

  it("AC-25: crm_app cannot UPDATE or DELETE timeline_events", async () => {
    await expect(withTenant(ctx, (tx) => tx.execute(sql`UPDATE timeline_events SET event_type = 'x'`), db)).rejects.toMatchObject({ cause: { message: expect.stringMatching(/permission denied/) } });
    await expect(withTenant(ctx, (tx) => tx.execute(sql`DELETE FROM timeline_events`), db)).rejects.toMatchObject({ cause: { message: expect.stringMatching(/permission denied/) } });
  });

  it("refuses an event about a record the caller cannot see", async () => {
    // Another org's user, and a record type app.can_see() does not cover yet (fail closed).
    for (const event of [
      { recordType: "user", recordId: otherOrgUser },
      { recordType: "deal", recordId: crypto.randomUUID() },
    ] as const) {
      await expect(withTenant(ctx, (tx) => recordEvent(tx, { ...event, eventType: "updated" }), db)).rejects.toMatchObject({ cause: { message: expect.stringMatching(/row-level security/) } });
    }
  });
});
