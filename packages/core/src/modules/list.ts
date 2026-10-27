import { sql } from "drizzle-orm";
import { NotFound } from "../http/errors.ts";
import type { Tx } from "../tenant.ts";
import { loadFields, moduleDef, toApi } from "./registry.ts";

// Reads go through RLS: org scoping, plus owner visibility on private modules (ADR-0005). Soft-deleted rows are gone.

/** GET /{module}/{id}: one visible record as data:[record], or 404. */
export async function getRecord(tx: Tx, module: string, id: string) {
  const def = moduleDef(module);
  const { rows } = await tx.execute(sql`SELECT * FROM ${def.table} WHERE id = ${id} AND deleted_at IS NULL`);
  if (rows.length === 0) throw new NotFound();
  return toApi(tx, await loadFields(tx, module), rows as Parameters<typeof toApi>[2]);
}
