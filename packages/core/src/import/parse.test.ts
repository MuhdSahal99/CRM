import { describe, expect, it } from "vitest";
import { ImportError, LIMITS, readCsv, scanCsv, sniffCsv } from "./parse.ts";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("sniffCsv (AC-56)", () => {
  it("accepts UTF-8 text, with or without a BOM", () => {
    expect(() => sniffCsv(bytes("Last Name,Company\nAli,Al Noor\n"))).not.toThrow();
    expect(() => sniffCsv(bytes("﻿Last Name\nAli\n"))).not.toThrow();
  });
  it("refuses a binary renamed .csv: zip/Office, PDF, executables, NUL bytes, and bytes that are not UTF-8", () => {
    expect(() => sniffCsv(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]))).toThrow(/zip/);
    expect(() => sniffCsv(bytes("%PDF-1.7 hello"))).toThrow(/PDF/);
    expect(() => sniffCsv(Uint8Array.from([0x4d, 0x5a, 0x90]))).toThrow(/executable/);
    expect(() => sniffCsv(Uint8Array.from([0x61, 0x2c, 0x62, 0x00, 0x0a]))).toThrow(/not a text file/);
    expect(() => sniffCsv(Uint8Array.from([0x61, 0xff, 0xfe, 0x62, 0x0a]))).toThrow(/UTF-8/);
    expect(() => sniffCsv(new Uint8Array())).toThrow(/empty/);
  });
});

describe("scanCsv and readCsv (AC-56, AC-57)", () => {
  it("returns the headings and the number of data rows, quoted commas and newlines included", async () => {
    const csv = 'Record Id,Account Name,Description\r\n1,"Al Noor, LLC","two\nlines"\r\n2,Beta,\r\n';
    expect(await scanCsv(bytes(csv))).toEqual({ headers: ["Record Id", "Account Name", "Description"], rows: 2 });
  });
  it("AC-57: 5,000 columns is refused with a message", async () => {
    const header = Array.from({ length: 5000 }, (_, i) => `c${i}`).join(",");
    await expect(scanCsv(bytes(`${header}\n${"x,".repeat(4999)}x\n`))).rejects.toThrow(/5000 columns; the limit is 200/);
  });
  it("AC-57: one 5 MB field aborts at the record cap instead of being buffered", async () => {
    const csv = `a,b\n1,"${"x".repeat(5 * 1024 * 1024)}"\n`;
    await expect(scanCsv(bytes(csv))).rejects.toThrow(/larger than 1 MB/);
  });
  it("AC-57: unbalanced quotes fail the file with a message", async () => {
    await expect(scanCsv(bytes('a,b\n1,"never closed\n2,3\n'))).rejects.toThrow(/unclosed or misplaced quote/);
    await expect(scanCsv(bytes('a,b\n1,ab"cd\n'))).rejects.toBeInstanceOf(ImportError);
  });
  it("AC-56: more than the row cap is refused, a file with no data or duplicate headings too", async () => {
    const rows = Array.from({ length: LIMITS.rows + 1 }, (_, i) => `${i},x`).join("\n");
    await expect(scanCsv(bytes(`id,v\n${rows}\n`))).rejects.toThrow(/more than 100,000 rows/);
    await expect(scanCsv(bytes("id,v\n"))).rejects.toThrow(/no data/);
    await expect(scanCsv(bytes("id,id\n1,2\n"))).rejects.toThrow(/unique/);
  });
  it("yields short and long rows as they are, for the row validator to report", async () => {
    const out: string[][] = [];
    for await (const r of readCsv(bytes("a,b,c\n1,2\n1,2,3,4\n"))) out.push(r);
    expect(out).toEqual([["a", "b", "c"], ["1", "2"], ["1", "2", "3", "4"]]);
  });
});
