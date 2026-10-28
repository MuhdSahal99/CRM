import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgEnum, pgTable, smallint, text, uuid, varchar } from "drizzle-orm/pg-core";
import { tstz } from "./_columns.ts";
import { citext, member, orgs } from "./auth.ts";
import { files } from "./files.ts";
import { recordType } from "./timeline.ts";

// SCHEMA § email_sends (ADR-0011): the outbox row of one email. The request inserts it `queued`, the worker moves it queued ->
// sending -> sent | failed. Grants, RLS, the record-ref trigger and the contact FK are hand-written SQL (migration 0027).

export const emailStatus = pgEnum("email_status", ["queued", "sending", "sent", "failed"]);

export const emailSends = pgTable(
  "email_sends",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    recordType: recordType("record_type").notNull(),
    recordId: uuid("record_id").notNull(),
    fileId: uuid("file_id").notNull(),
    toContactId: uuid("to_contact_id"),
    toEmail: citext("to_email").notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    body: text("body").notNull().default(""),
    status: emailStatus("status").notNull().default("queued"),
    attempts: smallint("attempts").notNull().default(0),
    errorCode: varchar("error_code", { length: 40 }),
    errorMessage: varchar("error_message", { length: 500 }),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    queuedAt: tstz("queued_at").notNull().defaultNow(),
    sentAt: tstz("sent_at"),
    createdBy: uuid("created_by").notNull().$defaultFn(() => sql`NULLIF(current_setting('app.user_id', true), '')::uuid`),
  },
  (t) => [
    check("email_sends_no_line_breaks", sql`${t.subject} !~ '[\\r\\n]' AND ${t.toEmail}::text !~ '[\\r\\n]'`),
    check("email_sends_body_length", sql`char_length(${t.body}) <= 5000`),
    index("email_sends_outbox_idx").on(t.orgId, t.status, t.queuedAt).where(sql`${t.status} IN ('queued', 'sending')`),
    index("email_sends_record_idx").on(t.orgId, t.recordType, t.recordId, sql`${t.queuedAt} DESC`),
    foreignKey({ name: "email_sends_file_fk", columns: [t.orgId, t.fileId], foreignColumns: [files.orgId, files.id] }).onDelete("restrict"),
    foreignKey({ name: "email_sends_created_by_fk", columns: [t.orgId, t.createdBy], foreignColumns: [member.orgId, member.userId] }).onDelete("restrict"),
  ],
);
