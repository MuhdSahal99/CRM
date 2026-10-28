import { sql } from "drizzle-orm";
import { z } from "zod";
import { Conflict, NotFound } from "../http/errors.ts";
import type { Tx } from "../tenant.ts";
import { recordEvent, type TimelineEvent } from "../timeline.ts";

export const TransferInput = z.object({ to_user_id: z.uuid() });

/**
 * The record kinds a transfer moves, with the SQL that says a row is still open. Closed records stay with their owner.
 * Sales orders are open until delivered or cancelled.
 */
const TRANSFERABLE: { module: string; table: string; recordType: TimelineEvent["recordType"]; open: string }[] = [
  { module: "Leads", table: "leads", recordType: "lead", open: "NOT is_converted" },
  { module: "Deals", table: "deals", recordType: "deal", open: "stage_id IN (SELECT id FROM stages WHERE record_category = 'open')" },
  { module: "Activities", table: "activities", recordType: "activity", open: "completed_at IS NULL AND coalesce(status, '') NOT IN ('Completed', 'Held', 'Cancelled')" },
  { module: "Quotes", table: "quotes", recordType: "quote", open: "quote_stage NOT IN ('closed_won', 'closed_lost')" },
  { module: "Sales_Orders", table: "sales_orders", recordType: "sales_order", open: "status IN ('created', 'approved')" },
];

/**
 * POST /users/{id}/actions/transfer (US-03): every open lead, deal, quote and activity owned by `id` goes to `to_user_id`, with an
 * `owner_transferred` event per record, all in the caller's transaction. The route is admin-only (user:manage).
 */
export async function transferRecords(tx: Tx, id: string, input: z.infer<typeof TransferInput>) {
  const from = await tx.execute(sql`SELECT 1 FROM member WHERE user_id = ${id}`);
  if (from.rows.length === 0) throw new NotFound();
  const to = (await tx.execute<{ status: string }>(sql`SELECT status FROM member WHERE user_id = ${input.to_user_id}`)).rows[0];
  if (!to) throw new NotFound();
  if (to.status !== "active" || input.to_user_id === id) throw new Conflict("INVALID_STATE", "Choose another active user to receive the records.");

  const counts = [];
  for (const t of TRANSFERABLE) {
    const { rows } = await tx.execute<{ id: string }>(sql`
      UPDATE ${sql.identifier(t.table)} SET owner_id = ${input.to_user_id}, version = version + 1
      WHERE owner_id = ${id} AND deleted_at IS NULL AND ${sql.raw(t.open)} RETURNING id`);
    for (const r of rows) await recordEvent(tx, { recordType: t.recordType, recordId: r.id, eventType: "owner_transferred", changes: { Owner: [id, input.to_user_id] } });
    counts.push({ module: t.module, count: rows.length });
  }
  return counts;
}
