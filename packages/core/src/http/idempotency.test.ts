import { createDb, type Db } from "@crm/db";
import { connectAsAuth, createMember, createOrg, requireEnv } from "@crm/db/testing";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TenantContext, Tx } from "../tenant.ts";
import { idempotent, requestHash } from "./idempotency.ts";

// T2.02 (ADR-0015, AC-28).
describe("idempotent", () => {
  let db: Db;
  let ctx: TenantContext;
  const body = { data: [{ Account_Name: "Acme" }] };
  const hash = requestHash("POST", "/api/v1/Accounts", body);
  let runs = 0;
  const create = async (tx: Tx) => {
    runs++;
    await tx.execute(sql`SELECT 1`);
    return { data: [{ code: "SUCCESS", run: runs }] };
  };

  beforeAll(async () => {
    const auth = await connectAsAuth();
    const org = await createOrg(auth);
    const user = await createMember(auth, org);
    await auth.end();
    ctx = { orgId: org, userId: user, role: "rep", visibleOwnerIds: [user], seeAll: false };
    db = createDb(requireEnv("TEST_DATABASE_URL"), { max: 3 });
  });
  afterAll(() => db?.$client.end());

  it("a replay returns the stored response without running the handler again", async () => {
    const first = await idempotent(ctx, "key-replay-1", hash, 201, create, db);
    const replay = await idempotent(ctx, "key-replay-1", hash, 201, create, db);
    expect(first).toEqual({ status: 201, body: { data: [{ code: "SUCCESS", run: 1 }] } });
    expect(replay).toEqual(first);
    expect(runs).toBe(1);
  });

  it("AC-28: the same key with a different body is a 422 IDEMPOTENCY_KEY_REUSED", async () => {
    const other = requestHash("POST", "/api/v1/Accounts", { data: [{ Account_Name: "Other" }] });
    await expect(idempotent(ctx, "key-replay-1", other, 201, create, db)).rejects.toMatchObject({ httpStatus: 422, code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("a request still in flight is a 409 IN_PROGRESS", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = idempotent(ctx, "key-flight-1", hash, 201, async (tx) => (await gate, create(tx)), db);
    await new Promise((r) => setTimeout(r, 100)); // let the first call claim the key
    await expect(idempotent(ctx, "key-flight-1", hash, 201, create, db)).rejects.toMatchObject({ httpStatus: 409, code: "IN_PROGRESS" });
    release();
    expect((await slow).status).toBe(201);
  });

  it("a failed request frees its key, so the client can retry", async () => {
    await expect(idempotent(ctx, "key-fail-1", hash, 201, async () => Promise.reject(new Error("boom")), db)).rejects.toThrow("boom");
    expect((await idempotent(ctx, "key-fail-1", hash, 201, create, db)).status).toBe(201);
  });

  it("keys are per user: another user's key does not replay", async () => {
    const auth = await connectAsAuth();
    const other = await createMember(auth, ctx.orgId);
    await auth.end();
    const res = await idempotent({ ...ctx, userId: other, visibleOwnerIds: [other] }, "key-replay-1", hash, 201, create, db);
    expect(res.body).not.toEqual({ data: [{ code: "SUCCESS", run: 1 }] });
  });
});
