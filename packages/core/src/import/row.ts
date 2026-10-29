import { sql } from "drizzle-orm";
import { ApiError } from "../http/errors.ts";
import { createRecords, updateRecord } from "../modules/write.ts";
import { type Field, moduleDef } from "../modules/registry.ts";
import type { TenantContext, Tx } from "../tenant.ts";
import { recordEvent } from "../timeline.ts";
import { STAGE_ALIASES } from "./modules.ts";
import { LIMITS } from "./parse.ts";
import { ZOHO_ID } from "./mapping.ts";

// T11.03, T11.04 (US-17): one CSV row becomes one record through the same services as the API (createRecords, updateRecord), so every Zod rule,
// permission and database constraint applies. A dry run does the whole thing inside a savepoint it always rolls back.

export type RowError = { column: string; message: string };
export type Prepared = { record: Record<string, unknown>; zohoId: string | null; flaggedOwner: boolean; errors: RowError[] };

let countryCodes: Map<string, string> | undefined;
/** Zoho exports country names ("Oman"); the CRM stores ISO-3166 alpha-2. Names come from the platform's own region data, no table to maintain. */
function isoCountry(value: string): string | null {
  if (/^[A-Za-z]{2}$/.test(value)) return value.toUpperCase();
  if (!countryCodes) {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    countryCodes = new Map();
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const name = names.of(code);
      if (name && name !== code) countryCodes.set(name.toLowerCase(), code);
    }
  }
  return countryCodes.get(value.toLowerCase()) ?? null;
}

function isoDate(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value); // day first, as in Oman
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : null;
}

/** One cell → the value the module's record schema expects, or a message for the Admin. Lookups are resolved separately. */
export function coerce(f: Field, cell: string): { value: unknown } | { error: string } {
  const bad = (what: string) => ({ error: `"${cell.length > 40 ? `${cell.slice(0, 40)}…` : cell}" is not ${what}.` });
  switch (f.dataType) {
    case "picklist": {
      const hit = f.picklistValues.find((v) => v.toLowerCase() === cell.toLowerCase());
      return hit ? { value: hit } : bad(`one of: ${f.picklistValues.slice(0, 8).join(", ")}${f.picklistValues.length > 8 ? ", …" : ""}`);
    }
    case "multiselect": {
      const parts = cell.split(/[;,]/).map((p) => p.trim()).filter(Boolean);
      const hits = parts.map((p) => f.picklistValues.find((v) => v.toLowerCase() === p.toLowerCase()));
      return hits.every(Boolean) ? { value: hits } : bad("a list of known values");
    }
    case "date": {
      const d = isoDate(cell);
      return d ? { value: d } : bad("a date (use yyyy-mm-dd)");
    }
    case "integer": {
      const n = cell.replace(/[,\s]/g, "");
      return /^-?\d+$/.test(n) ? { value: Number(n) } : bad("a whole number");
    }
    case "decimal": case "currency": case "percent": {
      const n = cell.replace(/[,\s%]/g, "");
      if (!/^-?\d+(\.\d+)?$/.test(n)) return bad("a number");
      return (n.split(".")[1]?.length ?? 0) > (f.scale ?? 3) ? bad(`a number with at most ${f.scale ?? 3} decimals`) : { value: n };
    }
    case "boolean": {
      const t = cell.toLowerCase();
      if (["true", "yes", "y", "1"].includes(t)) return { value: true };
      return ["false", "no", "n", "0"].includes(t) ? { value: false } : bad("yes or no");
    }
    default: {
      if (/country$/i.test(f.apiName)) {
        const code = isoCountry(cell);
        return code ? { value: code } : bad("a country");
      }
      return { value: cell };
    }
  }
}

/** A Zoho id first, then the name, only inside this org and only among records this Admin sees. Zero or several name matches are an error, never a guess (AC-52). */
async function resolveLookup(tx: Tx, module: string, cell: string): Promise<{ id: string } | { error: string }> {
  const def = moduleDef(module);
  const singular = module.replace(/s$/, "").toLowerCase();
  const byZoho = (await tx.execute<{ id: string }>(sql`SELECT id FROM ${def.table} WHERE zoho_id = ${cell} AND deleted_at IS NULL`)).rows;
  if (byZoho.length === 1) return { id: byZoho[0]!.id };
  const byName = (await tx.execute<{ id: string }>(sql`SELECT id FROM (SELECT id, ${def.name} AS n FROM ${def.table} WHERE deleted_at IS NULL) s WHERE lower(n) = lower(${cell}) LIMIT 2`)).rows;
  if (byName.length === 1) return { id: byName[0]!.id };
  return { error: byName.length === 0 ? `No ${singular} has the Zoho id or name "${cell}".` : `More than one ${singular} is named "${cell}": use its Zoho id.` };
}

async function resolveStage(tx: Tx, cell: string): Promise<{ id: string } | { error: string }> {
  const name = STAGE_ALIASES[cell.toLowerCase()] ?? cell;
  const row = (await tx.execute<{ id: string }>(sql`SELECT id FROM stages WHERE lower(api_value) = lower(${name}) LIMIT 1`)).rows[0];
  return row ? { id: row.id } : { error: `"${cell}" is not a stage of your pipeline.` };
}

/** Applies the mapping to a raw row: typed values, resolved links, the Zoho id, and every message for the cells that do not fit. Reads only. */
export async function prepareRow(tx: Tx, mappable: Field[], mapping: Record<string, string>, fill: Record<string, string>, raw: Record<string, string>): Promise<Prepared> {
  const byApi = new Map(mappable.map((f) => [f.apiName, f]));
  const out: Prepared = { record: {}, zohoId: null, flaggedOwner: false, errors: [] };
  for (const [heading, target] of Object.entries(mapping)) {
    const cell = (raw[heading] ?? "").trim();
    if (!cell) continue;
    const fail = (message: string) => out.errors.push({ column: heading, message });
    if (cell.length > LIMITS.cellChars) { fail(`The cell is longer than ${LIMITS.cellChars.toLocaleString("en-US")} characters.`); continue; }
    if (target === ZOHO_ID) { // never truncated: two long ids that differ late would otherwise collide into one record
      if (cell.length > 100) fail("The Zoho record id is longer than 100 characters.");
      else out.zohoId = cell;
      continue;
    }
    const f = byApi.get(target)!;
    if (f.dataType === "user_lookup") {
      // AC-50: only members of this org; anything else is the importing Admin, flagged for review.
      const user = (await tx.execute<{ id: string }>(sql`SELECT id FROM org_users WHERE lower(email) = lower(${cell}) AND status = 'active' LIMIT 1`)).rows[0];
      if (user) out.record[target] = { id: user.id };
      else out.flaggedOwner = true;
    } else if (f.dataType === "lookup") {
      const found = f.apiName === "Stage" ? await resolveStage(tx, cell) : f.lookupModule ? await resolveLookup(tx, f.lookupModule, cell) : { error: "This link cannot be imported." };
      if ("error" in found) fail(found.error);
      else out.record[target] = { id: found.id };
    } else {
      const c = coerce(f, cell);
      if ("error" in c) fail(c.error);
      else out.record[target] = c.value;
    }
  }
  for (const [api, value] of Object.entries(fill)) if (!(api in out.record)) out.record[api] = value;
  const idColumn = Object.keys(mapping).find((h) => mapping[h] === ZOHO_ID) ?? ZOHO_ID;
  if (!out.zohoId && !out.errors.some((e) => e.column === idColumn)) out.errors.push({ column: idColumn, message: "The Zoho record id is empty." });
  return out;
}

export type Applied = { status: "valid" | "duplicate" | "error"; recordId?: string; errors?: RowError[] };
class DryRun extends Error {}

/**
 * Creates the record, or updates the one that already has this Zoho id (so importing a file twice makes no new records). In `dry` mode the same work
 * runs in a savepoint that is rolled back, so the row gets the verdict a real import would give and nothing is written.
 */
export async function applyRow(tx: Tx, ctx: TenantContext, module: string, prepared: Prepared, mode: "dry" | "write", jobId: string, headingOf: (api: string) => string): Promise<Applied> {
  const def = moduleDef(module);
  const existing = (await tx.execute<{ id: string; version: number; deleted_at: string | null }>(sql`SELECT id, version, deleted_at FROM ${def.table} WHERE zoho_id = ${prepared.zohoId}`)).rows[0];
  if (existing?.deleted_at) return { status: "error", errors: [{ column: ZOHO_ID, message: "A deleted record has this Zoho id." }] };
  let recordId = existing?.id;
  try {
    await tx.transaction(async (sp) => {
      if (existing) await updateRecord(sp, module, existing.id, { data: [{ version: existing.version, ...prepared.record }] });
      else {
        const [created] = await createRecords(sp, ctx, module, { data: [prepared.record] });
        recordId = created!.details.id;
      }
      await sp.execute(sql`UPDATE ${def.table} SET zoho_id = ${prepared.zohoId}, needs_review = ${prepared.flaggedOwner ? sql`true` : sql`needs_review`} WHERE id = ${recordId}`);
      if (mode === "write") await recordEvent(sp, { recordType: def.recordType, recordId: recordId!, eventType: "imported", meta: { import_job_id: jobId, zoho_id: prepared.zohoId } });
      if (mode === "dry") throw new DryRun();
    });
  } catch (error) {
    if (!(error instanceof DryRun)) {
      if (error instanceof ApiError) {
        const list = error.details?.errors ?? (error.details?.api_name ? [{ api_name: error.details.api_name, message: error.message }] : []);
        const errors = list.length ? list.map((e) => ({ column: headingOf(String(e.api_name).replace(/^data\.\d+\./, "")), message: e.message })) : [{ column: module, message: error.message }];
        return { status: "error", errors };
      }
      throw error;
    }
  }
  return { status: existing ? "duplicate" : "valid", recordId: mode === "write" ? recordId : undefined };
}
