import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../http/errors.ts";
import { limitOffset, pageOf, Paging } from "../modules/list.ts";
import { loadFields, moduleDef, toApi } from "../modules/registry.ts";
import type { Tx } from "../tenant.ts";
import { compileCriteria, parseCriteria } from "./criteria.ts";

export const SearchInput = z
  .object({
    criteria: z.string().max(2000).optional(),
    word: z.string().min(2).max(100).optional(),
    email: z.string().max(254).optional(),
    phone: z.string().max(30).optional(),
    ...Paging,
  })
  .refine((q) => [q.criteria, q.word, q.email, q.phone].filter((v) => v !== undefined).length === 1, {
    message: "Send exactly one of criteria, word, email or phone.",
    path: ["criteria"],
  });

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);
const anyOf = (conditions: SQL[]) => (conditions.length ? sql`(${sql.join(conditions, sql` OR `)})` : sql`false`);

/**
 * GET /{module}/search. Same visibility path as lists: the rows come through RLS, so a private module only ever
 * searches what the caller may see (AC-11), and public ones (Accounts, Contacts) search the whole org (US-02).
 */
export async function searchRecords(tx: Tx, module: string, input: z.infer<typeof SearchInput>) {
  const def = moduleDef(module);
  const fields = await loadFields(tx, module);
  const column = (api: string) => {
    const f = fields.find((f) => f.apiName === api)!;
    return f.isSystem ? sql`${sql.identifier(f.columnName!)}` : sql`custom->>${f.apiName}`;
  };
  const ofType = (type: string) => fields.filter((f) => f.dataType === type).map((f) => column(f.apiName));

  let where: SQL;
  if (input.criteria !== undefined) where = compileCriteria(parseCriteria(input.criteria, new Set(fields.map((f) => f.apiName))), column);
  else if (input.word !== undefined) {
    // The name is built from fields the caller's role may have hidden: matching on them would leak their values.
    if (!def.nameFields.every((api) => fields.some((f) => f.apiName === api))) {
      throw new ApiError(422, "INVALID_QUERY", "Word search is not available for your role in this module.", { api_name: "word" });
    }
    where = sql`${def.name} ILIKE ${`%${escapeLike(input.word)}%`}`; // trigram index
  }
  else if (input.email !== undefined) where = anyOf(ofType("email").map((c) => sql`lower(${c}) = lower(${input.email})`));
  else {
    const digits = input.phone!.replace(/\D/g, "");
    if (digits.length < 4) throw new ApiError(422, "INVALID_QUERY", "Enter at least 4 digits.", { api_name: "phone" });
    // Stored numbers may carry spaces or a country code: compare digits only, by suffix.
    where = anyOf(ofType("phone").map((c) => sql`regexp_replace(${c}, '\\D', '', 'g') LIKE ${`%${digits}`}`));
  }

  try {
    const { rows } = await tx.execute(sql`
      SELECT * FROM ${def.table} WHERE ${def.scope} AND deleted_at IS NULL AND ${where} ORDER BY updated_at DESC, id ${limitOffset(input)}`);
    return pageOf(await toApi(tx, fields, rows as Parameters<typeof toApi>[2]), input);
  } catch (error) {
    // A criteria value that does not fit the column's type (e.g. "many" for an integer).
    if (/^22/.test((error as { cause?: { code?: string } }).cause?.code ?? "")) {
      throw new ApiError(422, "INVALID_QUERY", "A value does not match its field's type.", { api_name: "criteria" });
    }
    throw error;
  }
}
