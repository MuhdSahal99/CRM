import { describe, expect, it } from "vitest";
import { sumOmr } from "./pipeline";

describe("sumOmr", () => {
  it("adds decimal strings in thousandths, with no float drift", () => {
    expect(sumOmr(["0.100", "0.200"])).toBe("0.300");
    expect(sumOmr(["1000.000", "58000.500", "0.001"])).toBe("59000.501");
  });
  it("is zero for nothing", () => {
    expect(sumOmr([])).toBe("0.000");
  });
});
