import { sql } from "drizzle-orm";
import { boolean, char, check, index, integer, numeric, pgTable, text, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { REC, recFks, tstz, ZOHO, zohoIdx } from "./_columns.ts";
import { citext } from "./auth.ts";

// SCHEMA § leads (REC, ZOHO), private to the owner and their managers. The converted_* composite FKs, the audit and
// converted-readonly triggers, grants and RLS are hand-written SQL. converted_deal_id gets its FK with deals (slice 5).

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey(),
    ...REC(),
    ...ZOHO(),
    salutation: varchar("salutation", { length: 20 }),
    firstName: varchar("first_name", { length: 40 }),
    lastName: varchar("last_name", { length: 80 }).notNull(),
    company: varchar("company", { length: 100 }).notNull(),
    designation: varchar("designation", { length: 100 }),
    email: citext("email"),
    secondaryEmail: citext("secondary_email"),
    phone: varchar("phone", { length: 30 }),
    fax: varchar("fax", { length: 30 }),
    mobile: varchar("mobile", { length: 16 }),
    website: varchar("website", { length: 120 }),
    leadSource: varchar("lead_source", { length: 60 }),
    leadStatus: varchar("lead_status", { length: 60 }),
    industry: varchar("industry", { length: 60 }),
    rating: varchar("rating", { length: 60 }),
    annualRevenue: numeric("annual_revenue", { precision: 18, scale: 3 }),
    noOfEmployees: integer("no_of_employees"),
    emailOptOut: boolean("email_opt_out").notNull().default(false),
    street: varchar("street", { length: 250 }),
    city: varchar("city", { length: 30 }),
    state: varchar("state", { length: 30 }),
    zipCode: varchar("zip_code", { length: 30 }),
    country: char("country", { length: 2 }),
    description: text("description"),
    isConverted: boolean("is_converted").notNull().default(false),
    convertedAt: tstz("converted_at"),
    convertedBy: uuid("converted_by"),
    convertedAccountId: uuid("converted_account_id"),
    convertedContactId: uuid("converted_contact_id"),
    convertedDealId: uuid("converted_deal_id"),
  },
  (t) => [
    unique("leads_org_id_id_key").on(t.orgId, t.id),
    check("leads_mobile_e164", sql`${t.mobile} ~ '^[+][1-9][0-9]{6,14}$'`),
    check("leads_email_length", sql`char_length(${t.email}) <= 100 AND char_length(${t.secondaryEmail}) <= 100`),
    check("leads_employees_nonneg", sql`${t.noOfEmployees} >= 0`),
    check("leads_description_length", sql`char_length(${t.description}) <= 32000`),
    check("leads_converted_consistent", sql`${t.isConverted} = (${t.convertedAt} IS NOT NULL)`),
    index("leads_list_idx").on(t.orgId, t.ownerId, t.updatedAt.desc()).where(sql`${t.deletedAt} IS NULL AND NOT ${t.isConverted}`),
    index("leads_email_idx").on(t.orgId, sql`lower(${t.email})`),
    index("leads_name_trgm_idx").using("gin", sql`(${t.company} || ' ' || ${t.lastName}) gin_trgm_ops`),
    zohoIdx("leads", t),
    ...recFks("leads", t),
  ],
);
