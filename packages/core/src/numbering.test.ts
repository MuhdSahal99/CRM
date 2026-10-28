import { createDb, type Db } from "@crm/db";
import { connectAsAuth, createMember, createOrg, requireEnv } from "@crm/db/testing";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { takeNext } from "./numbering.ts";
import { type TenantContext, withTenant } from "./tenant.ts";

describe("document numbering (T7.03)", () => {
  let db: Db;
  let ctx: TenantContext;
  let end: () => Promise<void>;
  beforeAll(async () => {
    const auth = await connectAsAuth();
    const org = await createOrg(auth);
    const user = await createMember(auth, org, "admin");
    await auth.end();
    ctx = { orgId: org, userId: user, role: "admin", visibleOwnerIds: [user], seeAll: true };
    db = createDb(requireEnv("TEST_DATABASE_URL"), { max: 1 });
    end = async () => { await db.$client.end(); };
  });
  afterAll(() => end?.());

  it("formats prefix + zero-padded number and counts up", async () => {
    expect(await withTenant(ctx, (tx) => takeNext(tx, "quote"), db)).toBe("QT-000001");
    expect(await withTenant(ctx, (tx) => takeNext(tx, "quote"), db)).toBe("QT-000002");
    expect(await withTenant(ctx, (tx) => takeNext(tx, "invoice"), db)).toBe("INV-000001");
  });
  it("a rolled-back transaction does not consume a number", async () => {
    await withTenant(ctx, async (tx) => { await takeNext(tx, "sales_order"); throw new Error("abort"); }, db).catch(() => {});
    expect(await withTenant(ctx, (tx) => takeNext(tx, "sales_order"), db)).toBe("SO-000001");
  });
  it("lowering next_value raises", async () => {
    await expect(withTenant(ctx, (tx) => tx.execute(sql`UPDATE document_sequences SET next_value = 1 WHERE doc_type = 'quote'`), db)).rejects.toThrow();
  });
});
