import { contextForMember, enqueueAfterCommit, getAuthDb, type Payload, QUEUES, type QueueName, type TenantContext, withTenant } from "@crm/core";
import { sql } from "drizzle-orm";
import { sendEmailJob, sweepStaleEmails } from "./email.ts";
import { renderPdfFile } from "./pdf.ts";

// T8.09, T9.03 (ADR-0011): every job runs as the requesting member, so RLS decides what it can see. An id from another org finds no row
// and the job does nothing (AC-41). A handler gets the context rather than one transaction because an email job needs several
// (claim, send, record), each committed on its own.

export type Run = { /** True on the job's final BullMQ attempt: a failure is then recorded instead of retried. */ lastAttempt: boolean };
type Handlers = { [Q in QueueName]: (ctx: TenantContext, payload: Payload<Q>, run: Run) => Promise<unknown> };
export const handlers: Handlers = {
  pdf: (ctx, { file_id }) => withTenant(ctx, (tx) => renderPdfFile(tx, file_id)),
  email: (ctx, { email_send_id }, run) => sendEmailJob(ctx, email_send_id, run),
};

/** Validates the payload (a bad one throws, so the job fails into the dead-letter set), then runs the handler as the member. */
export async function runJob<Q extends QueueName>(name: Q, raw: unknown, run: Run = { lastAttempt: true }) {
  const payload = QUEUES[name].payload.parse(raw) as Payload<Q>;
  const ctx = await contextForMember(getAuthDb(), payload.user_id, payload.org_id);
  if (!ctx) return { skipped: "no active member" };
  return handlers[name](ctx, payload, run);
}

/** The context of an active admin of the org, for sweeps that must read the org's rows without a request behind them. */
async function sweepContext(orgId: string) {
  const admin = (await getAuthDb().execute<{ user_id: string }>(sql`SELECT user_id FROM member WHERE org_id = ${orgId} AND role = 'admin' AND status = 'active' LIMIT 1`)).rows[0];
  return admin ? contextForMember(getAuthDb(), admin.user_id, orgId) : null;
}

const STALE_MINUTES = 5;
/** Re-queues files still `pending` after 5 minutes (enqueue failed or the worker died). The jobId dedupes a job that is merely slow. */
export async function sweepPendingFiles(orgId: string): Promise<number> {
  const ctx = await sweepContext(orgId);
  if (!ctx) return 0;
  return withTenant(ctx, async (tx) => {
    const { rows } = await tx.execute<{ id: string; created_by: string }>(sql`
      SELECT id, created_by FROM files WHERE status = 'pending' AND kind IN ('quote_pdf', 'sales_order_pdf', 'invoice_pdf') AND created_at < now() - make_interval(mins => ${STALE_MINUTES})`);
    for (const f of rows) enqueueAfterCommit(tx, "pdf", { org_id: orgId, user_id: f.created_by, file_id: f.id }, f.id);
    return rows.length;
  });
}

/** The sweeper's pass over one org: stale PDFs and stale emails (ADR-0011: the source row is the outbox). */
export async function sweepOrg(orgId: string) {
  const ctx = await sweepContext(orgId);
  return (await sweepPendingFiles(orgId)) + (ctx ? await sweepStaleEmails(ctx, STALE_MINUTES) : 0);
}

/** Every org id, for the sweeper. crm_auth reads the auth tables, so this needs no tenant context. */
export const allOrgIds = async () => (await getAuthDb().execute<{ id: string }>(sql`SELECT id FROM orgs`)).rows.map((r) => r.id);
