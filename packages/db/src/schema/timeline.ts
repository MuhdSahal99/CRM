import { sql } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { orgs } from "./auth.ts";

// SCHEMA § Audit / timeline. Append-only: grants, RLS and app.can_see() are hand-written in the same migration.

export const recordType = pgEnum("record_type", [
  "lead",
  "account",
  "contact",
  "deal",
  "quote",
  "sales_order",
  "invoice",
  "activity",
  "product",
  "user",
  "org",
]);

export const timelineEvents = pgTable(
  "timeline_events",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "restrict" }),
    recordType: recordType("record_type").notNull(),
    recordId: uuid("record_id").notNull(),
    eventType: varchar("event_type", { length: 40 }).notNull(),
    actorId: uuid("actor_id"), // NULL for system events
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    changes: jsonb("changes"), // {api_name: [old, new]}; money as strings
    meta: jsonb("meta"), // never tokens or passwords
  },
  (t) => [index("timeline_events_record_idx").on(t.orgId, t.recordType, t.recordId, sql`${t.occurredAt} DESC`)],
);
