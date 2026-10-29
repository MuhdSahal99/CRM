import { describe, expect, it } from "vitest";
import { countsAdd, sameValue } from "./reconcile.ts";

const job = { total_rows: 100, imported_rows: 90, duplicate_rows: 6, error_rows: 4, valid_rows: 0, flagged_rows: 3 };

describe("reconciliation (T11.10)", () => {
  it("counts per module equal imported + duplicate + error rows", () => {
    expect(countsAdd(job)).toEqual({ ok: true, accounted: 100, total: 100 });
  });
  it("flags a row that is unaccounted for, double-counted, or still waiting", () => {
    expect(countsAdd({ ...job, imported_rows: 89 }).ok).toBe(false);
    expect(countsAdd({ ...job, error_rows: 5 }).ok).toBe(false);
    expect(countsAdd({ ...job, valid_rows: 1 }).ok).toBe(false);
  });
  it("compares values the way the CRM stores them", () => {
    expect(sameValue("1000.500", "1000.5")).toBe(true);
    expect(sameValue(1000, "1000.000")).toBe(true);
    expect(sameValue("+968 9123 4567", "+96891234567")).toBe(true);
    expect(sameValue("Retail", "Retail")).toBe(true);
    expect(sameValue(true, true)).toBe(true);
    expect(sameValue("", null)).toBe(true);
    expect(sameValue("Retail", "Technology")).toBe(false);
    expect(sameValue("1000.500", "1000.501")).toBe(false);
    expect(sameValue(true, false)).toBe(false);
    expect(sameValue("x", null)).toBe(false);
  });
});
