import { newId } from "@crm/db";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { Conflict, Forbidden, NotFound } from "./http/errors.ts";
import { type PricingLineInput, priceDocument } from "./money/pricing.ts";
import { loadFields } from "./modules/registry.ts";
import { INVOICE, QUOTE, SALES_ORDER, saveLines } from "./quotes/service.ts";
import { takeNext } from "./numbering.ts";
import type { Tx } from "./tenant.ts";
import { recordEvent, type TimelineEvent } from "./timeline.ts";

// T8.02, T8.05 (US-11): a quote becomes a Sales Order and a Sales Order becomes a draft Invoice. Lines, addresses, the
// Account/Contact/Deal, the currency and the STORED exchange rate are copied: the rate is never captured again, so a later
// org rate change cannot move a converted document. The copy is re-priced by priceDocument from the copied lines (their VAT
// snapshot included), so the totals are the engine's, not copied text.

export const ConvertQuoteInput = z.object({ to: z.literal("Sales_Orders") });
export const ConvertSalesOrderInput = z.object({ to: z.literal("Invoices").optional() });

type Doc = { cfg: typeof QUOTE; table: string; recordType: TimelineEvent["recordType"] };
const DOCS = {
  quote: { cfg: QUOTE, table: "quotes", recordType: "quote" },
  sales_order: { cfg: SALES_ORDER, table: "sales_orders", recordType: "sales_order" },
  invoice: { cfg: INVOICE, table: "invoices", recordType: "invoice" },
} satisfies Record<string, Doc>;

const ADDRESS = ["billing", "shipping"].flatMap((side) => ["street", "city", "state", "code", "country"].map((p) => `${side}_${p}`));
const HEADER = ["subject", "account_id", "contact_id", "deal_id", ...ADDRESS, "terms", "description", "currency", "currency_scale", "exchange_rate"];
const LINKS = new Set(["quote_id", "sales_order_id"]);
const REQUIRED = new Set(["subject", "account_id", "currency", "currency_scale", "exchange_rate"]);
/** Totals drive the copy, so the caller must see all of them (and the Adjustment) on both documents, as for Line_Items writes. */
const TOTAL_FIELDS = ["Sub_Total", "VAT_Total", "Grand_Total", "Adjustment"];
const T = (name: string) => sql.identifier(name);

async function convert(tx: Tx, from: keyof typeof DOCS, to: keyof typeof DOCS, id: string, extra: (src: Record<string, any>) => Record<string, unknown>) {
  const [src, dst] = [DOCS[from], DOCS[to]];
  const row = (await tx.execute<Record<string, any>>(sql`SELECT * FROM ${T(src.table)} WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`)).rows[0];
  if (!row) throw new NotFound();

  const [srcFields, dstFields] = await Promise.all([loadFields(tx, src.cfg.module), loadFields(tx, dst.cfg.module)]);
  for (const fields of [srcFields, dstFields]) if (!TOTAL_FIELDS.every((n) => fields.some((f) => f.apiName === n))) throw new Forbidden();
  // The copy writes the new document's Adjustment and every total, so the destination must let this role write the Adjustment (as docChecks does).
  if (dstFields.find((f) => f.apiName === "Adjustment")!.readOnly) throw new Forbidden();
  // A field the role cannot see on either document is not copied across (cross-module copy respects field visibility).
  const visible = new Set(srcFields.filter((f) => dstFields.some((d) => d.columnName === f.columnName)).map((f) => f.columnName));
  const header = HEADER.filter((c) => REQUIRED.has(c) || visible.has(c));

  const lines = (await tx.execute<PricingLineInput & { product_id: string; description: string | null }>(sql`
    SELECT product_id, description, quantity, list_price, discount_type, discount_value, vat_category, vat_rate FROM ${T(src.cfg.lines)}
    WHERE ${T(src.cfg.fk)} = ${id} ORDER BY line_no`)).rows;
  const priced = priceDocument({ lines, adjustment: row.adjustment }, { scale: row.currency_scale, exchangeRate: row.exchange_rate });

  const newRowId = newId();
  const values: [string, unknown][] = [
    ["id", newRowId], ["owner_id", row.owner_id], ...header.map((c): [string, unknown] => [c, row[c]]),
    ["sub_total", priced.sub_total], ["vat_total", priced.vat_total], ["adjustment", priced.adjustment], ["grand_total", priced.grand_total],
    ["vat_total_omr", priced.vat_total_omr], ["grand_total_omr", priced.grand_total_omr],
    ...(dst.cfg.numberCol ? [[dst.cfg.numberCol, await takeNext(tx, dst.cfg.docType)] as [string, unknown]] : []),
    // Data columns beyond the header (customer_no…) go through the same visibility filter; the lineage links are structural.
    ...Object.entries(extra(row)).filter(([c]) => LINKS.has(c) || visible.has(c)),
  ];
  const cols = sql.join(["org_id", ...values.map(([c]) => c)].map(T), sql`, `);
  const vals = sql.join([sql`app.org_id()`, ...values.map(([, v]): SQL => sql`${v}`)], sql`, `);
  await tx.execute(sql`INSERT INTO ${T(dst.table)} (${cols}) VALUES (${vals})`);
  await saveLines(dst.cfg)(tx, newRowId, { saved: { resolved: lines.map((l) => ({ ...l })), priced } });

  await recordEvent(tx, { recordType: dst.recordType, recordId: newRowId, eventType: "created", meta: { converted_from: { record_type: src.recordType, id }, line_count: lines.length } });
  await recordEvent(tx, { recordType: src.recordType, recordId: id, eventType: "converted", meta: { to: { record_type: dst.recordType, id: newRowId } } });
  return { data: [{ code: "SUCCESS", status: "success", details: { id: newRowId } }] };
}

/** POST /Quotes/{id}/actions/convert (US-11): a new Sales Order with `quote_id` set. 404 for a quote the caller cannot see. */
export const convertQuote = (tx: Tx, id: string) => convert(tx, "quote", "sales_order", id, () => ({ quote_id: id }));

/** POST /Sales_Orders/{id}/actions/convert (US-11): a new draft Invoice with no number yet (T8.06 numbers it on issue). */
export async function convertSalesOrder(tx: Tx, id: string) {
  const so = (await tx.execute<{ status: string }>(sql`SELECT status FROM sales_orders WHERE id = ${id} AND deleted_at IS NULL`)).rows[0];
  if (so?.status === "cancelled") throw new Conflict("INVALID_STATE", "A cancelled sales order cannot be invoiced.");
  return convert(tx, "sales_order", "invoice", id, (s) => ({ sales_order_id: id, customer_no: s.customer_no, purchase_order_ref: s.purchase_order_ref, due_date: s.due_date }));
}
