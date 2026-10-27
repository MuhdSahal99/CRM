import { newId } from "@crm/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../http/errors.ts";
import type { Tx } from "../tenant.ts";

// T6.02 (US-08): VAT rates are config rows with an effective date; documents snapshot the rate they used (TRD § VAT rate).
export const VatRateInput = z.object({
  category: z.enum(["standard", "zero_rated"]),
  rate: z.string().regex(/^\d{1,3}(\.\d{1,4})?$/, "Enter a percentage with up to 4 decimals.").refine((r) => Number(r) <= 100, "A rate cannot exceed 100."),
  effective_from: z.iso.date(),
});
export const CreateVatRatesInput = z.object({ data: z.array(VatRateInput).min(1).max(2) });

/** Today's date in Asia/Muscat, the day "effective" is judged on. */
export const TODAY_MUSCAT = sql`(now() AT TIME ZONE 'Asia/Muscat')::date`;

/** The rate in force on `on` (default today in Asia/Muscat): the latest row with effective_from <= on. Exempt has no rate (null). */
export async function effectiveVatRate(tx: Tx, category: "standard" | "zero_rated" | "exempt", on?: string): Promise<string | null> {
  if (category === "exempt") return null;
  const { rows } = await tx.execute<{ rate: string }>(sql`
    SELECT rate FROM vat_rates WHERE category = ${category} AND effective_from <= ${on ?? TODAY_MUSCAT} ORDER BY effective_from DESC LIMIT 1`);
  if (!rows[0]) throw new ApiError(422, "INVALID_DATA", "No VAT rate is in force for this category on that date.", { api_name: "VAT_Category" });
  return rows[0].rate;
}

/** GET /settings/vat_rates: every row (history), newest first within a category. */
export async function listVatRates(tx: Tx) {
  return (await tx.execute(sql`SELECT id, category, rate, effective_from::text AS effective_from FROM vat_rates ORDER BY category, effective_from DESC`)).rows;
}

/** POST /settings/vat_rates (Admin): appends rows; the same category and date twice is a 422. Existing rows are never changed. */
export async function createVatRates(tx: Tx, input: z.infer<typeof CreateVatRatesInput>) {
  const out = [];
  for (const [i, r] of input.data.entries()) {
    const id = newId();
    try {
      await tx.execute(sql`INSERT INTO vat_rates (id, org_id, category, rate, effective_from, created_by) VALUES (${id}, app.org_id(), ${r.category}, ${r.rate}, ${r.effective_from}, NULLIF(current_setting('app.user_id', true), '')::uuid)`);
    } catch (error) {
      if ((error as { cause?: { code?: string } }).cause?.code === "23505") {
        throw new ApiError(422, "DUPLICATE_DATA", "A rate for this category already starts on that date.", { api_name: `data.${i}.effective_from` });
      }
      throw error;
    }
    out.push({ code: "SUCCESS", status: "success", details: { id } });
  }
  return out;
}
