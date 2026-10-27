import { newId } from "@crm/db";
import { getTableName, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import { ApiError, Conflict, NotFound, validationError } from "../http/errors.ts";
import { buildRecordSchema } from "../metadata/record-schema.ts";
import type { TenantContext, Tx } from "../tenant.ts";
import { recordEvent } from "../timeline.ts";
import { type Field, loadFields, moduleDef } from "./registry.ts";

// Records are checked against the module's metadata in the service (ADR-0006); the route only checks the envelope.
const record = z.record(z.string(), z.unknown());
export const CreateRecordsInput = z.object({ data: z.array(record).min(1).max(100), trigger: z.array(z.string()).optional() });
export const UpdateRecordInput = z.object({ data: z.array(record).length(1) });

/** Parses one record with the metadata-built schema, then the module's normalisation, as a row of column → value. */
function parse(fields: Field[], module: string, input: Record<string, unknown>, before?: Record<string, unknown>) {
  const def = moduleDef(module);
  const { schema, toRow } = buildRecordSchema(fields, def.writable);
  const parsed = (before ? schema.partial() : schema).safeParse(input);
  if (!parsed.success) throw validationError(parsed.error, input);
  return toRow(def.normalise ? def.normalise(parsed.data, before) : parsed.data);
}

/** A constraint the database enforces, reported on the field it concerns (AC-13, AC-22: a lookup into another org). */
export function dbError(error: unknown, table: PgTable, fields: Field[]): never {
  const cause = (error as { cause?: { code?: string; constraint?: string; column?: string } }).cause;
  if (cause?.code === "23001") throw new Conflict("INVALID_STATE", "This record is read-only: it was converted."); // leads_converted_readonly (AC-24)
  if (cause?.code === "23502") {
    throw new ApiError(422, "MANDATORY_NOT_FOUND", "This field cannot be empty.", { api_name: fields.find((f) => f.columnName === cause.column)?.apiName });
  }
  if (cause?.code === "23503") {
    // RLS hides the key from the error detail, so go by name: <table>_<column or its prefix>_fk.
    const key = cause.constraint?.slice(getTableName(table).length + 1, -"_fk".length);
    const field = fields.find((f) => f.columnName === key || f.columnName?.startsWith(`${key}_`));
    throw new ApiError(422, "INVALID_DATA", "The linked record does not exist.", { api_name: field?.apiName });
  }
  if (cause?.code === "23514") throw new ApiError(422, "INVALID_DATA", "Some fields are not valid.");
  throw error;
}

/** In a bulk create, says which record a field error belongs to: data.<index>.<api_name>. */
function atRecord(error: unknown, index: number) {
  if (!(error instanceof ApiError) || !error.details) return error;
  const at = (api?: string) => (api ? `data.${index}.${api}` : api);
  const { api_name, errors } = error.details;
  return new ApiError(error.httpStatus, error.code, error.message, { api_name: at(api_name), errors: errors?.map((e) => ({ ...e, api_name: at(e.api_name)! })) });
}

const columns = (row: Record<string, unknown>) => sql.join(Object.keys(row).map((c) => sql.identifier(c)), sql`, `);
const value = (column: string, v: unknown) => (column === "custom" ? sql`${JSON.stringify(v)}::jsonb` : sql`${v}`);

/** POST /{module}: all records or none, each owned by the caller unless Owner says otherwise; logs `created`. */
export async function createRecords(tx: Tx, ctx: TenantContext, module: string, input: z.infer<typeof CreateRecordsInput>) {
  const def = moduleDef(module);
  const fields = await loadFields(tx, module);
  const outcomes = [];
  for (const [i, record] of input.data.entries()) {
    try {
      const id = newId();
      const parsed = parse(fields, module, record);
      await def.check?.(tx, parsed);
      const row: Record<string, unknown> = { id, owner_id: ctx.userId, ...parsed, ...def.fixed };
      if (row.owner_id === null) row.owner_id = ctx.userId;
      const values = sql.join(Object.entries(row).map(([c, v]) => value(c, v)), sql`, `);
      await tx.execute(sql`INSERT INTO ${def.table} (org_id, ${columns(row)}) VALUES (app.org_id(), ${values})`).catch((e) => dbError(e, def.table, fields));
      await recordEvent(tx, { recordType: def.recordType, recordId: id, eventType: "created" });
      outcomes.push({ code: "SUCCESS", status: "success", details: { id, version: 1 } });
    } catch (error) {
      throw input.data.length > 1 ? atRecord(error, i) : error;
    }
  }
  return outcomes;
}

type Row = Record<string, unknown> & { version: number; custom: Record<string, unknown> };
const VersionInput = z.object({ version: z.int().min(1) });

/** PUT /{module}/{id}: partial update at the client's version (409 if stale); logs `updated` with {api_name: [old, new]}. */
export async function updateRecord(tx: Tx, module: string, id: string, input: z.infer<typeof UpdateRecordInput>) {
  const def = moduleDef(module);
  const fields = await loadFields(tx, module);
  const { version, ...changes } = input.data[0]!;
  const v = VersionInput.safeParse({ version });
  if (!v.success) throw validationError(v.error, { version });
  const before = (await tx.execute<Row>(sql`SELECT * FROM ${def.table} WHERE id = ${id} AND ${def.scope} AND deleted_at IS NULL FOR UPDATE`)).rows[0];
  if (!before) throw new NotFound();
  if (before.is_converted) throw new Conflict("INVALID_STATE", "This lead is converted and read-only."); // AC-24: checked first, whatever version the client sent
  if (before.version !== v.data.version) throw new Conflict("VERSION_CONFLICT", "This record was changed by someone else. Reload it and try again.");
  const row = parse(fields, module, changes, before);
  await def.check?.(tx, row, before);
  if (row.custom) row.custom = { ...before.custom, ...(row.custom as object) };

  const set = sql.join([...Object.entries(row).map(([c, val]) => sql`${sql.identifier(c)} = ${value(c, val)}`), sql`version = version + 1`], sql`, `);
  const after = (await tx.execute<Row>(sql`UPDATE ${def.table} SET ${set} WHERE id = ${id} AND ${def.scope} RETURNING *`).catch((e) => dbError(e, def.table, fields))).rows[0]!;

  const read = (f: Field, r: Row) => (f.isSystem ? r[f.columnName!] : r.custom[f.apiName]) ?? null;
  const diff = fields.filter((f) => f.apiName in changes && JSON.stringify(read(f, before)) !== JSON.stringify(read(f, after)));
  if (diff.length > 0) {
    const changed = Object.fromEntries(diff.map((f) => [f.apiName, [read(f, before), read(f, after)] as [unknown, unknown]]));
    await recordEvent(tx, { recordType: def.recordType, recordId: id, eventType: "Stage" in changed ? "stage_changed" : "updated", changes: changed });
  }
  return [{ code: "SUCCESS", status: "success", details: { id, version: after.version } }];
}

/** DELETE /{module}/{id}: soft delete (SCHEMA § SOFT); the record leaves every list and read. Logs `deleted`. */
export async function deleteRecord(tx: Tx, module: string, id: string) {
  const def = moduleDef(module);
  const { rows } = await tx.execute(sql`
    UPDATE ${def.table} SET deleted_at = now(), deleted_by = NULLIF(current_setting('app.user_id', true), '')::uuid, version = version + 1
    WHERE id = ${id} AND ${def.scope} AND deleted_at IS NULL RETURNING id`).catch((e) => dbError(e, def.table, []));
  if (rows.length === 0) throw new NotFound();
  await recordEvent(tx, { recordType: def.recordType, recordId: id, eventType: "deleted" });
  return [{ code: "SUCCESS", status: "success", details: { id } }];
}
