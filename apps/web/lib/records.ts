import { listFields, listLayouts, listPipelines, listRecords, listUsers, nameFieldsOf, RECORD_MODULES, type TenantContext, type Tx } from "@crm/core";

// Metadata as the record pages use it (ADR-0006).: fields from /settings/fields, grouped by the default layout.

export type FieldMeta = {
  api_name: string;
  label_key: string;
  data_type: string;
  required: boolean;
  read_only: boolean;
  max_length: number | null;
  lookup_module: string | null;
  picklist_values: { value: string; label_key: string }[];
  access: "read_write" | "read_only" | "hidden";
};
export type SectionMeta = { label_key: string; columns: 1 | 2; fields: FieldMeta[] };
export type Lookup = { id: string; name: string | null };
export type RecordData = Record<string, unknown> & { id: string; version: number };

export const isRecordModule = (module: string) => RECORD_MODULES.includes(module);

/** The module's fields and its default layout's sections; hidden fields are already gone (server-side). */
export async function moduleMeta(tx: Tx, module: string) {
  const fields = (await listFields(tx, module as Parameters<typeof listFields>[1])) as FieldMeta[];
  const [layout] = (await listLayouts(tx, module as Parameters<typeof listLayouts>[1])) as { sections: { label_key: string; columns: 1 | 2; fields: string[] }[] }[];
  const byApi = new Map(fields.map((f) => [f.api_name, f]));
  const sections: SectionMeta[] = (layout?.sections ?? []).map((s) => ({ ...s, fields: s.fields.flatMap((api) => byApi.get(api) ?? []) }));
  return { fields, sections, nameFields: nameFieldsOf(module) };
}
export type ModuleMeta = Awaited<ReturnType<typeof moduleMeta>>;

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

/**
 * What each lookup on the form may point at: org users for user lookups, visible records for record lookups.
 * shortcut: the 200 most recently changed records per lookup; swap in a search combobox once orgs outgrow it.
 */
export async function lookupOptions(tx: Tx, ctx: TenantContext, meta: ModuleMeta): Promise<Record<string, Lookup[]>> {
  const options: Record<string, Lookup[]> = {};
  for (const f of meta.sections.flatMap((s) => s.fields)) {
    if (f.data_type === "user_lookup") {
      const { data } = await listUsers(tx, { status: "active", page: 1, per_page: 200 });
      options[f.api_name] = (data as Lookup[]).map((u) => ({ id: u.id, name: u.name }));
    } else if (f.data_type === "lookup" && f.api_name === "Stage" && !f.lookup_module) {
      // Pipeline set-up is not a module: the stages of the default pipeline, named by their api_value.
      const pipelines = (await listPipelines(tx)) as { is_default: boolean; stages: { id: string; api_value: string }[] }[];
      options[f.api_name] = (pipelines.find((p) => p.is_default)?.stages ?? []).map((s) => ({ id: s.id, name: s.api_value }));
    } else if (f.data_type === "lookup" && f.lookup_module && isRecordModule(f.lookup_module)) {
      const target = await moduleMeta(tx, f.lookup_module);
      const { data } = await listRecords(tx, ctx, f.lookup_module, { page: 1, per_page: 200, sort_order: "desc" });
      options[f.api_name] = data.map((r) => ({ id: r.id as string, name: recordTitle(target, r) }));
    }
  }
  return options;
}
