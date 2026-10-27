import { sql } from "drizzle-orm";
import { char, check, index, integer, numeric, pgTable, text, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { REC, recFks, ZOHO, zohoIdx } from "./_columns.ts";
import { citext } from "./auth.ts";

// SCHEMA § accounts (REC, ZOHO), public in org. The parent FK (ON DELETE SET NULL (parent_account_id)), the audit
// trigger, grants and RLS are hand-written SQL.

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey(),
    ...REC(),
    ...ZOHO(),
    accountName: varchar("account_name", { length: 100 }).notNull(),
    parentAccountId: uuid("parent_account_id"),
    accountNumber: varchar("account_number", { length: 40 }),
    accountSite: varchar("account_site", { length: 80 }),
    tickerSymbol: varchar("ticker_symbol", { length: 20 }),
    accountType: varchar("account_type", { length: 60 }),
    ownership: varchar("ownership", { length: 60 }),
    industry: varchar("industry", { length: 60 }),
    rating: varchar("rating", { length: 60 }),
    phone: varchar("phone", { length: 30 }),
    fax: varchar("fax", { length: 30 }),
    email: citext("email"),
    website: varchar("website", { length: 120 }),
    employees: integer("employees"),
    sicCode: integer("sic_code"),
    annualRevenue: numeric("annual_revenue", { precision: 18, scale: 3, mode: "string" }),
    vatNumber: varchar("vat_number", { length: 20 }),
    billingStreet: varchar("billing_street", { length: 250 }),
    billingCity: varchar("billing_city", { length: 30 }),
    billingState: varchar("billing_state", { length: 30 }),
    billingCode: varchar("billing_code", { length: 30 }),
    billingCountry: char("billing_country", { length: 2 }),
    shippingStreet: varchar("shipping_street", { length: 250 }),
    shippingCity: varchar("shipping_city", { length: 30 }),
    shippingState: varchar("shipping_state", { length: 30 }),
    shippingCode: varchar("shipping_code", { length: 30 }),
    shippingCountry: char("shipping_country", { length: 2 }),
    description: text("description"),
  },
  (t) => [
    unique("accounts_org_id_id_key").on(t.orgId, t.id),
    check("accounts_parent_not_self", sql`${t.parentAccountId} <> ${t.id}`),
    check("accounts_description_length", sql`char_length(${t.description}) <= 32000`),
    check("accounts_employees_check", sql`${t.employees} >= 0`),
    index("accounts_list_idx").on(t.orgId, t.ownerId, t.updatedAt.desc()).where(sql`${t.deletedAt} IS NULL`),
    index("accounts_name_idx").on(t.orgId, sql`lower(${t.accountName})`).where(sql`${t.deletedAt} IS NULL`),
    index("accounts_name_trgm_idx").using("gin", t.accountName.op("gin_trgm_ops")),
    index("accounts_parent_idx").on(t.orgId, t.parentAccountId),
    zohoIdx("accounts", t),
    ...recFks("accounts", t),
  ],
);
