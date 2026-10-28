import { describe, expect, it } from "vitest";
import { fitsScale, Money, Quantity } from "./schemas.ts";

describe("money schemas (AC-29)", () => {
  it.each(["0", "-1", "1.0001", "NaN", "1e3", "", " 1", "0.000"])("quantity %j is rejected", (q) => expect(Quantity.safeParse(q).success).toBe(false));
  it.each(["1", "0.001", "12.5"])("quantity %j is accepted", (q) => expect(Quantity.safeParse(q).success).toBe(true));
  it.each(["1.0001", "NaN", "1e3", "-1", "Infinity"])("money %j is rejected", (m) => expect(Money.safeParse(m).success).toBe(false));
  it("a number is rejected, strings only", () => expect(Money.safeParse(1.5).success).toBe(false));
  it("scale", () => { expect(fitsScale("1.23", 2)).toBe(true); expect(fitsScale("1.234", 2)).toBe(false); });
});
