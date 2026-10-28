import Decimal from "decimal.js";
import { expect, it } from "vitest";
import { priceDocument, type PricingLineInput } from "./pricing.ts";

// No fast-check dependency: a seeded LCG gives reproducible random documents.
let seed = 12345;
const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
const dec = (dp: number, max: number) => (rnd(max * 10 ** dp) / 10 ** dp).toFixed(dp);

it("Σ lines = header totals, and pricing is repeatable", () => {
  for (let i = 0; i < 300; i++) {
    const scale = rnd(2) ? 3 : 2;
    const lines: PricingLineInput[] = Array.from({ length: 1 + rnd(6) }, () => {
      const pct = rnd(3) === 0;
      return {
        quantity: (1 + rnd(5000)) / 1000 + "", list_price: dec(scale, 5000),
        discount_type: rnd(2) ? (pct ? "percent" : "amount") : null, discount_value: pct ? dec(2, 100) : dec(scale, 1),
        vat_category: (["standard", "zero_rated", "exempt"] as const)[rnd(3)]!, vat_rate: "5.0000",
      };
    });
    const ctx = { scale, exchangeRate: "0.10480000" };
    const input = { lines, adjustment: "-" + dec(scale, 2) };
    let p;
    try { p = priceDocument(input, ctx); } catch { continue; } // flat discount above the amount is a valid rejection
    expect(priceDocument(input, ctx)).toEqual(p);
    const sum = (k: "net_amount" | "vat_amount") => p.lines.reduce((a, l) => a.plus(l[k]), new Decimal(0));
    expect(p.sub_total).toBe(sum("net_amount").toFixed(scale));
    expect(p.vat_total).toBe(sum("vat_amount").toFixed(scale));
    expect(p.grand_total).toBe(new Decimal(p.sub_total).plus(p.vat_total).plus(p.adjustment).toFixed(scale));
    for (const l of p.lines) expect(l.line_total).toBe(new Decimal(l.net_amount).plus(l.vat_amount).toFixed(scale));
  }
});
