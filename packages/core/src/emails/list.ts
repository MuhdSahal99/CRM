import { sql } from "drizzle-orm";
import { isDocModule } from "../documents-pdf.ts";
import { NotFound } from "../http/errors.ts";
import { limitOffset, pageOf } from "../modules/list.ts";
import { moduleDef } from "../modules/registry.ts";
import type { Tx } from "../tenant.ts";

type Row = { id: string; to_contact_id: string | null; contact_name: string | null; to_email: string; subject: string; status: string; error_code: string | null; error_message: string | null; queued_at: string; sent_at: string | null; sender: string | null };

/** GET /{module}/{id}/Emails (US-13): the sends of a quote, sales order or invoice, newest first, with the error of a failed one. 404 for a document the caller cannot see. */
export async function listEmails(tx: Tx, module: string, id: string, page: Parameters<typeof limitOffset>[0]) {
  if (!isDocModule(module)) throw new NotFound();
  const def = moduleDef(module);
  if ((await tx.execute(sql`SELECT 1 FROM ${def.table} WHERE id = ${id} AND ${def.scope} AND deleted_at IS NULL`)).rows.length === 0) throw new NotFound();
  const { rows } = await tx.execute<Row>(sql`
    SELECT e.id, e.to_contact_id, nullif(concat_ws(' ', c.first_name, c.last_name), '') AS contact_name, e.to_email::text AS to_email, e.subject, e.status,
      e.error_code, e.error_message, e.queued_at, e.sent_at, u.name AS sender
    FROM email_sends e LEFT JOIN contacts c ON c.id = e.to_contact_id LEFT JOIN org_users u ON u.id = e.created_by
    WHERE e.record_type = ${def.recordType} AND e.record_id = ${id}
    ORDER BY e.queued_at DESC, e.id DESC ${limitOffset(page)}`);
  return pageOf(rows.map((e) => ({
    id: e.id,
    To: { id: e.to_contact_id, name: e.contact_name ?? e.to_email },
    To_Email: e.to_email,
    Subject: e.subject,
    Status: e.status,
    Error: e.status === "failed" ? e.error_message ?? e.error_code : null,
    Queued_Time: new Date(e.queued_at).toISOString(),
    Sent_Time: e.sent_at ? new Date(e.sent_at).toISOString() : null,
    Sent_By: e.sender?.trim() ?? null,
  })), page);
}
