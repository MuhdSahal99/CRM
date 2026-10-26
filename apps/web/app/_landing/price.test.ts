import { describe, expect, it } from "vitest";
import { baisa, priceLines, SAMPLE_ADJUSTMENT, SAMPLE_LINES } from "./price";

describe("landing demo pricing", () => {
  it("reproduces the PRD US-10 worked example", () => {
    const r = priceLines(SAMPLE_LINES, SAMPLE_ADJUSTMENT);
    expect(r.lines.map((l) => baisa(l.total))).toEqual(["283.500", "50.000", "24.690"]);
    expect(baisa(r.subTotal)).toBe("344.690");
    expect(baisa(r.vatTotal)).toBe("13.500");
    expect(baisa(r.grandTotal)).toBe("358.000");
    expect(r.summary.map((s) => baisa(s.base))).toEqual(["270.000", "50.000", "24.690"]);
  });

  it("rounds VAT half-up per line", () => {
    // 1 × 0.010 → VAT 0.0005 → 0.001
    const r = priceLines([{ id: "a", qty: 1, priceBaisa: 10, discountPct: 0, vat: "standard" }], 0);
    expect(r.vatTotal).toBe(1);
  });

  it("formats negative and small amounts", () => {
    expect(baisa(-190)).toBe("-0.190");
    expect(baisa(5)).toBe("0.005");
  });
});
