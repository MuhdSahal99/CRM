import { newId } from "@crm/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../http/errors.ts";
import { limitOffset, pageOf } from "../modules/list.ts";
import type { Tx } from "../tenant.ts";

// T6.03 (US-09): rates are OMR per 1 unit of the currency, entered by an Admin with an effective date.

/** "Today" is the calendar date in Asia/Muscat (UTC+4, no DST), whatever the server's zone. */
export const muscatToday = (now = new Date()) => new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 10);

/** No rate is in force for the currency: the document or deal cannot be created until an Admin enters one. */
export class NoEffectiveRate extends ApiError {
  constructor(public currency: string) {
    super(422, "NO_EFFECTIVE_RATE", `No exchange rate for ${currency} is set. Ask an Admin to enter one in Settings.`, { api_name: "Currency" });
  }
}

/** The OMR-per-unit rate in force on `on` (default today in Asia/Muscat), as numeric(18,8) text. OMR is 1. */
export async function exchangeRateFor(tx: Tx, currency: string, on = muscatToday()): Promise<string> {
  if (currency === "OMR") return "1.00000000";
  const { rows } = await tx.execute<{ rate: string }>(sql`
    SELECT rate FROM exchange_rates WHERE currency = ${currency} AND effective_from <= ${on} ORDER BY effective_from DESC LIMIT 1`);
  if (!rows[0]) throw new NoEffectiveRate(currency);
  return rows[0].rate;
}

export const ExchangeRateInput = z.object({
  currency: z.enum(["AED", "INR"]),
  rate: z.string().regex(/^\d{1,10}(\.\d{1,8})?$/, "Enter a rate with up to 8 decimals.").refine((r) => Number(r) > 0, "The rate must be above zero."),
  effective_from: z.iso.date(),
});
export const CreateExchangeRatesInput = z.object({ data: z.array(ExchangeRateInput).min(1).max(10) });
// Not list.ts's Paging: list.ts -> registry.ts -> this file is a cycle, and Paging would still be undefined here.
export const ListExchangeRatesInput = z.object({
  currency: z.enum(["OMR", "AED", "INR"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(200).default(20),
});

/** GET /settings/currencies: each currency with the rate in force today. */
export async function listCurrencies(tx: Tx) {
  return (await tx.execute<{ is_base: boolean; current_rate: string | null }>(sql`
    SELECT c.code, c.scale, c.is_base, r.rate AS current_rate, r.effective_from::text AS current_rate_effective_from
    FROM currencies c LEFT JOIN LATERAL (
      SELECT rate, effective_from FROM exchange_rates e WHERE e.currency = c.code AND e.effective_from <= ${muscatToday()} ORDER BY e.effective_from DESC LIMIT 1) r ON true
    WHERE c.is_active ORDER BY c.is_base DESC, c.code`)).rows.map((c) => ({ ...c, current_rate: c.is_base ? "1.00000000" : c.current_rate }));
}

/** GET /settings/exchange_rates: the history, newest first. */
export async function listExchangeRates(tx: Tx, input: z.infer<typeof ListExchangeRatesInput>) {
  const rows = (await tx.execute(sql`
    SELECT e.id, e.currency, e.rate, e.effective_from::text AS effective_from, json_build_object('id', e.created_by, 'name', u.name) AS created_by
    FROM exchange_rates e LEFT JOIN "user" u ON u.id = e.created_by
    WHERE ${input.currency ? sql`e.currency = ${input.currency}` : sql`true`}
    ORDER BY e.effective_from DESC, e.currency, e.id ${limitOffset(input)}`)).rows;
  return pageOf(rows, input);
}

/** POST /settings/exchange_rates (Admin): appends rates; the same currency and date twice is a 422. Existing rows never change. */
export async function createExchangeRates(tx: Tx, input: z.infer<typeof CreateExchangeRatesInput>) {
  const out = [];
  for (const [i, r] of input.data.entries()) {
    const id = newId();
    try {
      await tx.execute(sql`INSERT INTO exchange_rates (id, org_id, currency, rate, effective_from, created_by)
        VALUES (${id}, app.org_id(), ${r.currency}, ${r.rate}, ${r.effective_from}, NULLIF(current_setting('app.user_id', true), '')::uuid)`);
    } catch (error) {
      if ((error as { cause?: { code?: string } }).cause?.code === "23505") {
        throw new ApiError(422, "DUPLICATE_DATA", "A rate for this currency already starts on that date.", { api_name: `data.${i}.effective_from` });
      }
      throw error;
    }
    out.push({ code: "SUCCESS", status: "success", details: { id } });
  }
  return out;
}

/** US-09: sets currency, currency_scale and exchange_rate on a row being created, and again when its currency changes; otherwise leaves the stored snapshot alone. */
export async function captureCurrency(tx: Tx, row: Record<string, unknown>, before?: Record<string, unknown>, fallback = "OMR") {
  const currency = (row.currency ?? before?.currency ?? fallback) as string;
  if (before && (row.currency === undefined || row.currency === before.currency)) return;
  const scale = (await tx.execute<{ scale: number }>(sql`SELECT scale FROM currencies WHERE code = ${currency} AND is_active`)).rows[0]?.scale;
  if (!scale) throw new ApiError(422, "INVALID_DATA", "This currency is not available.", { api_name: "Currency" });
  Object.assign(row, { currency, currency_scale: scale, exchange_rate: await exchangeRateFor(tx, currency) });
}
