import { describe, expect, it } from "vitest";
import { type DocumentData, renderDocumentHtml } from "./template.tsx";

const base: DocumentData = {
  kind: "invoice", number: "INV-000042", date: "2026-10-28", due_date: "2026-11-27",
  seller: { name: "Saqient LLC", address: ["PO Box 1", "Muscat", "OM"], vat_number: "OM1100000001" },
  buyer: { name: "Al Noor Trading", address: ["Seeb", "OM"], vat_number: "OM2200000002" },
  currency: "AED", exchange_rate: "0.10500000",
  lines: [{ description: "Router", quantity: "2", list_price: "100.00", discount_amount: "0.00", net_amount: "200.00", vat_category: "standard", vat_rate: "5.0000", vat_amount: "10.00", line_total: "210.00" }],
  vat_summary: [{ vat_category: "standard", vat_rate: "5.0000", base: "200.00", vat: "10.00" }],
  totals: { sub_total: "200.00", vat_total: "10.00", adjustment: "0.00", grand_total: "210.00", vat_total_omr: "1.050" },
};

describe("document template (T8.10, US-12)", () => {
  const html = renderDocumentHtml(base);
  it("an issued invoice shows every tax-invoice element", () => {
    for (const text of ["Tax Invoice", "Saqient LLC", "PO Box 1", "VATIN: OM1100000001", "Al Noor Trading", "VATIN: OM2200000002", "2026-10-28", "INV-000042", "Standard rated", "VAT summary", "1.050 OMR", "210.00 AED"]) {
      expect(html, text).toContain(text);
    }
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toContain("CANCELLED");
  });
  it("omits the buyer VATIN when there is none, and watermarks a cancelled invoice", () => {
    const out = renderDocumentHtml({ ...base, buyer: { name: "Walk-in" }, cancelled: true });
    expect(out).not.toContain("OM2200000002");
    expect(out).toContain("CANCELLED");
  });
  it("AC-33: markup in a description, the buyer name or the terms is printed as text", () => {
    const out = renderDocumentHtml({ ...base, buyer: { name: "<script>alert(1)</script>" }, lines: [{ ...base.lines[0]!, description: '<img src=x onerror="alert(1)">' }], terms: "<b>x</b>" });
    expect(out).not.toMatch(/<img|<script|<b>/);
    expect(out).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
  it("a quote and a sales order carry their own titles", () => {
    expect(renderDocumentHtml({ ...base, kind: "quote" })).toContain("Quotation");
    expect(renderDocumentHtml({ ...base, kind: "sales_order" })).toContain("Sales Order");
  });
});
