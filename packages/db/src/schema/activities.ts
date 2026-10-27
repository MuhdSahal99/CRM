import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgEnum, pgTable, text, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { REC, recFks, tstz } from "./_columns.ts";
import { recordType } from "./timeline.ts";

// SCHEMA § activities (REC), private to the owner and their managers. Tasks, Calls and Meetings share this table,
// told apart by `type`. The check_record_ref trigger on who/what, the audit and completed_at triggers, grants and RLS
// are hand-written SQL. Statuses, priority and call_type hold picklist display values (like every editable picklist).

export const activityType = pgEnum("activity_type", ["task", "call", "meeting"]);

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey(),
    ...REC(),
    type: activityType("type").notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    status: varchar("status", { length: 30 }),
    priority: varchar("priority", { length: 20 }),
    dueDate: date("due_date", { mode: "string" }),
    startAt: tstz("start_at"),
    endAt: tstz("end_at"),
    allDay: boolean("all_day"),
    venue: varchar("venue", { length: 255 }),
    callType: varchar("call_type", { length: 10 }),
    callPurpose: varchar("call_purpose", { length: 120 }),
    callResult: varchar("call_result", { length: 120 }),
    callStartAt: tstz("call_start_at"),
    callDurationSeconds: integer("call_duration_seconds"),
    whoType: recordType("who_type"),
    whoId: uuid("who_id"),
    whatType: recordType("what_type"),
    whatId: uuid("what_id"),
    completedAt: tstz("completed_at"),
    description: text("description"),
  },
  (t) => [
    unique("activities_org_id_id_key").on(t.orgId, t.id),
    check("activities_meeting_times", sql`${t.type} <> 'meeting' OR (${t.startAt} IS NOT NULL AND ${t.endAt} IS NOT NULL AND ${t.endAt} >= ${t.startAt})`),
    check("activities_call_fields", sql`${t.type} <> 'call' OR (${t.callType} IS NOT NULL AND ${t.callStartAt} IS NOT NULL AND ${t.callDurationSeconds} IS NOT NULL)`),
    check("activities_call_duration", sql`${t.callDurationSeconds} >= 0`),
    check("activities_call_type", sql`${t.callType} IN ('Inbound', 'Outbound', 'Missed')`),
    check("activities_who_pair", sql`(${t.whoType} IS NULL) = (${t.whoId} IS NULL)`),
    check("activities_what_pair", sql`(${t.whatType} IS NULL) = (${t.whatId} IS NULL)`),
    check("activities_who_type", sql`${t.whoType} IN ('lead', 'contact')`),
    check("activities_what_type", sql`${t.whatType} IN ('account', 'deal', 'quote', 'sales_order', 'invoice')`),
    check("activities_description_length", sql`char_length(${t.description}) <= 32000`),
    index("activities_open_idx").on(t.orgId, t.ownerId, t.dueDate).where(sql`${t.completedAt} IS NULL AND ${t.deletedAt} IS NULL`),
    index("activities_who_idx").on(t.orgId, t.whoType, t.whoId),
    index("activities_what_idx").on(t.orgId, t.whatType, t.whatId),
    ...recFks("activities", t),
  ],
);
