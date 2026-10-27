import { sql } from "drizzle-orm";
import { z } from "zod";
import { listMyTasks } from "../activities/mine.ts";
import { ApiError, NotFound } from "../http/errors.ts";
import type { TenantContext, Tx } from "../tenant.ts";
import { loadFields, moduleDef, toApi } from "./registry.ts";

// Reads go through RLS: org scoping, plus owner visibility on private modules (ADR-0005). Soft-deleted rows are gone.

/** GET /{module}/{id}: one visible record as data:[record], or 404. */
export async function getRecord(tx: Tx, module: string, id: string) {
  const def = moduleDef(module);
  const { rows } = await tx.execute(sql`SELECT * FROM ${def.table} WHERE id = ${id} AND ${def.scope} AND deleted_at IS NULL`);
  if (rows.length === 0) throw new NotFound();
  return toApi(tx, await loadFields(tx, module), rows as Parameters<typeof toApi>[2]);
}

export const Paging = {
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(200).default(20), // AC-34
};

export const ListRecordsInput = z.object({
  ...Paging,
  sort_by: z.string().max(60).optional(),
  sort_order: z.enum(["asc", "desc"]).default("desc"),
  fields: z.string().max(2000).optional(),
  cvid: z.enum(["all", "my", "my_open", "overdue", "recently_created", "recently_modified"]).optional(), // shortcut: system views only, no saved custom views
});

/** page/per_page → LIMIT one extra row, so more_records is exact without a count query. */
export function pageOf<T>(rows: T[], { page, per_page }: { page: number; per_page: number }) {
  const data = rows.slice(0, per_page);
  return { data, info: { page, per_page, count: data.length, more_records: rows.length > per_page } };
}
export const limitOffset = ({ page, per_page }: { page: number; per_page: number }) => sql`LIMIT ${per_page + 1} OFFSET ${(page - 1) * per_page}`;

/** GET /{module}: a page of visible records. sort_by is allowlisted against the module's column-backed fields (AC-36). */
export async function listRecords(tx: Tx, ctx: TenantContext, module: string, input: z.infer<typeof ListRecordsInput>) {
  const def = moduleDef(module);
  if (input.cvid === "my_open" || input.cvid === "overdue") {
    if (module !== "Tasks") throw new ApiError(422, "INVALID_DATA", "This view is only for Tasks.", { api_name: "cvid" });
    return listMyTasks(tx, ctx, input.cvid, input);
  }
  const fields = await loadFields(tx, module);
  const sortable = new Map<string, string>([["Created_Time", "created_at"], ["Modified_Time", "updated_at"]]);
  for (const f of fields) if (f.isSystem) sortable.set(f.apiName, f.columnName!);
  const column = input.cvid === "recently_created" ? "created_at" : sortable.get(input.sort_by ?? "Modified_Time");
  if (!column) throw new ApiError(422, "INVALID_DATA", "This field cannot be sorted on.", { api_name: "sort_by" });
  const dir = input.sort_order === "asc" ? sql`ASC` : sql`DESC`;
  const mine = input.cvid === "my" ? sql`AND owner_id = ${ctx.userId}` : sql``;
  const { rows } = await tx.execute(sql`
    SELECT * FROM ${def.table} WHERE ${def.scope} AND deleted_at IS NULL ${mine}
    ORDER BY ${sql.identifier(column)} ${dir} NULLS LAST, id ${dir} ${limitOffset(input)}`);
  const wanted = input.fields?.split(",").map((f) => f.trim());
  return pageOf(await toApi(tx, wanted ? fields.filter((f) => wanted.includes(f.apiName)) : fields, rows as Parameters<typeof toApi>[2]), input);
}
