import { sql } from "drizzle-orm";
import { boolean, char, check, date, index, pgTable, text, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { REC, recFks, ZOHO, zohoIdx } from "./_columns.ts";
import { citext } from "./auth.ts";

// SCHEMA § contacts (REC, ZOHO), public in org. The account and reporting_to FKs (ON DELETE SET NULL (column)), the
// audit trigger, grants and RLS are hand-written SQL. converted_from_lead_id gets its FK when leads exist (slice 4).

const address = (prefix: string) => ({
  [`${prefix}Street`]: varchar(`${prefix}_street`, { length: 250 }),
  [`${prefix}City`]: varchar(`${prefix}_city`, { length: 30 }),
  [`${prefix}State`]: varchar(`${prefix}_state`, { length: 30 }),
  [`${prefix}Zip`]: varchar(`${prefix}_zip`, { length: 30 }),
  [`${prefix}Country`]: char(`${prefix}_country`, { length: 2 }),
});

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey(),
    ...REC(),
    ...ZOHO(),
    accountId: uuid("account_id"),
    salutation: varchar("salutation", { length: 20 }),
    firstName: varchar("first_name", { length: 40 }),
    lastName: varchar("last_name", { length: 80 }).notNull(),
    title: varchar("title", { length: 100 }),
    department: varchar("department", { length: 100 }),
    email: citext("email"),
    secondaryEmail: citext("secondary_email"),
    phone: varchar("phone", { length: 30 }),
    homePhone: varchar("home_phone", { length: 30 }),
    otherPhone: varchar("other_phone", { length: 30 }),
    fax: varchar("fax", { length: 30 }),
    asstPhone: varchar("asst_phone", { length: 30 }),
    mobile: varchar("mobile", { length: 16 }),
    assistant: varchar("assistant", { length: 80 }),
    dateOfBirth: date("date_of_birth", { mode: "string" }),
    reportingToId: uuid("reporting_to_id"),
    leadSource: varchar("lead_source", { length: 60 }),
    emailOptOut: boolean("email_opt_out").notNull().default(false),
    ...address("mailing"),
    ...address("other"),
    description: text("description"),
    convertedFromLeadId: uuid("converted_from_lead_id"),
  },
  (t) => [
    unique("contacts_org_id_id_key").on(t.orgId, t.id),
    check("contacts_mobile_e164", sql`${t.mobile} ~ '^[+][1-9][0-9]{6,14}$'`),
    check("contacts_email_length", sql`char_length(${t.email}) <= 100 AND char_length(${t.secondaryEmail}) <= 100`),
    check("contacts_reporting_to_not_self", sql`${t.reportingToId} <> ${t.id}`),
    check("contacts_description_length", sql`char_length(${t.description}) <= 32000`),
    index("contacts_list_idx").on(t.orgId, t.ownerId, t.updatedAt.desc()).where(sql`${t.deletedAt} IS NULL`),
    index("contacts_email_idx").on(t.orgId, sql`lower(${t.email})`).where(sql`${t.deletedAt} IS NULL`),
    index("contacts_account_idx").on(t.orgId, t.accountId),
    index("contacts_name_trgm_idx").using("gin", sql`(coalesce(${t.firstName}, '') || ' ' || ${t.lastName}) gin_trgm_ops`),
    zohoIdx("contacts", t),
    ...recFks("contacts", t),
  ],
);
