import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { AUDIT, auditFks, SOFT } from "./_columns.ts";
import { recordType } from "./timeline.ts";

// SCHEMA § notes (AUDIT, SOFT). Points at its record through (record_type, record_id) with no FK: the check_record_ref
// trigger, the audit trigger, grants and the tenant + record_visibility policies are hand-written SQL.
export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey(),
    ...AUDIT(),
    ...SOFT(),
    recordType: recordType("record_type").notNull(),
    recordId: uuid("record_id").notNull(),
    body: text("body").notNull(),
  },
  (t) => [
    check("notes_body_length", sql`char_length(${t.body}) BETWEEN 1 AND 32000`),
    index("notes_record_idx").on(t.orgId, t.recordType, t.recordId, sql`${t.createdAt} DESC`),
    ...auditFks("notes", t),
  ],
);
