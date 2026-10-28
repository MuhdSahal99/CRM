import { sql } from "drizzle-orm";
import { bigint, check, customType, foreignKey, index, pgEnum, pgTable, text, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { tstz } from "./_columns.ts";
import { member, orgs } from "./auth.ts";
import { recordType } from "./timeline.ts";

// SCHEMA § files (ADR-0012). The row is the source of truth: a storage key is valid only when a visible row names it. The
// immutability trigger, grants, RLS and the invoices.pdf_file_id FK are hand-written SQL (migration 0026).

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const fileKind = pgEnum("file_kind", ["quote_pdf", "sales_order_pdf", "invoice_pdf", "import_csv", "import_errors_csv"]);
export const fileStatus = pgEnum("file_status", ["pending", "ready", "failed"]);

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    kind: fileKind("kind").notNull(),
    recordType: recordType("record_type"),
    recordId: uuid("record_id"),
    status: fileStatus("status").notNull().default("pending"),
    storageKey: text("storage_key").notNull().unique("files_storage_key_key"),
    filename: varchar("filename", { length: 200 }).notNull(),
    contentType: varchar("content_type", { length: 100 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    sha256: bytea("sha256"),
    createdAt: tstz("created_at").notNull().defaultNow(),
    createdBy: uuid("created_by").notNull().$defaultFn(() => sql`NULLIF(current_setting('app.user_id', true), '')::uuid`),
  },
  (t) => [
    unique("files_org_id_id_key").on(t.orgId, t.id),
    check("files_record_ref", sql`(${t.recordType} IS NULL) = (${t.recordId} IS NULL)`),
    check("files_ready", sql`${t.status} <> 'ready' OR (${t.sha256} IS NOT NULL AND ${t.sizeBytes} IS NOT NULL)`),
    check("files_key_org", sql`${t.storageKey} LIKE 'org/' || ${t.orgId}::text || '/%'`),
    index("files_record_idx").on(t.orgId, t.recordType, t.recordId, sql`${t.createdAt} DESC`),
    foreignKey({ name: "files_created_by_fk", columns: [t.orgId, t.createdBy], foreignColumns: [member.orgId, member.userId] }).onDelete("restrict"),
  ],
);
