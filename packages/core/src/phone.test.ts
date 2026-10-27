import { describe, expect, it } from "vitest";
import { toE164 } from "./phone.ts";

// T2.08 (US-06): mobiles are stored as E.164, matching SCHEMA's CHECK (mobile ~ '^\+[1-9][0-9]{6,14}$').
const E164 = /^\+[1-9][0-9]{6,14}$/;

describe("toE164 (T2.08)", () => {
  it("normalises an Omani national number with OM", () => {
    expect(toE164("9123 4567", "OM")).toBe("+96891234567");
    expect(toE164("9123 4567", "OM")).toMatch(E164);
  });

  it("normalises a UAE mobile with AE, and keeps an international number as is", () => {
    expect(toE164("050 123 4567", "AE")).toBe("+971501234567");
    expect(toE164("+968 9123 4567", "AE")).toBe("+96891234567");
  });

  it("refuses garbage and national numbers without a country", () => {
    expect(toE164("not a phone", "OM")).toBeNull();
    expect(toE164("123", "OM")).toBeNull();
    expect(toE164("9123 4567", null)).toBeNull();
  });
});
