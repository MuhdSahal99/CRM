import { putFile, type Tx } from "@crm/core";
import { type DocumentData, renderDocumentHtml } from "@crm/pdf";
import { sql } from "drizzle-orm";
import puppeteer, { type Browser } from "puppeteer-core";

// T8.11 (ADR-0010): the only place a PDF is made. The data is read through the job's tenant transaction (RLS), turned into HTML by
// @crm/pdf and printed by headless Chromium that can reach nothing but data: URLs. Storage and the files row are putFile's (T8.08).

type Kind = "invoice_pdf" | "quote_pdf" | "sales_order_pdf";
const DOCS = {
  invoice_pdf: { kind: "invoice", table: "invoices", lines: "invoice_lines", fk: "invoice_id", number: "invoice_number", date: "invoice_date", recordType: "invoice" },
  quote_pdf: { kind: "quote", table: "quotes", lines: "quote_lines", fk: "quote_id", number: "quote_number", date: "created_at::date", recordType: "quote" },
  sales_order_pdf: { kind: "sales_order", table: "sales_orders", lines: "sales_order_lines", fk: "sales_order_id", number: "so_number", date: "created_at::date", recordType: "sales_order" },
} as const;
const T = (name: string) => sql.identifier(name);

type Str = string | null;
const lines = (...parts: (Str | undefined)[]) => parts.filter((p): p is string => !!p);

/** The document as the template wants it. An issued invoice uses its stored seller and buyer snapshots; the others read them live. */
export async function loadDocumentData(tx: Tx, kind: Kind, id: string): Promise<DocumentData | null> {
  const d = DOCS[kind];
  const doc = (await tx.execute<Record<string, any>>(sql`SELECT *, ${sql.raw(d.number)} AS doc_number, (${sql.raw(d.date)})::text AS doc_date FROM ${T(d.table)} WHERE id = ${id} AND deleted_at IS NULL`)).rows[0];
  if (!doc) return null;
  const rows = (await tx.execute<DocumentData["lines"][number]>(sql`
    SELECT description, quantity::text, list_price::text, discount_amount::text, net_amount::text, vat_category, vat_rate::text, vat_amount::text, line_total::text
    FROM ${T(d.lines)} WHERE ${T(d.fk)} = ${id} ORDER BY line_no`)).rows;
  const summary = (await tx.execute<DocumentData["vat_summary"][number]>(sql`
    SELECT vat_category, vat_rate::text, sum(net_amount)::text AS base, sum(vat_amount)::text AS vat FROM ${T(d.lines)} WHERE ${T(d.fk)} = ${id}
    GROUP BY vat_category, vat_rate ORDER BY vat_category, vat_rate`)).rows;

  let seller: Record<string, Str> | undefined = doc.seller_snapshot ?? undefined;
  seller ??= (await tx.execute<Record<string, Str>>(sql`SELECT legal_name, address_line1, address_line2, city, postal_code, country, vat_number FROM org_settings WHERE org_id = app.org_id()`)).rows[0];
  let buyer: Record<string, Str> | undefined = doc.buyer_snapshot ?? undefined;
  buyer ??= (await tx.execute<Record<string, Str>>(sql`
    SELECT account_name AS name, billing_street, billing_city, billing_state, billing_code, billing_country, vat_number FROM accounts WHERE id = ${doc.account_id}`)).rows[0];
  if (!seller || !buyer) return null;

  return {
    kind: d.kind, number: doc.doc_number ?? "DRAFT", date: doc.doc_date ?? "", due_date: doc.due_date ?? null, cancelled: doc.status === "cancelled",
    seller: { name: seller.legal_name ?? "", address: lines(seller.address_line1, seller.address_line2, lines(seller.postal_code, seller.city).join(" "), seller.country), vat_number: seller.vat_number },
    buyer: { name: buyer.name ?? "", address: lines(buyer.billing_street, lines(buyer.billing_code, buyer.billing_city, buyer.billing_state).join(" "), buyer.billing_country), vat_number: buyer.vat_number },
    currency: doc.currency, exchange_rate: doc.exchange_rate, lines: rows, vat_summary: summary, terms: doc.terms,
    totals: { sub_total: doc.sub_total, vat_total: doc.vat_total, adjustment: doc.adjustment, grand_total: doc.grand_total, vat_total_omr: doc.vat_total_omr },
  };
}

let browser: Promise<Browser> | undefined;
const launch = () => {
  const executablePath = process.env.CHROMIUM_PATH;
  if (!executablePath) throw new Error("CHROMIUM_PATH is not set: PDFs are rendered with a pinned Chromium (ADR-0010).");
  // Chromium refuses its sandbox as root, which is how the container runs it; the container is the boundary there.
  return puppeteer.launch({ executablePath, headless: true, args: process.getuid?.() === 0 ? ["--no-sandbox"] : [] });
};
export async function closeBrowser() {
  const b = browser;
  browser = undefined;
  await (await b)?.close();
}

/** Prints HTML to a PDF. Scripts are off and every request except data: is aborted, so the page can reach nothing. */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const b = await (browser ??= launch());
  const page = await b.newPage();
  try {
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (request) => void (request.url().startsWith("data:") || request.url() === "about:blank" ? request.continue() : request.abort()));
    await page.setContent(html, { waitUntil: "load" });
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true }));
  } finally {
    await page.close();
  }
}

/** The `pdf` job: render the pending file once. A redelivered job finds it ready (or missing/foreign) and does nothing. */
export async function renderPdfFile(tx: Tx, fileId: string) {
  const file = (await tx.execute<{ kind: Kind; record_id: string | null; status: string }>(sql`SELECT kind, record_id, status FROM files WHERE id = ${fileId} FOR UPDATE`)).rows[0];
  if (!file) return { skipped: "file not found" };
  if (file.status !== "pending") return { skipped: "already rendered" };
  const data = file.record_id && file.kind in DOCS ? await loadDocumentData(tx, file.kind, file.record_id) : null;
  if (!data) return { skipped: "document not found" };
  await putFile(tx, fileId, await htmlToPdf(renderDocumentHtml(data)));
  return { status: "ready" };
}
