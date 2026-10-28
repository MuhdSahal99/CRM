import { sql } from "drizzle-orm";
import { bigint, check, pgEnum, pgTable, primaryKey, smallint, uuid, varchar } from "drizzle-orm/pg-core";
import { orgs } from "./auth.ts";

// SCHEMA § Sales documents (ADR-0007, ADR-0008). Composite FKs that SET NULL one column, scale_ok, grants, RLS and triggers are hand-written (migrations 0022, 0023).

export const docType = pgEnum("doc_type", ["quote", "sales_order", "invoice"]);

export const documentSequences = pgTable(
  "document_sequences",
  {
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    docType: docType("doc_type").notNull(),
    prefix: varchar("prefix", { length: 20 }).notNull().default(""),
    padding: smallint("padding").notNull().default(6),
    nextValue: bigint("next_value", { mode: "bigint" }).notNull().default(sql`1`),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.docType] }), check("document_sequences_next_value_min", sql`${t.nextValue} >= 1`)],
);

