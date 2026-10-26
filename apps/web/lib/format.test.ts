import { describe, expect, it } from "vitest";
import { formatMoney } from "./format";

// Intl puts a no-break space between code and amount; normalise for readable assertions.
const fmt = (...args: Parameters<typeof formatMoney>) => formatMoney(...args).replace(/ /g, " ");

describe("formatMoney", () => {
  it("pads OMR to 3 dp", () => {
    expect(fmt("358.19", "OMR", "en")).toBe("OMR 358.190");
    expect(fmt("0", "OMR", "en")).toBe("OMR 0.000");
  });

  it("uses 2 dp for AED and INR", () => {
    expect(fmt("1234.5", "AED", "en")).toBe("AED 1,234.50");
    expect(fmt("99", "INR", "en")).toBe("INR 99.00");
  });

  it("formats negatives (adjustments)", () => {
    expect(fmt("-0.190", "OMR", "en")).toBe("-OMR 0.190");
  });

  it("keeps big decimal strings exact (no float rounding)", () => {
    expect(fmt("123456789012345.678", "OMR", "en")).toBe("OMR 123,456,789,012,345.678");
  });

  it("keeps Latin digits in Arabic locales", () => {
    expect(fmt("10.5", "OMR", "ar-OM")).toMatch(/10\.500|10٫500/);
    expect(fmt("10.5", "OMR", "ar-OM")).not.toMatch(/[٠-٩]/);
  });
});
