import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, jsonb, pgEnum, pgTable, text, unique, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { REC, recFks, tstz } from "./_columns.ts";
import { DOC, lineChecks, lineColumns } from "./quotes.ts";
import { salesOrders } from "./sales-orders.ts";

// SCHEMA § invoices, invoice_lines (ADR-0007, ADR-0008). Account/contact/deal/currency/product FKs, grants, RLS and the lock
// triggers are hand-written (migration 0025); the pdf_file_id FK arrives with the files table.

export const invoiceStatus = pgEnum("invoice_status", ["draft", "issued", "paid", "cancelled"]);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey(),
    ...REC(),
    ...DOC(),
    invoiceNumber: varchar("invoice_number", { length: 30 }),
    salesOrderId: uuid("sales_order_id"),
    invoiceDate: date("invoice_date"),
    dueDate: date("due_date"),
    customerNo: varchar("customer_no", { length: 40 }),
    purchaseOrderRef: varchar("purchase_order_ref", { length: 60 }),
    status: invoiceStatus("status").notNull().default("draft"),
    issuedAt: tstz("issued_at"),
    issuedBy: uuid("issued_by"),
    sellerSnapshot: jsonb("seller_snapshot"),
    buyerSnapshot: jsonb("buyer_snapshot"),
    paidAt: tstz("paid_at"),
    cancelledAt: tstz("cancelled_at"),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
    pdfFileId: uuid("pdf_file_id"),
  },
  (t) => [
    unique("invoices_org_id_id_key").on(t.orgId, t.id),
    uniqueIndex("invoices_number_key").on(t.orgId, t.invoiceNumber),
    check("invoices_number_when_issued", sql`${t.status} = 'draft' OR ${t.invoiceNumber} IS NOT NULL`),
    check("invoices_scale", sql`${t.currencyScale} IN (2, 3)`),
    check("invoices_rate_positive", sql`${t.exchangeRate} > 0`),
    check("invoices_scale_ok", sql`round(${t.subTotal}, ${t.currencyScale}) = ${t.subTotal} AND round(${t.vatTotal}, ${t.currencyScale}) = ${t.vatTotal} AND round(${t.adjustment}, ${t.currencyScale}) = ${t.adjustment} AND round(${t.grandTotal}, ${t.currencyScale}) = ${t.grandTotal}`),
    check("invoices_grand_total", sql`${t.grandTotal} = ${t.subTotal} + ${t.vatTotal} + ${t.adjustment}`),
    check("invoices_text_length", sql`char_length(${t.description}) <= 32000 AND char_length(${t.terms}) <= 32000`),
    foreignKey({ name: "invoices_sales_order_fk", columns: [t.orgId, t.salesOrderId], foreignColumns: [salesOrders.orgId, salesOrders.id] }).onDelete("restrict"),
    index("invoices_list_idx").on(t.orgId, t.ownerId, t.updatedAt.desc()).where(sql`${t.deletedAt} IS NULL`),
    index("invoices_so_idx").on(t.orgId, t.salesOrderId),
    index("invoices_account_idx").on(t.orgId, t.accountId),
    ...recFks("invoices", t),
  ],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  { ...lineColumns(), invoiceId: uuid("invoice_id").notNull() },
  (t) => [
    unique("invoice_lines_line_no_key").on(t.orgId, t.invoiceId, t.lineNo),
    foreignKey({ name: "invoice_lines_invoice_fk", columns: [t.orgId, t.invoiceId], foreignColumns: [invoices.orgId, invoices.id] }).onDelete("cascade"),
    ...lineChecks("invoice_lines", t),
    index("invoice_lines_invoice_idx").on(t.orgId, t.invoiceId),
  ],
);
