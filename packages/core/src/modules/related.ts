import { sql } from "drizzle-orm";
import { z } from "zod";
import { NotFound } from "../http/errors.ts";
import type { Tx } from "../tenant.ts";
import { limitOffset, pageOf, Paging } from "./list.ts";
import { loadFields, moduleDef, toApi } from "./registry.ts";

// Related lists on a detail page (US-06). Later slices add Deals, Quotes, Notes… as entries here.
type RelatedList = { api_name: string; module: string; column: string };
const RELATED: Record<string, RelatedList[]> = {
  Accounts: [{ api_name: "Contacts", module: "Contacts", column: "account_id" }],
};

/** GET /settings/related_lists. */
export const listRelatedLists = (module: string) =>
  (RELATED[module] ?? []).map((r) => ({ api_name: r.api_name, module: r.module, label_key: `related.${r.api_name}` }));

export const RelatedInput = z.object(Paging);

/** GET /{module}/{id}/{related_list}: the parent must be visible (else 404); each child goes through its own RLS. */
export async function listRelated(tx: Tx, module: string, id: string, relatedList: string, input: z.infer<typeof RelatedInput>) {
  const related = RELATED[module]?.find((r) => r.api_name === relatedList);
  if (!related) throw new NotFound();
  const parent = await tx.execute(sql`SELECT 1 FROM ${moduleDef(module).table} WHERE id = ${id} AND ${moduleDef(module).scope} AND deleted_at IS NULL`);
  if (parent.rows.length === 0) throw new NotFound();
  const child = moduleDef(related.module);
  const { rows } = await tx.execute(sql`
    SELECT * FROM ${child.table} WHERE ${child.scope} AND ${sql.identifier(related.column)} = ${id} AND deleted_at IS NULL
    ORDER BY updated_at DESC, id ${limitOffset(input)}`);
  return pageOf(await toApi(tx, await loadFields(tx, related.module), rows as Parameters<typeof toApi>[2]), input);
}
