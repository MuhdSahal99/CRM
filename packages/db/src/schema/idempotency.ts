import { sql } from "drizzle-orm";
import { customType, jsonb, pgEnum, pgTable, primaryKey, smallint, uuid, varchar } from "drizzle-orm/pg-core";
import { tstz } from "./_columns.ts";
import { orgs } from "./auth.ts";

// SCHEMA § idempotency_keys (ADR-0015). Grants and RLS are hand-written SQL.

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const idempotencyStatus = pgEnum("idempotency_status", ["in_progress", "completed"]);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "restrict" }),
    userId: uuid("user_id").notNull(),
    key: varchar("key", { length: 255 }).notNull(),
    requestHash: bytea("request_hash").notNull(),
    status: idempotencyStatus("status").notNull(),
    responseStatus: smallint("response_status"),
    responseBody: jsonb("response_body"),
    createdAt: tstz("created_at").notNull().defaultNow(),
    expiresAt: tstz("expires_at").notNull().default(sql`now() + interval '7 days'`),
  },
  (t) => [primaryKey({ name: "idempotency_keys_pkey", columns: [t.orgId, t.userId, t.key] })],
);
