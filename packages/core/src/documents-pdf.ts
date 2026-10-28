import { sql } from "drizzle-orm";
import { NotFound } from "./http/errors.ts";
import { queueDocumentPdf } from "./invoices/pdf.ts";
import { openFile } from "./storage.ts";
import type { Tx } from "./tenant.ts";

// T8.12 (ADR-0012): GET /{module}/{id}/pdf streams the stored file through the app: the S3 host and key never reach the client.
const DOCS = {
  Invoices: { table: "invoices", kind: "invoice_pdf", number: "invoice_number" },
  Quotes: { table: "quotes", kind: "quote_pdf", number: "quote_number" },
  Sales_Orders: { table: "sales_orders", kind: "sales_order_pdf", number: "so_number" },
} as const;

const queued = () => Response.json({ code: "RENDER_QUEUED", message: "The PDF is being prepared; retry shortly." }, { status: 202, headers: { "Retry-After": "5", "Cache-Control": "no-store, private" } });

/**
 * 404 for a document the caller cannot see (RLS) and for a draft invoice (it has no number yet). An issued invoice returns its
 * stored PDF (the CANCELLED version once cancelled). A quote or sales order returns its latest render; when there is none or the
 * document changed since, a render is queued and the answer is 202 with Retry-After.
 */
export async function getDocumentPdf(tx: Tx, module: string, id: string): Promise<Response> {
  if (!Object.hasOwn(DOCS, module)) throw new NotFound();
  const d = DOCS[module as keyof typeof DOCS];
  const doc = (await tx.execute<{ status: string | null; updated_at: Date; number: string | null }>(sql`
    SELECT ${sql.identifier(d.number)} AS number, updated_at, ${module === "Quotes" ? sql`quote_stage` : sql`status`} AS status FROM ${sql.identifier(d.table)} WHERE id = ${id} AND deleted_at IS NULL`)).rows[0];
  if (!doc || (module === "Invoices" && doc.status === "draft")) throw new NotFound();

  const file = (await tx.execute<{ id: string; status: string; created_at: Date }>(sql`
    SELECT id, status, created_at FROM files WHERE kind = ${d.kind} AND record_id = ${id} AND status <> 'failed' ORDER BY created_at DESC LIMIT 1`)).rows[0];
  const stale = module !== "Invoices" && (!file || (file.status === "ready" && doc.updated_at > file.created_at));
  if (stale) {
    await queueDocumentPdf(tx, d.kind, id, `${doc.number ?? d.table}.pdf`);
    return queued();
  }
  if (!file || file.status !== "ready") return queued(); // an invoice whose render has not finished yet
  const { stream, filename, contentType, size } = await openFile(tx, file.id);
  return new Response(stream, { headers: { "Content-Type": contentType, "Content-Length": String(size), "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "no-store, private" } });
}
