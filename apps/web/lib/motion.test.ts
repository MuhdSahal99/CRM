import { afterEach, describe, expect, it, vi } from "vitest";
import { d, formatCount } from "./motion";

const media = (matches: (q: string) => boolean) => vi.stubGlobal("window", { matchMedia: (q: string) => ({ matches: matches(q) }) });

// Intl puts a no-break space between code and amount; normalise for readable assertions.
const nbsp = new RegExp(String.fromCharCode(160), "g");

afterEach(() => vi.unstubAllGlobals());

describe("d", () => {
  it("passes seconds through normally", () => {
    media(() => false);
    expect(d(0.6)).toBe(0.6);
  });

  it("returns 0 under prefers-reduced-motion", () => {
    media((q) => q.includes("prefers-reduced-motion"));
    expect(d(0.6)).toBe(0);
  });

  it("does not throw without a window (server render)", () => {
    expect(d(1)).toBe(1);
  });
});

describe("formatCount", () => {
  const money = (n: number, currency: "OMR" | "AED") => formatCount(n, { kind: "currency", locale: "en", currency }).replace(nbsp, " ");

  it("formats currency at the currency's scale", () => {
    expect(money(358.19, "OMR")).toBe("OMR 358.190");
    expect(money(1234.5, "AED")).toBe("AED 1,234.50");
  });

  it("formats percent from a 0-100 value", () => {
    expect(formatCount(43.4, { kind: "percent", locale: "en" })).toBe("43%");
  });

  it("formats K/M compactly", () => {
    expect(formatCount(157_000, { kind: "compact", locale: "en" })).toBe("157K");
    expect(formatCount(1_421_350, { kind: "compact", locale: "en" })).toBe("1.4M");
  });

  it("formats plain numbers with grouping and Latin digits", () => {
    expect(formatCount(1234.6, { kind: "number", locale: "ar" })).toBe("1,235");
  });
});
