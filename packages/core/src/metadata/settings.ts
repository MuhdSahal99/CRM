import { sql } from "drizzle-orm";
import { z } from "zod";
import { NotFound } from "../http/errors.ts";
import type { Tx } from "../tenant.ts";
import { SYSTEM_MODULES } from "./seed-org.ts";

export const ModuleName = z.enum(SYSTEM_MODULES.map((m) => m.apiName)).meta({ id: "ModuleName" });

const VISIBILITY = new Map<string, string>(SYSTEM_MODULES.map((m) => [m.apiName, m.visibility]));

/** GET /settings/modules: the caller's org's modules (RLS scopes the rows), in nav order. */
export async function listModules(tx: Tx) {
  const { rows } = await tx.execute<{ api_name: string; label_key: string; is_custom: boolean }>(
    sql`SELECT api_name, label_key, is_custom FROM modules ORDER BY sort_order`,
  );
  return rows.map((m) => ({ ...m, visibility: VISIBILITY.get(m.api_name) ?? "private" }));
}

/** GET /settings/fields: one module's fields with active picklist values and the caller's access (no row = read_write). */
export async function listFields(tx: Tx, module: z.infer<typeof ModuleName>) {
  const found = await tx.execute(sql`SELECT 1 FROM modules WHERE api_name = ${module}`);
  if (found.rows.length === 0) throw new NotFound();
  const { rows } = await tx.execute(sql`
    SELECT f.id, f.api_name, f.label_key, f.data_type, f.is_system, f.required, f.is_unique, f.read_only, f.max_length,
      lm.api_name AS lookup_module,
      COALESCE((SELECT json_agg(json_build_object('value', v.value, 'label_key', v.label_key, 'category', v.category, 'sort_order', v.sort_order)
                ORDER BY v.sort_order) FROM picklist_values v WHERE v.picklist_id = f.picklist_id AND v.is_active), '[]') AS picklist_values,
      COALESCE(fp.access, 'read_write') AS access
    FROM fields f
    JOIN modules m ON m.id = f.module_id
    LEFT JOIN modules lm ON lm.id = f.lookup_module_id
    LEFT JOIN field_permissions fp ON fp.field_id = f.id AND fp.role = current_setting('app.role', true)
    WHERE m.api_name = ${module}
    ORDER BY f.is_system DESC, f.api_name`);
  return rows;
}

/** GET /settings/layouts: a module's layouts with sections and placed field api_names, minus fields hidden for the role. */
export async function listLayouts(tx: Tx, module: z.infer<typeof ModuleName>) {
  const { rows } = await tx.execute(sql`
    SELECT l.id, l.name, l.is_default,
      COALESCE((SELECT json_agg(json_build_object('label_key', s.label_key, 'columns', s.columns, 'fields',
        COALESCE((SELECT json_agg(f.api_name ORDER BY lf.sort_order) FROM layout_fields lf JOIN fields f ON f.id = lf.field_id
          LEFT JOIN field_permissions fp ON fp.field_id = f.id AND fp.role = current_setting('app.role', true)
          WHERE lf.section_id = s.id AND COALESCE(fp.access, 'read_write') <> 'hidden'), '[]')) ORDER BY s.sort_order)
        FROM layout_sections s WHERE s.layout_id = l.id), '[]') AS sections
    FROM layouts l JOIN modules m ON m.id = l.module_id
    WHERE m.api_name = ${module}
    ORDER BY l.is_default DESC, l.name`);
  return rows;
}
