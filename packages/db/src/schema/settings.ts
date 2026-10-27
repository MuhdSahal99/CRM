import { sql } from "drizzle-orm";
import { char, check, date, foreignKey, integer, numeric, pgEnum, pgTable, smallint, text, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { tstz } from "./_columns.ts";
import { member, orgs } from "./auth.ts";

// SCHEMA § org_settings, vat_rates, exchange_rates. Grants, RLS and triggers are hand-written in each migration.

export const orgSettings = pgTable(
  "org_settings",
  {
    orgId: uuid("org_id").primaryKey().references(() => orgs.id, { onDelete: "restrict" }),
    legalName: varchar("legal_name", { length: 200 }).notNull(),
    addressLine1: varchar("address_line1", { length: 250 }),
    addressLine2: varchar("address_line2", { length: 250 }),
    city: varchar("city", { length: 30 }),
    postalCode: varchar("postal_code", { length: 30 }),
    country: char("country", { length: 2 }).notNull().default("OM"),
    vatNumber: varchar("vat_number", { length: 20 }),
    baseCurrency: char("base_currency", { length: 3 }).notNull().default("OMR"),
    fiscalYearStartMonth: smallint("fiscal_year_start_month").notNull().default(1),
    shareLinkTtlDays: smallint("share_link_ttl_days").notNull().default(7),
    smtpHost: text("smtp_host"),
    smtpPort: integer("smtp_port"),
    smtpUsername: text("smtp_username"),
    smtpFromEmail: text("smtp_from_email"),
    smtpFromName: text("smtp_from_name"),
    smtpSecretRef: text("smtp_secret_ref"),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
    updatedBy: uuid("updated_by"),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    check("org_settings_base_currency", sql`${t.baseCurrency} = 'OMR'`),
    check("org_settings_fiscal_month", sql`${t.fiscalYearStartMonth} BETWEEN 1 AND 12`),
    check("org_settings_ttl", sql`${t.shareLinkTtlDays} BETWEEN 1 AND 30`),
    check("org_settings_smtp_port", sql`${t.smtpPort} BETWEEN 1 AND 65535`),
    foreignKey({ name: "org_settings_updated_by_fk", columns: [t.orgId, t.updatedBy], foreignColumns: [member.orgId, member.userId] }).onDelete("restrict"),
  ],
);

export const vatCategory = pgEnum("vat_category", ["standard", "zero_rated", "exempt"]);

/** Append-only (crm_app has no UPDATE or DELETE): a new rate is a new row with its effective date. */
export const vatRates = pgTable(
  "vat_rates",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    category: vatCategory("category").notNull(),
    rate: numeric("rate", { precision: 7, scale: 4 }).notNull(),
    effectiveFrom: date("effective_from").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
    createdBy: uuid("created_by").notNull(),
  },
  (t) => [
    unique("vat_rates_org_category_from_key").on(t.orgId, t.category, t.effectiveFrom),
    check("vat_rates_category", sql`${t.category} IN ('standard', 'zero_rated')`),
    check("vat_rates_rate_range", sql`${t.rate} BETWEEN 0 AND 100`),
    foreignKey({ name: "vat_rates_created_by_fk", columns: [t.orgId, t.createdBy], foreignColumns: [member.orgId, member.userId] }).onDelete("restrict"),
  ],
);
