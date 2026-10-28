import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { priceDocument, type PricingLineInput } from "./pricing.ts";

const A: PricingLineInput = { quantity: "3", list_price: "100.000", discount_type: "percent", discount_value: "10", vat_category: "standard", vat_rate: "5.0000" };
const B: PricingLineInput = { quantity: "1", list_price: "50.000", vat_category: "zero_rated" };
const C: PricingLineInput = { quantity: "2", list_price: "12.345", vat_category: "exempt" };
const omr = { scale: 3, exchangeRate: "1.00000000" };

describe("priceDocument (US-10 worked example)", () => {
  it("matches the PRD table exactly", () => {
    const p = priceDocument({ lines: [A, B, C], adjustment: "-0.190" }, omr);
    expect(p.lines.map((l) => [l.net_amount, l.vat_amount, l.line_total, l.vat_rate])).toEqual([
      ["270.000", "13.500", "283.500", "5.0000"], ["50.000", "0.000", "50.000", "0.0000"], ["24.690", "0.000", "24.690", null]]);
    // The PRD's "Sub Total 358.190" is sub_total + vat_total (270 + 50 + 24.690 = 344.690, plus 13.500 VAT). Flagged in REVIEW_QUEUE.
    expect(p.sub_total).toBe("344.690");
    expect(p.vat_total).toBe("13.500");
    expect(new Decimal(p.sub_total).plus(p.vat_total).toFixed(3)).toBe("358.190");
    expect(p.grand_total).toBe("358.000");
  });
  it("VAT summary per category", () => {
    const p = priceDocument({ lines: [A, B, C] }, omr);
    expect(p.vat_summary).toEqual([
      { vat_category: "standard", base: "270.000", vat: "13.500" },
      { vat_category: "zero_rated", base: "50.000", vat: "0.000" },
      { vat_category: "exempt", base: "24.690", vat: "0.000" }]);
  });
  it("AED rounds to 2 dp and OMR equivalents to 3 dp at the stored rate", () => {
    const p = priceDocument({ lines: [{ quantity: "3", list_price: "10.005", vat_category: "standard", vat_rate: "5" }] }, { scale: 2, exchangeRate: "0.10480000" });
    expect(p.lines[0]).toMatchObject({ amount: "30.02", net_amount: "30.02", vat_amount: "1.50", line_total: "31.52" });
    expect(p.grand_total).toBe("31.52");
    expect(p.grand_total_omr).toBe("3.303");
    expect(p.vat_total_omr).toBe("0.157");
  });
  it("flat discount vs percent, half-up at .5", () => {
    const flat = priceDocument({ lines: [{ ...A, discount_type: "amount", discount_value: "30.000" }] }, omr);
    expect(flat.lines[0]!.net_amount).toBe("270.000");
    const half = priceDocument({ lines: [{ quantity: "1", list_price: "0.005", vat_category: "exempt" }] }, { scale: 2, exchangeRate: "1" });
    expect(half.lines[0]!.amount).toBe("0.01");
  });
  it("rejects a discount above the amount", () => {
    expect(() => priceDocument({ lines: [{ ...A, discount_type: "amount", discount_value: "999" }] }, omr)).toThrow();
  });
});
