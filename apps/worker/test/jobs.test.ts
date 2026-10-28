import "./env.ts";
import { closeQueues, contextForMember, enqueueAfterCommit, getAuthDb, getQueue, redis, withTenant } from "@crm/core";
import { connectAsApp, connectAsAuth, createMember, createOrg, queryAs } from "@crm/db/testing";
import { Worker } from "bullmq";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runJob, sweepPendingFiles } from "../src/jobs.ts";

// T8.09 (ADR-0011): AC-41 org scoping in jobs, enqueue only after commit, a job that runs out of attempts lands in the failed set.
describe("worker jobs (T8.09)", () => {
  let app: pg.Client;
  const a = {} as Record<string, string>;
  const b = {} as Record<string, string>;
  const file = async (ctx: Record<string, string>, ageMinutes = 0) => (await queryAs(app, ctx, `INSERT INTO files (id, org_id, kind, storage_key, filename, content_type, created_by, created_at)
    VALUES (gen_random_uuid(), app.org_id(), 'invoice_pdf', 'org/' || app.org_id()::text || '/invoice_pdf/' || gen_random_uuid()::text, 'i.pdf', 'application/pdf', $1, now() - make_interval(mins => $2))
    RETURNING id`, [ctx.user_id, ageMinutes]))[0].id as string;
  const payload = (ctx: Record<string, string>, file_id: string) => ({ org_id: ctx.org_id!, user_id: ctx.user_id!, file_id });

  beforeAll(async () => {
    app = await connectAsApp();
    const auth = await connectAsAuth();
    for (const [ctx, org] of [[a, await createOrg(auth)], [b, await createOrg(auth)]] as const) {
      Object.assign(ctx, { org_id: org, user_id: await createMember(auth, org, "admin"), role: "admin", see_all: "on" });
    }
    await auth.end();
  });
  afterAll(async () => {
    await Promise.all([app?.end(), closeQueues(), getAuthDb().$client.end()]);
  });

  it("AC-41: a job with org A's context and an id from org B finds no row and changes nothing", async () => {
    const [mine, theirs] = [await file(a), await file(b)];
    expect(await runJob("pdf", payload(a, mine))).toEqual({ status: "pending" });
    expect(await runJob("pdf", payload(a, theirs))).toEqual({ skipped: "file not found" });
    expect((await queryAs(app, b, "SELECT status FROM files WHERE id = $1", [theirs]))[0].status).toBe("pending");
  });

  it("a user who is not a member of the payload's org does nothing", async () => {
    expect(await runJob("pdf", { org_id: a.org_id, user_id: b.user_id, file_id: await file(a) })).toEqual({ skipped: "no active member" });
  });

  it("a job enqueued inside a rolled-back transaction never exists; after a commit it does", async () => {
    const ctx = (await contextForMember(getAuthDb(), a.user_id!, a.org_id!))!;
    const [gone, kept] = [await file(a), await file(a)];
    await withTenant(ctx, async (tx) => { enqueueAfterCommit(tx, "pdf", payload(a, gone), gone); throw new Error("rollback"); }).catch(() => {});
    await withTenant(ctx, async (tx) => { enqueueAfterCommit(tx, "pdf", payload(a, kept), kept); });
    expect(await getQueue("pdf").getJob(`pdf-${gone}`)).toBeUndefined();
    expect(await getQueue("pdf").getJob(`pdf-${kept}`)).toBeDefined();
  });

  it("a job whose payload is invalid fails into the failed set (the dead-letter queue)", async () => {
    const worker = new Worker("pdf", (job) => runJob("pdf", job.data), { connection: redis() });
    try {
      const failed = new Promise<string>((resolve) => worker.on("failed", (job) => job && resolve(job.id!)));
      const jobId = `bad-${crypto.randomUUID()}`;
      await getQueue("pdf").add("pdf", { not: "a payload" }, { jobId, attempts: 1 });
      expect(await failed).toBe(jobId);
      expect((await getQueue("pdf").getFailed()).map((j) => j.id)).toContain(jobId);
    } finally {
      await worker.close();
    }
  });

  it("the sweeper re-queues a file pending for more than 5 minutes, and only that one", async () => {
    const [stale, fresh] = [await file(a, 10), await file(a, 0)];
    expect(await sweepPendingFiles(a.org_id!)).toBeGreaterThanOrEqual(1);
    expect(await getQueue("pdf").getJob(`pdf-${stale}`)).toBeDefined();
    expect(await getQueue("pdf").getJob(`pdf-${fresh}`)).toBeUndefined();
    expect(await sweepPendingFiles(b.org_id!)).toBe(0);
  });
});
