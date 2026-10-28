import { sql } from "drizzle-orm";
import { z } from "zod";
import { Conflict, Forbidden, NotFound } from "../http/errors.ts";
import type { Tx } from "../tenant.ts";
import { recordEvent } from "../timeline.ts";

// T8.07 (US-12, AC-25): issued -> paid | cancelled, paid -> cancelled for an Admin only. invoices_lock enforces the same in the
// database; this adds the 409/403 answers and the timeline row, written in the same transaction as the change.

export const CancelInvoiceInput = z.object({ reason: z.string().trim().min(3).max(500) });
export const MarkPaidInput = z.object({ paid_on: z.iso.date().optional() }).default({});

type Row = { status: string; invoice_number: string };
const lock = async (tx: Tx, id: string) => {
  const row = (await tx.execute<Row>(sql`SELECT status, invoice_number FROM invoices WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`)).rows[0];
  if (!row) throw new NotFound();
  return row;
};
const done = (id: string, version: number) => ({ data: [{ code: "SUCCESS", status: "success", details: { id, version } }] });

/** POST /Invoices/{id}/actions/cancel. The number is kept. 409 unless issued or paid; cancelling a paid invoice needs an Admin (403). */
export async function cancelInvoice(tx: Tx, id: string, input: z.infer<typeof CancelInvoiceInput>) {
  const row = await lock(tx, id);
  if (row.status !== "issued" && row.status !== "paid") throw new Conflict("INVALID_STATE", `A ${row.status} invoice cannot be cancelled.`);
  if (row.status === "paid" && (await tx.execute<{ r: string }>(sql`SELECT current_setting('app.role', true) AS r`)).rows[0]!.r !== "admin") throw new Forbidden();
  const { rows } = await tx.execute<{ version: number }>(sql`
    UPDATE invoices SET status = 'cancelled', cancelled_at = now(), cancelled_by = NULLIF(current_setting('app.user_id', true), '')::uuid,
      cancel_reason = ${input.reason}, version = version + 1 WHERE id = ${id} RETURNING version`);
  await recordEvent(tx, { recordType: "invoice", recordId: id, eventType: "invoice_cancelled", changes: { Status: [row.status, "cancelled"] }, meta: { reason: input.reason, invoice_number: row.invoice_number } });
  return done(id, rows[0]!.version);
}

/** POST /Invoices/{id}/actions/mark_paid. 409 unless the invoice is issued. */
export async function markInvoicePaid(tx: Tx, id: string, input: z.infer<typeof MarkPaidInput>) {
  const row = await lock(tx, id);
  if (row.status !== "issued") throw new Conflict("INVALID_STATE", `A ${row.status} invoice cannot be marked paid.`);
  const { rows } = await tx.execute<{ version: number }>(sql`
    UPDATE invoices SET status = 'paid', paid_at = COALESCE(${input.paid_on ?? null}::date::timestamptz, now()), version = version + 1 WHERE id = ${id} RETURNING version`);
  await recordEvent(tx, { recordType: "invoice", recordId: id, eventType: "invoice_paid", changes: { Status: ["issued", "paid"] }, meta: { invoice_number: row.invoice_number } });
  return done(id, rows[0]!.version);
}
