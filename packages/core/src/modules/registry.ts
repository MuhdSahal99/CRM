import { schema } from "@crm/db";
import { getTableColumns, type SQL, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { ApiError, NotFound } from "../http/errors.ts";
import type { FieldDef } from "../metadata/record-schema.ts";
import { MODULE_OF_TYPE } from "../metadata/record-schema.ts";
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
  /** Narrows a table shared by several modules (Tasks, Calls and Meetings are `activities`) to this module's rows. */
  scope: SQL;
  /** Extra filter for the default list only (not for reading one record). */
  listScope: SQL;
  /** Column values every row of this module has, whatever the client sends (the activity `type`). */
  fixed: Record<string, unknown>;
  /** Columns metadata may write (buildRecordSchema's allowlist): never tenancy, audit, soft-delete or import columns. */
  writable: PgColumn[];
  /** Server-side normalisation of a parsed record (api_name keys) before it is stored; `before` is the row on update. */
  /** Service-side rules that need the database, run on the parsed row before it is written; `before` is the row on update. */
  check?: (tx: Tx, row: Record<string, unknown>, before?: Record<string, unknown>) => Promise<void>;
  normalise?: (record: Record<string, unknown>, before?: Record<string, unknown>) => Record<string, unknown>;
};

const SERVER_COLUMNS = new Set(["id", "org_id", "created_at", "created_by", "updated_at", "updated_by", "version", "deleted_at", "deleted_by", "custom", "zoho_id", "needs_review", "type", "completed_at"]);

const entry = (table: PgTable, recordType: ModuleDef["recordType"], name: SQL, nameFields: string[], extra: Partial<ModuleDef> = {}): ModuleDef => ({
  table,
  recordType,
  name,
  nameFields,
  scope: sql`true`,
  listScope: sql`true`,
  fixed: {},
  writable: Object.values(getTableColumns(table)).filter((c) => !SERVER_COLUMNS.has(c.name)),
  ...extra,
});

/** US-06: a mobile is stored as E.164, read in the record's country (api_name `field`, column `column`) unless it is already international. */
const mobileIn = (field: string, column: string) => (record: Record<string, unknown>, before?: Record<string, unknown>) => {
  if (typeof record.Mobile !== "string") return record;
  const country = field in record ? record[field] : before?.[column];
  const mobile = toE164(record.Mobile, typeof country === "string" ? country : null);
  if (!mobile) throw new ApiError(422, "INVALID_DATA", "Enter a valid mobile number: with its country code, or set the mailing country.", { api_name: "Mobile" });
  return { ...record, Mobile: mobile };
};

/** T5.03: field-level 422s before the database trigger would raise them (US-07). Stage is only checked when it is being set. */
async function dealChecks(tx: Tx, row: Record<string, unknown>, before?: Record<string, unknown>) {
  if (!row.stage_id) return;
  const stage = (await tx.execute<{ record_category: string }>(sql`SELECT record_category FROM stages WHERE id = ${row.stage_id as string} AND is_active`)).rows[0];
  if (!stage) throw new ApiError(422, "INVALID_DATA", "The stage does not exist.", { api_name: "Stage" });
  const reason = "reason_for_loss" in row ? row.reason_for_loss : before?.reason_for_loss;
  if (stage.record_category === "closed_lost" && !reason) throw new ApiError(422, "MANDATORY_NOT_FOUND", "Choose a reason for the loss.", { api_name: "Reason_For_Loss" });
}

/** Lookups into pipeline set-up, which is not a module: api_name → the table and the text shown for a row. */
export const SETUP_LOOKUPS: Record<string, { table: PgTable; name: SQL }> = {
  Pipeline: { table: schema.pipelines, name: sql`name` },
  Stage: { table: schema.stages, name: sql`api_value` },
};

/** Tasks, Calls and Meetings: one table, one module each (SCHEMA § activities). */
const activity = (type: string) => entry(schema.activities, "activity", sql`subject`, ["Subject"], { scope: sql`type = ${type}`, fixed: { type } });

const MODULES = new Map<string, ModuleDef>([
  // Converted leads leave the default list (US-05); GET /Leads/{id} still reads them.
  ["Leads", entry(schema.leads, "lead", sql`(coalesce(first_name, '') || ' ' || last_name)`, ["First_Name", "Last_Name"], { normalise: mobileIn("Country", "country"), listScope: sql`NOT is_converted` })],
  ["Accounts", entry(schema.accounts, "account", sql`account_name`, ["Account_Name"])],
    // Same expression as contacts_name_trgm_idx, so word search can use the index.
  ["Contacts", entry(schema.contacts, "contact", sql`(coalesce(first_name, '') || ' ' || last_name)`, ["First_Name", "Last_Name"], { normalise: mobileIn("Mailing_Country", "mailing_country") })],
  // OMR only until T6.04: the currency columns are fixed at create, so a client cannot choose them.
  ["Deals", entry(schema.deals, "deal", sql`deal_name`, ["Deal_Name"], {
    fixed: { currency: "OMR", currency_scale: 3, exchange_rate: "1" },
    check: dealChecks,
    writable: Object.values(getTableColumns(schema.deals)).filter((c) => c.name === "type" || !SERVER_COLUMNS.has(c.name)), // deals.type is a real field; SERVER_COLUMNS' `type` is the activity kind
  })],
  ["Tasks", activity("task")],
  ["Calls", activity("call")],
  ["Meetings", activity("meeting")],
]);

/** Module api_names the generic record routes serve today. */
export const RECORD_MODULES = [...MODULES.keys()];

/** The fields a record's display name is built from, in order (record titles in the UI). */
export const nameFieldsOf = (module: string) => moduleDef(module).nameFields;

/** The module's entry; an unknown or not-yet-built module is a 404, like a missing record. */
export function moduleDef(name: string): ModuleDef {
  const def = MODULES.get(name);
  if (!def) throw new NotFound();
  return def;
}

const DERIVED_FROM: Record<string, string> = { Expected_Revenue: "Amount" };

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
  // A field computed from a hidden one would leak it (Expected_Revenue = Amount x Probability): hide it too.
  return rows.filter((f) => !(DERIVED_FROM[f.apiName] && module === "Deals" && !rows.some((r) => r.apiName === DERIVED_FROM[f.apiName])));
}

type Row = Record<string, unknown> & { id: string; custom: Record<string, unknown> };
const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());

/** DB rows → API records keyed by api_name, with lookups as {id, name}. Names are read under the caller's RLS. */
export async function toApi(tx: Tx, fields: Field[], rows: Row[]) {
  const names = new Map<string, string | null>();
  const lookups = new Map<string, Set<string>>(); // target module ("" = users) → ids
  const want = (module: string, id: unknown) => typeof id === "string" && (lookups.get(module) ?? lookups.set(module, new Set()).get(module)!).add(id);
  const value = (f: Field, r: Row) => (f.isSystem ? r[f.columnName!] : r.custom[f.apiName]) ?? null;
  // A polymorphic link's module comes from the sibling <name>_type column; modules not built yet have no name to read.
  const linkModule = (f: Field, r: Row) => MODULE_OF_TYPE.get(r[f.columnName!.replace(/_id$/, "_type")] as string);
  for (const r of rows) {
    want("", r.created_by);
    want("", r.updated_by);
    for (const f of fields) {
      if (f.dataType === "user_lookup") want("", value(f, r));
      if (f.dataType === "lookup") {
        const target = f.lookupModule ?? (f.apiName in SETUP_LOOKUPS ? `setup:${f.apiName}` : null);
        if (target) want(target, value(f, r));
      }
      if (f.dataType === "polymorphic") {
        const module = linkModule(f, r);
        if (module && MODULES.has(module)) want(module, value(f, r));
      }
    }
  }
  for (const [module, ids] of lookups) {
    // A name built from fields the caller's role has hidden stays null, like any hidden value.
    const setup = module.startsWith("setup:") ? SETUP_LOOKUPS[module.slice(6)] : undefined;
    if (module && !setup) {
      const visible = new Set((await loadFields(tx, module)).map((f) => f.apiName));
      if (!moduleDef(module).nameFields.every((api) => visible.has(api))) continue;
    }
    const source = setup ? sql`SELECT id, ${setup.name} AS name FROM ${setup.table}` : module ? sql`SELECT id, ${moduleDef(module).name} AS name FROM ${moduleDef(module).table}` : sql`SELECT id, name FROM org_users`;
    const found = await tx.execute<{ id: string; name: string }>(sql`SELECT * FROM (${source}) s WHERE id IN ${[...ids]}`);
    for (const n of found.rows) names.set(n.id, n.name?.trim() ?? null);
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
      ...("is_converted" in r ? { Converted: r.is_converted } : {}), // Leads: a converted lead is read-only (US-05)
    };
    for (const f of fields) {
      if (f.dataType === "polymorphic") record[f.apiName] = value(f, r) === null ? null : { ...ref(value(f, r)), module: linkModule(f, r) };
      else record[f.apiName] = f.dataType === "lookup" || f.dataType === "user_lookup" ? ref(value(f, r)) : value(f, r);
    }
    return record;
  });
}
