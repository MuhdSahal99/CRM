import { sql } from "drizzle-orm";
import { NotFound } from "./http/errors.ts";
import { queueDocumentPdf } from "./invoices/pdf.ts";
import { openFile } from "./storage.ts";
import type { Tx } from "./tenant.ts";

// T8.12 (ADR-0012): GET /{module}/{id}/pdf streams the stored file through the app: the S3 host and key never reach the client.
export const DOCS = {
  Invoices: { table: "invoices", kind: "invoice_pdf", number: "invoice_number", recordType: "invoice", title: "Tax Invoice" },
  Quotes: { table: "quotes", kind: "quote_pdf", number: "quote_number", recordType: "quote", title: "Quotation" },
  Sales_Orders: { table: "sales_orders", kind: "sales_order_pdf", number: "so_number", recordType: "sales_order", title: "Sales Order" },
} as const;
export type DocModule = keyof typeof DOCS;
export const isDocModule = (module: string): module is DocModule => Object.hasOwn(DOCS, module);

const queued = () => Response.json({ code: "RENDER_QUEUED", message: "The PDF is being prepared; retry shortly." }, { status: 202, headers: { "Retry-After": "5", "Cache-Control": "no-store, private" } });

/**
 * The document's current PDF file, queueing a render when there is none. 404 for a document the caller cannot see (RLS) and for a
 * draft invoice (no number yet). An issued invoice has one file (the CANCELLED version once cancelled, never stale). A quote or sales
 * order is re-rendered when it changed after its latest render. `file.status` is `pending` until the worker has stored it.
 */
export async function currentPdf(tx: Tx, module: string, id: string) {
  if (!isDocModule(module)) throw new NotFound();
  const d = DOCS[module];
  const doc = (await tx.execute<{ status: string | null; updated_at: Date; number: string | null }>(sql`
    SELECT ${sql.identifier(d.number)} AS number, updated_at, ${module === "Quotes" ? sql`quote_stage` : sql`status`} AS status FROM ${sql.identifier(d.table)} WHERE id = ${id} AND deleted_at IS NULL`)).rows[0];
  if (!doc || (module === "Invoices" && doc.status === "draft")) throw new NotFound();

  let file = (await tx.execute<{ id: string; status: "pending" | "ready"; created_at: Date }>(sql`
    SELECT id, status, created_at FROM files WHERE kind = ${d.kind} AND record_id = ${id} AND status <> 'failed' ORDER BY created_at DESC LIMIT 1`)).rows[0];
  if (module !== "Invoices" && (!file || (file.status === "ready" && doc.updated_at > file.created_at))) {
    file = { id: await queueDocumentPdf(tx, d.kind, id, `${doc.number ?? d.table}.pdf`), status: "pending", created_at: new Date() };
  }
  return { number: doc.number, file: file ?? null };
}

/** 202 with Retry-After until the worker has stored the PDF, then the bytes. */
export async function getDocumentPdf(tx: Tx, module: string, id: string): Promise<Response> {
  const { file } = await currentPdf(tx, module, id);
  if (!file || file.status !== "ready") return queued();
  const { stream, filename, contentType, size } = await openFile(tx, file.id);
  return new Response(stream, { headers: { "Content-Type": contentType, "Content-Length": String(size), "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "no-store, private" } });
}
