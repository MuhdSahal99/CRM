import { contextForMember, enqueueAfterCommit, getAuthDb, type Payload, QUEUES, type QueueName, type Tx, withTenant } from "@crm/core";
import { sql } from "drizzle-orm";
import { renderPdfFile } from "./pdf.ts";

// T8.09 (ADR-0011): every job opens withTenant as the requesting user, so RLS decides what it can see. An id from another org
// finds no row and the job does nothing (AC-41).

type Handlers = { [Q in QueueName]: (tx: Tx, payload: Payload<Q>) => Promise<unknown> };
export const handlers: Handlers = {
  pdf: (tx, { file_id }) => renderPdfFile(tx, file_id),
  email: async () => ({ skipped: "T9.03" }), // replaced by the SMTP send in the next commit
};

/** Validates the payload (a bad one throws, so the job fails into the dead-letter set), then runs the handler as the member. */
export async function runJob<Q extends QueueName>(name: Q, raw: unknown) {
  const payload = QUEUES[name].payload.parse(raw) as Payload<Q>;
  const ctx = await contextForMember(getAuthDb(), payload.user_id, payload.org_id);
  if (!ctx) return { skipped: "no active member" };
  return withTenant(ctx, (tx) => handlers[name](tx, payload));
}

const STALE_MINUTES = 5;
/** Re-queues files still `pending` after 5 minutes (enqueue failed or the worker died). The jobId dedupes a job that is merely slow. */
export async function sweepPendingFiles(orgId: string): Promise<number> {
  const admin = (await getAuthDb().execute<{ user_id: string }>(sql`SELECT user_id FROM member WHERE org_id = ${orgId} AND role = 'admin' AND status = 'active' LIMIT 1`)).rows[0];
  const ctx = admin && (await contextForMember(getAuthDb(), admin.user_id, orgId));
  if (!ctx) return 0;
  return withTenant(ctx, async (tx) => {
    const { rows } = await tx.execute<{ id: string; created_by: string }>(sql`
      SELECT id, created_by FROM files WHERE status = 'pending' AND kind IN ('quote_pdf', 'sales_order_pdf', 'invoice_pdf') AND created_at < now() - make_interval(mins => ${STALE_MINUTES})`);
    for (const f of rows) enqueueAfterCommit(tx, "pdf", { org_id: orgId, user_id: f.created_by, file_id: f.id }, f.id);
    return rows.length;
  });
}

/** Every org id, for the sweeper. crm_auth reads the auth tables, so this needs no tenant context. */
export const allOrgIds = async () => (await getAuthDb().execute<{ id: string }>(sql`SELECT id FROM orgs`)).rows.map((r) => r.id);
