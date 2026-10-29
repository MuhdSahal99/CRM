// T11.05 (US-17, AC-55): the errors file is opened in Excel by an Admin, so a cell that starts like a formula must not be one. Everything else is plain RFC 4180.

/** A cell Excel would run as a formula (= + - @, tab, carriage return) gets a leading apostrophe; then CSV quoting. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export const csvLine = (cells: unknown[]) => cells.map(csvCell).join(",");

/** The failed rows: their original cells in the original column order, then the messages. */
export function errorsCsv(headings: string[], rows: { row_no: number; raw: Record<string, string>; errors: { column: string; message: string }[] }[]): string {
  const lines = [csvLine(["Row", ...headings, "Errors"])];
  for (const r of rows) lines.push(csvLine([r.row_no, ...headings.map((h) => r.raw[h] ?? ""), r.errors.map((e) => `${e.column}: ${e.message}`).join(" | ")]));
  return `﻿${lines.join("\r\n")}\r\n`; // a BOM so Excel reads UTF-8 names correctly
}
