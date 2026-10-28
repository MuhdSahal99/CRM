import { sql } from "drizzle-orm";
import { z } from "zod";
import { NotFound } from "../http/errors.ts";
import { listNotes } from "../notes.ts";
import type { Tx } from "../tenant.ts";
import { limitOffset, pageOf, Paging } from "./list.ts";
import { loadFields, moduleDef, toApi } from "./registry.ts";

// Related lists on a detail page (US-06). Later slices add Deals, Quotes, Notes… as entries here.
type RelatedList = { api_name: string; module: string; column: string };
const RELATED: Record<string, RelatedList[]> = {
  Accounts: [{ api_name: "Contacts", module: "Contacts", column: "account_id" }, { api_name: "Deals", module: "Deals", column: "account_id" }, { api_name: "Quotes", module: "Quotes", column: "account_id" }, { api_name: "Sales_Orders", module: "Sales_Orders", column: "account_id" }],
  Deals: [{ api_name: "Quotes", module: "Quotes", column: "deal_id" }, { api_name: "Sales_Orders", module: "Sales_Orders", column: "deal_id" }],
  Quotes: [{ api_name: "Sales_Orders", module: "Sales_Orders", column: "quote_id" }],
  Sales_Orders: [{ api_name: "Invoices", module: "Invoices", column: "sales_order_id" }],
  Contacts: [{ api_name: "Deals", module: "Deals", column: "contact_id" }],
};

/** GET /settings/related_lists. */
export const listRelatedLists = (module: string) =>
  (RELATED[module] ?? []).map((r) => ({ api_name: r.api_name, module: r.module, label_key: `related.${r.api_name}` }));

export const RelatedInput = z.object(Paging);

/** GET /{module}/{id}/{related_list}: the parent must be visible (else 404); each child goes through its own RLS. */
export async function listRelated(tx: Tx, module: string, id: string, relatedList: string, input: z.infer<typeof RelatedInput>) {
  if (relatedList === "Notes") return listNotes(tx, module, id, input); // not a module: its own table and shape
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
