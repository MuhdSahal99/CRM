import { sql } from "drizzle-orm";
import { foreignKey, index, integer, jsonb, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { AUDIT, auditFks, tstz } from "./_columns.ts";
import { member } from "./auth.ts";
import { files } from "./files.ts";

// SCHEMA § import_jobs, import_rows (US-17), Admin only. Nothing reaches a CRM table until `confirmed_at` is set: a dry run writes only these two
// tables. Grants, RLS (tenant + admin_only), the audit trigger and the row-purge guard are hand-written SQL (migration 0030).

export const importModule = pgEnum("import_module", ["leads", "accounts", "contacts", "deals", "products"]);
export const importStatus = pgEnum("import_status", ["uploaded", "validating", "validated", "importing", "done", "failed", "cancelled"]);
export const importRowStatus = pgEnum("import_row_status", ["valid", "error", "imported", "duplicate", "flagged_owner"]);

export const importJobs = pgTable(
  "import_jobs",
  {
    id: uuid("id").primaryKey(),
    ...AUDIT(),
    module: importModule("module").notNull(),
    sourceFileId: uuid("source_file_id").notNull(),
    mapping: jsonb("mapping").notNull(),
    status: importStatus("status").notNull().default("uploaded"),
    totalRows: integer("total_rows").notNull().default(0),
    validRows: integer("valid_rows").notNull().default(0),
    errorRows: integer("error_rows").notNull().default(0),
    importedRows: integer("imported_rows").notNull().default(0),
    duplicateRows: integer("duplicate_rows").notNull().default(0),
    flaggedRows: integer("flagged_rows").notNull().default(0),
    /** A failure of the job itself (an unreadable file), as opposed to the errors of single rows. */
    failureMessage: text("failure_message"),
    errorsFileId: uuid("errors_file_id"),
    confirmedAt: tstz("confirmed_at"),
    confirmedBy: uuid("confirmed_by"),
    finishedAt: tstz("finished_at"),
  },
  (t) => [
    unique("import_jobs_org_id_id_key").on(t.orgId, t.id),
    index("import_jobs_list_idx").on(t.orgId, sql`${t.createdAt} DESC`),
    foreignKey({ name: "import_jobs_source_file_fk", columns: [t.orgId, t.sourceFileId], foreignColumns: [files.orgId, files.id] }).onDelete("restrict"),
    foreignKey({ name: "import_jobs_errors_file_fk", columns: [t.orgId, t.errorsFileId], foreignColumns: [files.orgId, files.id] }).onDelete("restrict"),
    foreignKey({ name: "import_jobs_confirmed_by_fk", columns: [t.orgId, t.confirmedBy], foreignColumns: [member.orgId, member.userId] }).onDelete("restrict"),
    ...auditFks("import_jobs", t),
  ],
);

export const importRows = pgTable(
  "import_rows",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id").notNull(),
    jobId: uuid("job_id").notNull(),
    rowNo: integer("row_no").notNull(),
    raw: jsonb("raw").notNull(),
    zohoId: text("zoho_id"),
    status: importRowStatus("status").notNull(),
    errors: jsonb("errors"),
    recordId: uuid("record_id"),
  },
  (t) => [
    unique("import_rows_row_key").on(t.orgId, t.jobId, t.rowNo),
    index("import_rows_status_idx").on(t.orgId, t.jobId, t.status, t.rowNo),
    foreignKey({ name: "import_rows_job_fk", columns: [t.orgId, t.jobId], foreignColumns: [importJobs.orgId, importJobs.id] }).onDelete("cascade"),
  ],
);
