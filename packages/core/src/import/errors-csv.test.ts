import { describe, expect, it } from "vitest";
import { csvCell, errorsCsv } from "./errors-csv.ts";

describe("errors CSV (AC-55)", () => {
  it.each([['=HYPERLINK("http://x")', `'=HYPERLINK(""http://x"")`], ["+1+cmd", "'+1+cmd"], ["@SUM(A1)", "'@SUM(A1)"], ["-2+3", "'-2+3"], ["\tTab", "'\tTab"]])("prefixes %s with an apostrophe", (input, expected) => {
    const cell = csvCell(input);
    expect(cell.replace(/^"|"$/g, "")).toBe(expected);
  });
  it("quotes commas, quotes and newlines, and leaves ordinary text alone", () => {
    expect(csvCell("Al Noor")).toBe("Al Noor");
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
  });
  it("writes the original columns, then every message, and starts with a BOM", () => {
    const out = errorsCsv(["Record Id", "Account Name"], [{ row_no: 3, raw: { "Record Id": "z1", "Account Name": "=cmd|' /C calc'!A0" }, errors: [{ column: "Account Name", message: "Too long" }, { column: "Phone", message: "Bad" }] }]);
    expect(out.startsWith("﻿Row,Record Id,Account Name,Errors\r\n")).toBe(true);
    expect(out).toContain("3,z1,'=cmd|' /C calc'!A0,Account Name: Too long | Phone: Bad");
  });
});
