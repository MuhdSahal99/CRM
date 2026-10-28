import { sql } from "drizzle-orm";
import { enqueueAfterCommit } from "../jobs/enqueue.ts";
import { createFile } from "../storage.ts";
import type { Tx } from "../tenant.ts";

type Kind = "invoice_pdf" | "quote_pdf" | "sales_order_pdf";
const RECORD = { invoice_pdf: "invoice", quote_pdf: "quote", sales_order_pdf: "sales_order" } as const;

/** A pending PDF file for the document and its render job, queued once the caller's transaction commits (T8.11, ADR-0010). */
export async function queueDocumentPdf(tx: Tx, kind: Kind, id: string, filename: string): Promise<string> {
  const file = await createFile(tx, { kind, filename, contentType: "application/pdf", record: { type: RECORD[kind], id } });
  const { o, u } = (await tx.execute<{ o: string; u: string }>(sql`SELECT app.org_id() AS o, current_setting('app.user_id', true) AS u`)).rows[0]!;
  enqueueAfterCommit(tx, "pdf", { org_id: o, user_id: u, file_id: file.id }, file.id);
  return file.id;
}
export const queueInvoicePdf = (tx: Tx, invoiceId: string, filename: string) => queueDocumentPdf(tx, "invoice_pdf", invoiceId, filename);
