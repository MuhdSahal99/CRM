import { newId } from "@crm/db";
import { getTableName, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import { ApiError, validationError } from "../http/errors.ts";
import { buildRecordSchema } from "../metadata/record-schema.ts";
import type { TenantContext, Tx } from "../tenant.ts";
import { recordEvent } from "../timeline.ts";
import { type Field, loadFields, moduleDef } from "./registry.ts";

// Records are checked against the module's metadata in the service (ADR-0006); the route only checks the envelope.
const record = z.record(z.string(), z.unknown());
export const CreateRecordsInput = z.object({ data: z.array(record).min(1).max(100), trigger: z.array(z.string()).optional() });

/** Parses one record with the metadata-built schema, then the module's normalisation, as a row of column → value. */
function parse(fields: Field[], module: string, input: Record<string, unknown>, partial = false) {
  const def = moduleDef(module);
  const { schema, toRow } = buildRecordSchema(fields, def.writable);
  const parsed = (partial ? schema.partial() : schema).safeParse(input);
  if (!parsed.success) throw validationError(parsed.error, input);
  return toRow(def.normalise ? def.normalise(parsed.data) : parsed.data);
}

/** A constraint the database enforces, reported on the field it concerns (AC-13, AC-22: a lookup into another org). */
export function dbError(error: unknown, table: PgTable, fields: Field[]): never {
  const cause = (error as { cause?: { code?: string; constraint?: string } }).cause;
  if (cause?.code === "23503") {
    // RLS hides the key from the error detail, so go by name: <table>_<column or its prefix>_fk.
    const key = cause.constraint?.slice(getTableName(table).length + 1, -"_fk".length);
    const field = fields.find((f) => f.columnName === key || f.columnName?.startsWith(`${key}_`));
    throw new ApiError(422, "INVALID_DATA", "The linked record does not exist.", { api_name: field?.apiName });
  }
  if (cause?.code === "23514") throw new ApiError(422, "INVALID_DATA", "Some fields are not valid.");
  throw error;
}

const columns = (row: Record<string, unknown>) => sql.join(Object.keys(row).map((c) => sql.identifier(c)), sql`, `);
const value = (column: string, v: unknown) => (column === "custom" ? sql`${JSON.stringify(v)}::jsonb` : sql`${v}`);

/** POST /{module}: all records or none, each owned by the caller unless Owner says otherwise; logs `created`. */
export async function createRecords(tx: Tx, ctx: TenantContext, module: string, input: z.infer<typeof CreateRecordsInput>) {
  const def = moduleDef(module);
  const fields = await loadFields(tx, module);
  const outcomes = [];
  for (const record of input.data) {
    const id = newId();
    const row: Record<string, unknown> = { id, owner_id: ctx.userId, ...parse(fields, module, record) };
    if (row.owner_id === null) row.owner_id = ctx.userId;
    const values = sql.join(Object.entries(row).map(([c, v]) => value(c, v)), sql`, `);
    await tx.execute(sql`INSERT INTO ${def.table} (org_id, ${columns(row)}) VALUES (app.org_id(), ${values})`).catch((e) => dbError(e, def.table, fields));
    await recordEvent(tx, { recordType: def.recordType, recordId: id, eventType: "created" });
    outcomes.push({ code: "SUCCESS", status: "success", details: { id, version: 1 } });
  }
  return outcomes;
}
