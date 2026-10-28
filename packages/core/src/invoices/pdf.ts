import { sql } from "drizzle-orm";
import { enqueueAfterCommit } from "../jobs/enqueue.ts";
import { createFile } from "../storage.ts";
import type { Tx } from "../tenant.ts";

/** A pending invoice_pdf file for the invoice and its render job, queued once the caller's transaction commits (T8.11, ADR-0010). */
export async function queueInvoicePdf(tx: Tx, invoiceId: string, filename: string): Promise<string> {
  const file = await createFile(tx, { kind: "invoice_pdf", filename, contentType: "application/pdf", record: { type: "invoice", id: invoiceId } });
  const { o, u } = (await tx.execute<{ o: string; u: string }>(sql`SELECT app.org_id() AS o, current_setting('app.user_id', true) AS u`)).rows[0]!;
  enqueueAfterCommit(tx, "pdf", { org_id: o, user_id: u, file_id: file.id }, file.id);
  return file.id;
}
