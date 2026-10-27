import type { schema } from "@crm/db";
import type { PgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";

type FieldType = (typeof schema.fieldType.enumValues)[number];

/** One field as the builder needs it: a `fields` row plus its active picklist values. */
export type FieldDef = {
  apiName: string;
  dataType: FieldType;
  isSystem: boolean;
  columnName: string | null;
  required: boolean;
  readOnly: boolean;
  maxLength: number | null;
  scale: number | null;
  picklistValues: string[];
};

function valueSchema(f: FieldDef): z.ZodType {
  const text = f.maxLength ? z.string().max(f.maxLength) : z.string();
  const decimal = z.string().regex(new RegExp(`^-?\\d{1,15}(\\.\\d{1,${f.scale ?? 3}})?$`), "Expected a decimal string");
  const pick = f.picklistValues.length ? z.enum(f.picklistValues as [string, ...string[]]) : z.never(); // no active values: nothing fits
  switch (f.dataType) {
    case "email": return z.email().max(f.maxLength ?? 254);
    case "url": return z.url().max(f.maxLength ?? 2048);
    case "picklist": return pick;
    case "multiselect": return z.array(pick);
    case "date": return z.iso.date();
    case "datetime": return z.iso.datetime({ offset: true });
    case "integer": return z.int();
    case "decimal": case "currency": case "percent": return decimal; // money and rates travel as strings (ADR-0007)
    case "boolean": return z.boolean();
    case "lookup": case "user_lookup": return z.uuid();
    default: return text; // text, textarea, phone (autonumber is read-only, so never an input)
  }
}

/**
 * The server-built input schema for a module (ADR-0006): known api_names only (unknown keys are rejected),
 * required/max_length/picklist rules from metadata, and `toRow` mapping api_name to its column or `custom`.
 * `writableColumns` is the module service's allowlist: a system field may only map onto one of them, so metadata can
 * never steer a write into tenancy, audit or server-computed columns (totals, conversion flags) or into SQL.
 */
export function buildRecordSchema(fields: FieldDef[], writableColumns: PgColumn[]) {
  const allowed = new Set(writableColumns.map((c) => c.name));
  for (const f of fields.filter((f) => f.isSystem)) {
    if (!f.columnName || !allowed.has(f.columnName)) {
      throw new Error(`Field ${f.apiName} maps to column "${f.columnName}", which metadata may not write`);
    }
  }

  const writable = fields.filter((f) => !f.readOnly && f.dataType !== "autonumber");
  const shape = Object.fromEntries(writable.map((f) => [f.apiName, f.required ? valueSchema(f) : valueSchema(f).nullable().optional()]));
  const byApiName = new Map(writable.map((f) => [f.apiName, f]));

  return {
    schema: z.strictObject(shape),
    toRow(input: Record<string, unknown>): Record<string, unknown> {
      const row: Record<string, unknown> = {};
      const custom: Record<string, unknown> = {};
      for (const [apiName, value] of Object.entries(input)) {
        const f = byApiName.get(apiName)!;
        if (f.isSystem) row[f.columnName!] = value;
        else custom[apiName] = value;
      }
      return Object.keys(custom).length ? { ...row, custom } : row;
    },
  };
}
