import Decimal from "decimal.js";
import { ApiError } from "../http/errors.ts";

// T7.01 (ADR-0007): the only code that computes document amounts. Strings in, strings out, never `number`.
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type VatCategory = "standard" | "zero_rated" | "exempt";
export type PricingLineInput = {
  quantity: string;
  list_price: string;
  discount_type?: "percent" | "amount" | null;
  discount_value?: string | null;
  vat_category: VatCategory;
  /** Percentage, e.g. "5.0000"; ignored unless the category is standard. */
  vat_rate?: string | null;
};
export type PricingInput = { lines: PricingLineInput[]; adjustment?: string };
export type PricingCtx = { scale: number; exchangeRate: string };
export type PricedLine = {
  amount: string; discount_amount: string; net_amount: string;
  vat_category: VatCategory; vat_rate: string | null; vat_amount: string; line_total: string;
};
export type PricedDocument = {
  lines: PricedLine[];
  vat_summary: { vat_category: VatCategory; base: string; vat: string }[];
  sub_total: string; vat_total: string; adjustment: string; grand_total: string;
  vat_total_omr: string; grand_total_omr: string;
};

const r = (x: Decimal, dp: number) => x.toDecimalPlaces(dp, Decimal.ROUND_HALF_UP);
const invalid = (msg: string) => new ApiError(422, "INVALID_DATA", msg);

export function priceDocument(input: PricingInput, ctx: PricingCtx): PricedDocument {
  const { scale } = ctx;
  const sum = (xs: Decimal[]) => xs.reduce((a, b) => a.plus(b), new D(0));
  const raw = input.lines.map((l) => {
    const amount = r(new D(l.quantity).times(l.list_price), scale);
    const dv = new D(l.discount_value ?? 0);
    const discount = !l.discount_type ? new D(0) : r(l.discount_type === "percent" ? amount.times(dv).div(100) : dv, scale);
    if (discount.gt(amount)) throw invalid("A discount cannot exceed the line amount.");
    const net = amount.minus(discount);
    const standard = l.vat_category === "standard";
    if (standard && l.vat_rate == null) throw invalid("A standard-rated line needs a VAT rate.");
    const vat = standard ? r(net.times(l.vat_rate!).div(100), scale) : new D(0);
    return { l, amount, discount, net, vat, total: net.plus(vat) };
  });
  const subTotal = sum(raw.map((x) => x.net));
  const vatTotal = sum(raw.map((x) => x.vat));
  const adjustment = r(new D(input.adjustment ?? 0), scale);
  const grand = subTotal.plus(vatTotal).plus(adjustment);
  const s = (x: Decimal) => x.toFixed(scale);
  const omr = (x: Decimal) => r(x.times(ctx.exchangeRate), 3).toFixed(3);
  const summary = (["standard", "zero_rated", "exempt"] as const).flatMap((c) => {
    const ls = raw.filter((x) => x.l.vat_category === c);
    return ls.length ? [{ vat_category: c, base: s(sum(ls.map((x) => x.net))), vat: s(sum(ls.map((x) => x.vat))) }] : [];
  });
  return {
    lines: raw.map((x) => ({
      amount: s(x.amount), discount_amount: s(x.discount), net_amount: s(x.net), vat_category: x.l.vat_category,
      vat_rate: x.l.vat_category === "exempt" ? null : (x.l.vat_rate ?? "0.0000"), vat_amount: s(x.vat), line_total: s(x.total),
    })),
    vat_summary: summary, sub_total: s(subTotal), vat_total: s(vatTotal), adjustment: s(adjustment), grand_total: s(grand),
    vat_total_omr: omr(vatTotal), grand_total_omr: omr(grand),
  };
}

/** An OMR catalogue price on a document in another currency: price / rate, rounded to the document's scale (ADR-0007). */
export const priceFromOmr = (omrPrice: string, rate: string, scale: number) => r(new D(omrPrice).div(rate), scale).toFixed(scale);
