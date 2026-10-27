import { schema } from "@crm/db";
import { getTableColumns, type SQL, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { ApiError, NotFound } from "../http/errors.ts";
import type { FieldDef } from "../metadata/record-schema.ts";
import { toE164 } from "../phone.ts";
import type { Tx } from "../tenant.ts";
import type { TimelineEvent } from "../timeline.ts";

// One entry per record module served by the generic /api/v1/{module} routes. A later module only adds an entry.

export type ModuleDef = {
  table: PgTable;
  recordType: TimelineEvent["recordType"];
  /** The display name of a record, for lookups ({id, name}) and word search, and the fields it is built from. */
  name: SQL;
  nameFields: string[];
  /** Columns metadata may write (buildRecordSchema's allowlist): never tenancy, audit, soft-delete or import columns. */
  writable: PgColumn[];
  /** Server-side normalisation of a parsed record (api_name keys) before it is stored; `before` is the row on update. */
  normalise?: (record: Record<string, unknown>, before?: Record<string, unknown>) => Record<string, unknown>;
};

const SERVER_COLUMNS = new Set(["id", "org_id", "created_at", "created_by", "updated_at", "updated_by", "version", "deleted_at", "deleted_by", "custom", "zoho_id", "needs_review"]);

const entry = (table: PgTable, recordType: ModuleDef["recordType"], name: SQL, nameFields: string[], extra: Partial<ModuleDef> = {}): ModuleDef => ({
  table,
  recordType,
  name,
  nameFields,
  writable: Object.values(getTableColumns(table)).filter((c) => !SERVER_COLUMNS.has(c.name)),
  ...extra,
});

/** US-06: a mobile is stored as E.164, read in the mailing country unless it is already international. */
function contactMobile(record: Record<string, unknown>, before?: Record<string, unknown>) {
  if (typeof record.Mobile !== "string") return record;
  const country = "Mailing_Country" in record ? record.Mailing_Country : before?.mailing_country;
  const mobile = toE164(record.Mobile, typeof country === "string" ? country : null);
  if (!mobile) throw new ApiError(422, "INVALID_DATA", "Enter a valid mobile number: with its country code, or set the mailing country.", { api_name: "Mobile" });
  return { ...record, Mobile: mobile };
}

const MODULES = new Map<string, ModuleDef>([
  ["Accounts", entry(schema.accounts, "account", sql`account_name`, ["Account_Name"])],
  ["Contacts", entry(schema.contacts, "contact", sql`concat_ws(' ', first_name, last_name)`, ["First_Name", "Last_Name"], { normalise: contactMobile })],
]);

/** Module api_names the generic record routes serve today. */
export const RECORD_MODULES = [...MODULES.keys()];

/** The module's entry; an unknown or not-yet-built module is a 404, like a missing record. */
export function moduleDef(name: string): ModuleDef {
  const def = MODULES.get(name);
  if (!def) throw new NotFound();
  return def;
}

export type Field = FieldDef & { lookupModule: string | null };

/** The module's fields as the caller's role may use them: hidden ones are left out, read-only ones are not inputs. */
export async function loadFields(tx: Tx, module: string): Promise<Field[]> {
  const { rows } = await tx.execute<Field>(sql`
    SELECT f.api_name AS "apiName", f.data_type AS "dataType", f.is_system AS "isSystem", f.column_name AS "columnName",
      f.required, f.read_only OR COALESCE(fp.access, 'read_write') <> 'read_write' AS "readOnly", f.max_length AS "maxLength", f.scale,
      lm.api_name AS "lookupModule",
      array(SELECT v.value FROM picklist_values v WHERE v.picklist_id = f.picklist_id AND v.is_active ORDER BY v.sort_order) AS "picklistValues"
    FROM fields f
    JOIN modules m ON m.id = f.module_id
    LEFT JOIN modules lm ON lm.id = f.lookup_module_id
    LEFT JOIN field_permissions fp ON fp.field_id = f.id AND fp.role = current_setting('app.role', true)
    WHERE m.api_name = ${module} AND COALESCE(fp.access, 'read_write') <> 'hidden'`);
  return rows;
}

type Row = Record<string, unknown> & { id: string; custom: Record<string, unknown> };
const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());

/** DB rows → API records keyed by api_name, with lookups as {id, name}. Names are read under the caller's RLS. */
export async function toApi(tx: Tx, fields: Field[], rows: Row[]) {
  const names = new Map<string, string | null>();
  const lookups = new Map<string, Set<string>>(); // target module ("" = users) → ids
  const want = (module: string, id: unknown) => typeof id === "string" && (lookups.get(module) ?? lookups.set(module, new Set()).get(module)!).add(id);
  const value = (f: Field, r: Row) => (f.isSystem ? r[f.columnName!] : r.custom[f.apiName]) ?? null;
  for (const r of rows) {
    want("", r.created_by);
    want("", r.updated_by);
    for (const f of fields) {
      if (f.dataType === "user_lookup") want("", value(f, r));
      if (f.dataType === "lookup" && f.lookupModule) want(f.lookupModule, value(f, r));
    }
  }
  for (const [module, ids] of lookups) {
    const source = module ? sql`SELECT id, ${moduleDef(module).name} AS name FROM ${moduleDef(module).table}` : sql`SELECT id, name FROM org_users`;
    const found = await tx.execute<{ id: string; name: string }>(sql`SELECT * FROM (${source}) s WHERE id IN ${[...ids]}`);
    for (const n of found.rows) names.set(n.id, n.name);
  }
  const ref = (id: unknown) => (typeof id === "string" ? { id, name: names.get(id) ?? null } : null);

  return rows.map((r) => {
    const record: Record<string, unknown> = {
      id: r.id,
      version: r.version,
      Created_Time: iso(r.created_at),
      Modified_Time: iso(r.updated_at),
      Created_By: ref(r.created_by),
      Modified_By: ref(r.updated_by),
    };
    for (const f of fields) record[f.apiName] = f.dataType === "lookup" || f.dataType === "user_lookup" ? ref(value(f, r)) : value(f, r);
    return record;
  });
}
