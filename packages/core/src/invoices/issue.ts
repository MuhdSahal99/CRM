import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireFieldWrite } from "../field-access.ts";
import { ApiError, Conflict, NotFound } from "../http/errors.ts";
import { muscatToday } from "../money/fx.ts";
import { type PricingLineInput, priceDocument } from "../money/pricing.ts";
import { takeNext } from "../numbering.ts";
import { queueInvoicePdf } from "./pdf.ts";
import type { Tx } from "../tenant.ts";
import { recordEvent } from "../timeline.ts";

// T8.06 (US-12, ADR-0008, AC-26/27): issuing is one transaction. The draft is locked FOR UPDATE, re-priced and compared with
// its stored totals, then numbered from document_sequences, so a rollback anywhere returns the number (gap-free). The
// seller and buyer are snapshotted so a later edit of the org or account cannot change an issued invoice.

export const IssueInvoiceInput = z.object({});

/** POST /Invoices/{id}/actions/issue. 404 for an invoice the caller cannot see; 409 INVALID_STATE unless it is a draft. */
export async function issueInvoice(tx: Tx, id: string) {
  await requireFieldWrite(tx, "Invoices", "Status");
  const inv = (await tx.execute<Record<string, any>>(sql`SELECT * FROM invoices WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`)).rows[0];
  if (!inv) throw new NotFound();
  if (inv.status !== "draft") throw new Conflict("INVALID_STATE", `A ${inv.status} invoice cannot be issued.`);

  const lines = (await tx.execute<PricingLineInput>(sql`
    SELECT quantity, list_price, discount_type, discount_value, vat_category, vat_rate FROM invoice_lines WHERE invoice_id = ${id} ORDER BY line_no`)).rows;
  if (lines.length === 0) throw new ApiError(422, "INVALID_DATA", "Add at least one line before issuing.", { api_name: "Line_Items" });
  const priced = priceDocument({ lines, adjustment: inv.adjustment }, { scale: inv.currency_scale, exchangeRate: inv.exchange_rate });
  const stored = { sub_total: inv.sub_total, vat_total: inv.vat_total, grand_total: inv.grand_total, vat_total_omr: inv.vat_total_omr, grand_total_omr: inv.grand_total_omr };
  for (const [k, v] of Object.entries(stored)) {
    if (Number(priced[k as keyof typeof stored]) !== Number(v)) throw new Conflict("INVALID_STATE", "The stored totals no longer match the lines; nothing was issued.");
  }

  const seller = (await tx.execute<Record<string, string | null>>(sql`
    SELECT legal_name, address_line1, address_line2, city, postal_code, country, vat_number FROM org_settings WHERE org_id = app.org_id()`)).rows[0];
  if (!seller?.legal_name) throw new ApiError(422, "INVALID_DATA", "Set the legal name and VAT number in the organisation settings before issuing.");
  const buyer = (await tx.execute<Record<string, string | null>>(sql`
    SELECT account_name AS name, billing_street, billing_city, billing_state, billing_code, billing_country, vat_number FROM accounts WHERE id = ${inv.account_id}`)).rows[0];
  if (!buyer) throw new NotFound(); // the buyer account is no longer visible to the caller

  const number = await takeNext(tx, "invoice");
  const { rows } = await tx.execute<{ version: number }>(sql`
    UPDATE invoices SET status = 'issued', invoice_number = ${number}, invoice_date = ${muscatToday()}, issued_at = now(),
      issued_by = NULLIF(current_setting('app.user_id', true), '')::uuid,
      seller_snapshot = ${JSON.stringify(seller)}::jsonb, buyer_snapshot = ${JSON.stringify(buyer)}::jsonb, version = version + 1
    WHERE id = ${id} RETURNING version`);
  // The PDF is rendered once, by the worker after this commits; the invoice keeps the pending file as its issued PDF (immutable once ready).
  await tx.execute(sql`UPDATE invoices SET pdf_file_id = ${await queueInvoicePdf(tx, id, `${number}.pdf`)} WHERE id = ${id}`);
  await recordEvent(tx, { recordType: "invoice", recordId: id, eventType: "invoice_issued", changes: { Status: ["draft", "issued"], Invoice_Number: [null, number] } });
  return { data: [{ code: "SUCCESS", status: "success", details: { id, version: rows[0]!.version, Invoice_Number: number } }] };
}
