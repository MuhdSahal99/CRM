import { newId } from "@crm/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { NotFound } from "./http/errors.ts";
import { limitOffset, pageOf } from "./modules/list.ts";
import { moduleDef } from "./modules/registry.ts";
import type { Tx } from "./tenant.ts";
import { recordEvent } from "./timeline.ts";

// Notes (US-05): a related list `Notes` on the records that have one. A later slice adds its module here (Leads, Deals…).
const NOTE_PARENTS = ["Accounts", "Contacts", "Leads", "Deals"];

export const NoteInput = z.object({ data: z.array(z.strictObject({ Note_Content: z.string().trim().min(1).max(32000) })).length(1) });

/** The parent record's module entry, or 404 when the module has no Notes list or the record is not visible. */
async function parentOf(tx: Tx, module: string, id: string) {
  if (!NOTE_PARENTS.includes(module)) throw new NotFound();
  const def = moduleDef(module);
  const { rows } = await tx.execute(sql`SELECT 1 FROM ${def.table} WHERE id = ${id} AND deleted_at IS NULL`);
  if (rows.length === 0) throw new NotFound();
  return def;
}

/** GET /{module}/{id}/Notes: newest first. */
export async function listNotes(tx: Tx, module: string, id: string, page: Parameters<typeof limitOffset>[0]) {
  const def = await parentOf(tx, module, id);
  const { rows } = await tx.execute<{ id: string; body: string; created_at: string; created_by: string; name: string | null }>(sql`
    SELECT n.id, n.body, n.created_at, n.created_by, u.name FROM notes n LEFT JOIN org_users u ON u.id = n.created_by
    WHERE n.record_type = ${def.recordType} AND n.record_id = ${id} AND n.deleted_at IS NULL
    ORDER BY n.created_at DESC, n.id DESC ${limitOffset(page)}`);
  return pageOf(rows.map((n) => ({
    id: n.id,
    Note_Content: n.body,
    Created_Time: new Date(n.created_at).toISOString(),
    Created_By: { id: n.created_by, name: n.name?.trim() ?? null },
  })), page);
}

/** POST /{module}/{id}/Notes: adds a note and logs `note_added` on the record. Also what the Zoho import calls (US-17). */
export async function addNote(tx: Tx, module: string, id: string, input: z.infer<typeof NoteInput>) {
  const def = await parentOf(tx, module, id);
  const noteId = newId();
  await tx.execute(sql`INSERT INTO notes (id, org_id, record_type, record_id, body) VALUES (${noteId}, app.org_id(), ${def.recordType}, ${id}, ${input.data[0]!.Note_Content})`);
  await recordEvent(tx, { recordType: def.recordType, recordId: id, eventType: "note_added", meta: { note_id: noteId } });
  return [{ code: "SUCCESS", status: "success", details: { id: noteId } }];
}
