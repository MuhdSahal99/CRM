import { sql } from "drizzle-orm";
import { char, check, date, foreignKey, index, numeric, pgEnum, pgTable, smallint, text, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { REC, recFks, ZOHO, zohoIdx } from "./_columns.ts";
import { orgs } from "./auth.ts";
import { vatCategory } from "./settings.ts";

// SCHEMA § quotes, quote_lines (ADR-0007). Composite FKs that SET NULL one column, grants, RLS and triggers are hand-written (migration 0023).

export const quoteStage = pgEnum("quote_stage", ["draft", "negotiation", "delivered", "on_hold", "confirmed", "closed_won", "closed_lost"]);
export const discountType = pgEnum("discount_type", ["percent", "amount"]);

const address = (p: "billing" | "shipping") => ({
  [`${p}Street`]: varchar(`${p}_street`, { length: 250 }),
  [`${p}City`]: varchar(`${p}_city`, { length: 30 }),
  [`${p}State`]: varchar(`${p}_state`, { length: 30 }),
  [`${p}Code`]: varchar(`${p}_code`, { length: 30 }),
  [`${p}Country`]: char(`${p}_country`, { length: 2 }),
});
const money = (name: string) => numeric(name, { precision: 18, scale: 3 });

/** SCHEMA "Shared header columns" (DOC). */
const DOC = () => ({
  subject: varchar("subject", { length: 255 }).notNull(),
  accountId: uuid("account_id").notNull(),
  contactId: uuid("contact_id"),
  dealId: uuid("deal_id"),
  ...address("billing"),
  ...address("shipping"),
  terms: text("terms"),
  description: text("description"),
  currency: char("currency", { length: 3 }).notNull(),
  currencyScale: smallint("currency_scale").notNull(),
  exchangeRate: numeric("exchange_rate", { precision: 18, scale: 8 }).notNull(),
  subTotal: money("sub_total").notNull(),
  vatTotal: money("vat_total").notNull(),
  adjustment: money("adjustment").notNull().default("0"),
  grandTotal: money("grand_total").notNull(),
  vatTotalOmr: money("vat_total_omr").notNull(),
  grandTotalOmr: money("grand_total_omr").notNull(),
});

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey(),
    ...REC(),
    ...ZOHO(),
    ...DOC(),
    quoteNumber: varchar("quote_number", { length: 30 }).notNull(),
    quoteStage: quoteStage("quote_stage").notNull().default("draft"),
    validTill: date("valid_till"),
  },
  (t) => [
    unique("quotes_org_id_id_key").on(t.orgId, t.id),
    unique("quotes_number_key").on(t.orgId, t.quoteNumber),
    check("quotes_scale", sql`${t.currencyScale} IN (2, 3)`),
    check("quotes_rate_positive", sql`${t.exchangeRate} > 0`),
    check("quotes_scale_ok", sql`round(${t.subTotal}, ${t.currencyScale}) = ${t.subTotal} AND round(${t.vatTotal}, ${t.currencyScale}) = ${t.vatTotal} AND round(${t.adjustment}, ${t.currencyScale}) = ${t.adjustment} AND round(${t.grandTotal}, ${t.currencyScale}) = ${t.grandTotal}`),
    check("quotes_grand_total", sql`${t.grandTotal} = ${t.subTotal} + ${t.vatTotal} + ${t.adjustment}`),
    check("quotes_text_length", sql`char_length(${t.description}) <= 32000 AND char_length(${t.terms}) <= 32000`),
    index("quotes_list_idx").on(t.orgId, t.ownerId, t.updatedAt.desc()).where(sql`${t.deletedAt} IS NULL`),
    index("quotes_deal_idx").on(t.orgId, t.dealId),
    index("quotes_account_idx").on(t.orgId, t.accountId),
    zohoIdx("quotes", t),
    ...recFks("quotes", t),
  ],
);

export const quoteLines = pgTable(
  "quote_lines",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    quoteId: uuid("quote_id").notNull(),
    lineNo: smallint("line_no").notNull(),
    productId: uuid("product_id").notNull(),
    description: text("description"),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    listPrice: money("list_price").notNull(),
    discountType: discountType("discount_type"),
    discountValue: numeric("discount_value", { precision: 18, scale: 4 }),
    amount: money("amount").notNull(),
    discountAmount: money("discount_amount").notNull(),
    netAmount: money("net_amount").notNull(),
    vatCategory: vatCategory("vat_category").notNull(),
    vatRate: numeric("vat_rate", { precision: 7, scale: 4 }),
    vatAmount: money("vat_amount").notNull(),
    lineTotal: money("line_total").notNull(),
  },
  (t) => [
    unique("quote_lines_line_no_key").on(t.orgId, t.quoteId, t.lineNo),
    foreignKey({ name: "quote_lines_quote_fk", columns: [t.orgId, t.quoteId], foreignColumns: [quotes.orgId, quotes.id] }).onDelete("cascade"),
    check("quote_lines_quantity_positive", sql`${t.quantity} > 0`),
    check("quote_lines_price_nonneg", sql`${t.listPrice} >= 0`),
    check("quote_lines_discount", sql`${t.discountValue} IS NULL OR (${t.discountValue} >= 0 AND (${t.discountType} IS DISTINCT FROM 'percent' OR ${t.discountValue} <= 100))`),
    check("quote_lines_net", sql`${t.netAmount} = ${t.amount} - ${t.discountAmount}`),
    check("quote_lines_vat", sql`(${t.vatCategory} = 'standard' OR ${t.vatAmount} = 0) AND ((${t.vatCategory} = 'exempt') = (${t.vatRate} IS NULL))`),
    check("quote_lines_total", sql`${t.lineTotal} = ${t.netAmount} + ${t.vatAmount}`),
    index("quote_lines_quote_idx").on(t.orgId, t.quoteId),
  ],
);
