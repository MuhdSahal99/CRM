import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, pgEnum, pgTable, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { REC, recFks } from "./_columns.ts";
import { DOC, lineChecks, lineColumns, quotes } from "./quotes.ts";

// SCHEMA § sales_orders, sales_order_lines (ADR-0007). Grants, RLS and can_see are hand-written (migration 0024).

export const soStatus = pgEnum("so_status", ["created", "approved", "delivered", "cancelled"]);

export const salesOrders = pgTable(
  "sales_orders",
  {
    id: uuid("id").primaryKey(),
    ...REC(),
    ...DOC(),
    soNumber: varchar("so_number", { length: 30 }).notNull(),
    quoteId: uuid("quote_id"),
    customerNo: varchar("customer_no", { length: 40 }),
    purchaseOrderRef: varchar("purchase_order_ref", { length: 60 }),
    dueDate: date("due_date"),
    status: soStatus("status").notNull().default("created"),
  },
  (t) => [
    unique("sales_orders_org_id_id_key").on(t.orgId, t.id),
    unique("sales_orders_number_key").on(t.orgId, t.soNumber),
    check("sales_orders_scale", sql`${t.currencyScale} IN (2, 3)`),
    check("sales_orders_rate_positive", sql`${t.exchangeRate} > 0`),
    check("sales_orders_scale_ok", sql`round(${t.subTotal}, ${t.currencyScale}) = ${t.subTotal} AND round(${t.vatTotal}, ${t.currencyScale}) = ${t.vatTotal} AND round(${t.adjustment}, ${t.currencyScale}) = ${t.adjustment} AND round(${t.grandTotal}, ${t.currencyScale}) = ${t.grandTotal}`),
    check("sales_orders_grand_total", sql`${t.grandTotal} = ${t.subTotal} + ${t.vatTotal} + ${t.adjustment}`),
    check("sales_orders_text_length", sql`char_length(${t.description}) <= 32000 AND char_length(${t.terms}) <= 32000`),
    foreignKey({ name: "sales_orders_quote_fk", columns: [t.orgId, t.quoteId], foreignColumns: [quotes.orgId, quotes.id] }).onDelete("restrict"),
    index("sales_orders_list_idx").on(t.orgId, t.ownerId, t.updatedAt.desc()).where(sql`${t.deletedAt} IS NULL`),
    index("sales_orders_quote_idx").on(t.orgId, t.quoteId),
    index("sales_orders_account_idx").on(t.orgId, t.accountId),
    ...recFks("sales_orders", t),
  ],
);

export const salesOrderLines = pgTable(
  "sales_order_lines",
  { ...lineColumns(), salesOrderId: uuid("sales_order_id").notNull() },
  (t) => [
    unique("sales_order_lines_line_no_key").on(t.orgId, t.salesOrderId, t.lineNo),
    foreignKey({ name: "sales_order_lines_so_fk", columns: [t.orgId, t.salesOrderId], foreignColumns: [salesOrders.orgId, salesOrders.id] }).onDelete("cascade"),
    ...lineChecks("sales_order_lines", t),
    index("sales_order_lines_so_idx").on(t.orgId, t.salesOrderId),
  ],
);
