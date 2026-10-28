import { newId } from "@crm/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { ApiError, Forbidden, validationError } from "../http/errors.ts";
import { captureCurrency } from "../money/fx.ts";
import { type PricedDocument, type PricingLineInput, priceDocument, priceFromOmr } from "../money/pricing.ts";
import { DiscountValue, fitsScale, Money, Quantity } from "../money/schemas.ts";
import { effectiveVatRate } from "../money/vat-rate.ts";
import { loadFields } from "../modules/registry.ts"; // call-time use only: registry imports this file
import { takeNext } from "../numbering.ts";
import type { Tx } from "../tenant.ts";

// T7.05, T7.06 (US-10): a quote's header goes through the generic record path; this adds its Line_Items. Only priceDocument
// computes amounts, and every price, quantity and total the client sends is validated here or ignored.

/** Client-sent keys the server owns (AC-20, AC-21): dropped before parsing, never stored. */
export const QUOTE_IGNORED = ["Sub_Total", "VAT_Total", "Grand_Total", "VAT_Total_OMR", "Grand_Total_OMR", "Exchange_Rate", "Quote_Number"];

// Unknown line keys (VAT_Amount, Line_Total…) are stripped by z.object, so a client cannot set an amount.
const LineInput = z.object({
  Product: z.object({ id: z.uuid() }),
  Quantity,
  List_Price: Money.optional(),
  Discount: z.object({ type: z.enum(["percent", "amount"]), value: DiscountValue }).nullable().optional(),
  Description: z.string().max(2000).nullable().optional(),
});
const LinesInput = z.object({ Line_Items: z.array(LineInput).max(200) });

type Resolved = PricingLineInput & { product_id: string; description: string | null };
export type QuoteExtra = { lines?: unknown; saved?: { resolved: Resolved[]; priced: PricedDocument } };

const bad = (message: string, api_name: string) => new ApiError(422, "INVALID_DATA", message, { api_name });

/** The quote rules that need the database: runs on the parsed header (`row`) before it is written; fills the money columns. */
export async function quoteChecks(tx: Tx, row: Record<string, unknown>, before: Record<string, unknown> | undefined, extra: QuoteExtra) {
  if (extra.lines !== undefined) {
    // Line_Items is not a metadata field, so field permissions are applied here: lines drive every total, so the caller must see
    // Grand_Total with all its sources (loadFields hides Grand_Total when one is hidden) and be allowed to write the Adjustment.
    const fields = new Map((await loadFields(tx, "Quotes")).map((f) => [f.apiName, f]));
    if (!["Grand_Total", "Sub_Total", "VAT_Total"].every((n) => fields.has(n)) || !fields.get("Adjustment") || fields.get("Adjustment")!.readOnly) throw new Forbidden();
  }
  const stage = (before?.quote_stage ?? "draft") as string;
  if (before && row.currency !== undefined && row.currency !== before.currency && stage !== "draft") {
    throw bad("The currency can only change while the quote is a draft.", "Currency");
  }
  if (row.deal_id) {
    const deal = (await tx.execute<{ currency: string }>(sql`SELECT currency FROM deals WHERE id = ${row.deal_id as string} AND deleted_at IS NULL`)).rows[0];
    if (!deal) throw bad("The deal does not exist.", "Deal_Name");
    if (!before && row.currency === undefined) row.currency = deal.currency; // a quote from a deal starts in the deal's currency
  }
  await captureCurrency(tx, row, before);
  if (!before) {
    const account = (await tx.execute<Record<string, string | null>>(sql`SELECT * FROM accounts WHERE id = ${row.account_id as string} AND deleted_at IS NULL`)).rows[0];
    if (!account) throw bad("The account does not exist.", "Account_Name");
    // Only the address columns the caller's role can see on the Account: a hidden field must not leak into the quote.
    const visible = new Set((await loadFields(tx, "Accounts")).map((f) => f.columnName));
    for (const side of ["billing", "shipping"]) for (const part of ["street", "city", "state", "code", "country"]) {
      const column = `${side}_${part}`;
      if (!(column in row) && visible.has(column)) row[column] = account[column];
    }
    row.quote_number = await takeNext(tx, "quote");
  }

  const scale = (row.currency_scale ?? before!.currency_scale) as number;
  const rate = (row.exchange_rate ?? before!.exchange_rate) as string;
  const adjustment = (row.adjustment ?? before?.adjustment ?? "0") as string;
  if (!fitsScale(adjustment, scale)) throw bad(`Enter the adjustment with at most ${scale} decimals.`, "Adjustment");

  let resolved: Resolved[];
  if (extra.lines !== undefined) {
    const parsed = LinesInput.safeParse({ Line_Items: extra.lines });
    if (!parsed.success) throw validationError(parsed.error, { Line_Items: extra.lines });
    const lines = parsed.data.Line_Items;
    const ids = [...new Set(lines.map((l) => l.Product.id))];
    const products = new Map((await tx.execute<{ id: string; unit_price: string; vat_category: PricingLineInput["vat_category"]; description: string | null }>(sql`
      SELECT id, unit_price, vat_category, product_name AS description FROM products WHERE id IN ${ids.length ? ids : [newId()]} AND is_active AND deleted_at IS NULL`)).rows.map((p) => [p.id, p]));
    const vat = new Map<string, string | null>();
    resolved = [];
    for (const [i, l] of lines.entries()) {
      const at = (f: string) => `Line_Items.${i}.${f}`;
      const p = products.get(l.Product.id);
      if (!p) throw bad("Choose a product that exists.", at("Product"));
      if (l.List_Price !== undefined && !fitsScale(l.List_Price, scale)) throw bad(`Enter the price with at most ${scale} decimals.`, at("List_Price"));
      if (l.Discount?.type === "percent" && Number(l.Discount.value) > 100) throw bad("A percentage discount cannot exceed 100.", at("Discount"));
      if (l.Discount?.type === "amount" && !fitsScale(l.Discount.value, scale)) throw bad(`Enter the discount with at most ${scale} decimals.`, at("Discount"));
      if (!vat.has(p.vat_category)) vat.set(p.vat_category, await effectiveVatRate(tx, p.vat_category));
      resolved.push({
        product_id: p.id, description: l.Description ?? p.description, quantity: l.Quantity,
        list_price: l.List_Price ?? priceFromOmr(p.unit_price, rate, scale), // an OMR catalogue price becomes price / rate on an AED or INR quote
        discount_type: l.Discount?.type ?? null, discount_value: l.Discount?.value ?? null, vat_category: p.vat_category, vat_rate: vat.get(p.vat_category),
      });
    }
  } else if (before) {
    // No new lines: re-price the stored ones (an adjustment or currency change), keeping their VAT snapshot.
    resolved = (await tx.execute<Resolved>(sql`
      SELECT product_id, description, quantity, list_price, discount_type, discount_value, vat_category, vat_rate FROM quote_lines WHERE quote_id = ${before.id as string} ORDER BY line_no`)).rows;
    for (const l of resolved) if (!fitsScale(l.list_price, scale)) throw bad(`A line price has more than ${scale} decimals: re-enter the lines in this currency.`, "Line_Items");
  } else resolved = [];

  const priced = priceDocument({ lines: resolved, adjustment }, { scale, exchangeRate: rate });
  Object.assign(row, {
    sub_total: priced.sub_total, vat_total: priced.vat_total, adjustment: priced.adjustment, grand_total: priced.grand_total,
    vat_total_omr: priced.vat_total_omr, grand_total_omr: priced.grand_total_omr,
  });
  extra.saved = { resolved, priced };
}

/** Replaces the quote's lines with the priced ones. Returns timeline meta when the client changed the lines. */
export async function saveQuoteLines(tx: Tx, quoteId: string, extra: QuoteExtra) {
  const { resolved, priced } = extra.saved!;
  await tx.execute(sql`DELETE FROM quote_lines WHERE quote_id = ${quoteId}`);
  for (const [i, l] of resolved.entries()) {
    const p = priced.lines[i]!;
    await tx.execute(sql`
      INSERT INTO quote_lines (id, org_id, quote_id, line_no, product_id, description, quantity, list_price, discount_type, discount_value,
        amount, discount_amount, net_amount, vat_category, vat_rate, vat_amount, line_total)
      VALUES (${newId()}, app.org_id(), ${quoteId}, ${i + 1}, ${l.product_id}, ${l.description}, ${l.quantity}, ${l.list_price}, ${l.discount_type ?? null}, ${l.discount_value ?? null},
        ${p.amount}, ${p.discount_amount}, ${p.net_amount}, ${p.vat_category}, ${p.vat_rate}, ${p.vat_amount}, ${p.line_total})`);
  }
  return extra.lines === undefined ? undefined : { line_count: resolved.length };
}

type LineRow = Record<string, any>;

/** GET /Quotes/{id}: adds Line_Items and the VAT summary. Both carry money derived from the totals, so a role that cannot see Grand_Total gets neither. */
export async function quoteDetails(tx: Tx, canSeeTotals: boolean, records: Record<string, unknown>[]) {
  if (!canSeeTotals) return;
  for (const q of records) {
    const lines = (await tx.execute<LineRow>(sql`
      SELECT l.*, p.product_name FROM quote_lines l LEFT JOIN products p ON p.id = l.product_id WHERE l.quote_id = ${q.id as string} ORDER BY l.line_no`)).rows;
    q.Line_Items = lines.map((l) => ({
      id: l.id, Line_No: l.line_no, Product: { id: l.product_id, name: l.product_name }, Description: l.description, Quantity: l.quantity, List_Price: l.list_price,
      Discount: l.discount_type ? { type: l.discount_type, value: l.discount_value } : null, Amount: l.amount, Discount_Amount: l.discount_amount, Net_Amount: l.net_amount,
      VAT_Category: l.vat_category, VAT_Rate: l.vat_rate, VAT_Amount: l.vat_amount, Total: l.line_total,
    }));
    q.VAT_Summary = (await tx.execute(sql`
      SELECT vat_category AS "VAT_Category", sum(net_amount)::text AS "Base", sum(vat_amount)::text AS "VAT" FROM quote_lines WHERE quote_id = ${q.id as string}
      GROUP BY vat_category ORDER BY vat_category`)).rows;
  }
}
