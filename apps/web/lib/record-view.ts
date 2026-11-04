import type { FieldMeta, ModuleMeta } from "./records";

// Pure helpers, kept apart from records.ts so client components can use them without pulling @crm/core into the browser bundle.

/** A record's display name from its name fields (e.g. First_Name Last_Name). */
export const recordTitle = (meta: ModuleMeta, record: Record<string, unknown>) =>
  meta.nameFields.map((api) => record[api]).filter(Boolean).join(" ");

/**
 * List columns, picked from the layout with no per-module code: the name, the first email, the mobile (else the
 * first phone), the first lookup, then the owner.
 */
export function listColumns(meta: ModuleMeta): FieldMeta[] {
  const placed = meta.sections.flatMap((s) => s.fields);
  const first = (pick: (f: FieldMeta) => boolean) => placed.find(pick);
  return [
    first((f) => f.data_type === "email"),
    first((f) => f.api_name === "Mobile") ?? first((f) => f.data_type === "phone"),
    first((f) => f.data_type === "lookup"),
    first((f) => f.data_type === "user_lookup"),
  ].filter((f): f is FieldMeta => Boolean(f));
}
