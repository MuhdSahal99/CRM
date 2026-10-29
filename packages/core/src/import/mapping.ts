import { type Field, loadFields, moduleDef } from "../modules/registry.ts";
import type { Tx } from "../tenant.ts";
import { ImportError } from "./parse.ts";

// T11.02 (US-17, AC-54): a CSV column may be mapped only onto a field the API itself would let this role write, or onto the Zoho record id.
// Nothing here trusts the client's idea of a column name: `id`, `org_id`, `Created_Time`, totals and every read-only field are simply not on the list.

export const ZOHO_ID = "zoho_id";

/** The fields a column may be mapped to: not read-only, and system fields only onto the module's writable columns. */
export function mappableFields(fields: Field[], writableColumns: Set<string>): Field[] {
  return fields.filter((f) => !f.readOnly && (!f.isSystem || (f.columnName !== null && writableColumns.has(f.columnName))));
}

/**
 * Checks `mapping` (CSV heading → api_name) against the CSV's headings and the mappable fields. Throws an ImportError naming the heading.
 * `fill` are api_names the importer supplies itself, so they need no column. The Zoho record id must be mapped: it is how a re-import avoids duplicates.
 */
export function checkMapping(mappable: Field[], mapping: Record<string, string>, headers: string[], fill: Record<string, string> = {}): void {
  const targets = new Set(mappable.map((f) => f.apiName));
  const used = new Map<string, string>();
  for (const [heading, target] of Object.entries(mapping)) {
    if (!headers.includes(heading)) throw new ImportError(`The file has no column "${heading}".`, heading);
    if (target !== ZOHO_ID && !targets.has(target)) throw new ImportError(`"${heading}" cannot be imported into ${target}: that field is not writable.`, heading);
    if (used.has(target)) throw new ImportError(`"${heading}" and "${used.get(target)}" are both mapped to ${target}.`, heading);
    used.set(target, heading);
  }
  if (!used.has(ZOHO_ID)) throw new ImportError("Map the Zoho Record Id column, so that importing the file again updates records instead of duplicating them.", ZOHO_ID);
  for (const f of mappable) {
    if (f.required && !used.has(f.apiName) && !(f.apiName in fill)) throw new ImportError(`Map a column to ${f.apiName}: it is required.`, f.apiName);
  }
}

/** Loads the module's metadata as the caller's role may use it, then checks the mapping. Returns the mappable fields for the row validator. */
export async function validateMapping(tx: Tx, module: string, mapping: Record<string, string>, headers: string[], fill?: Record<string, string>) {
  const writable = new Set(moduleDef(module).writable.map((c) => c.name));
  const mappable = mappableFields(await loadFields(tx, module), writable);
  checkMapping(mappable, mapping, headers, fill);
  return mappable;
}
