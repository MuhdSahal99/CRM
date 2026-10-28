import { newId } from "@crm/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { ApiError, Conflict, NotFound } from "../http/errors.ts";
import { currentPdf, DOCS } from "../documents-pdf.ts";
import { enqueueAfterCommit } from "../jobs/enqueue.ts";
import type { Tx } from "../tenant.ts";

// T9.02 (US-13): the request half of a send. It validates, records a `queued` email_sends row and queues the job after commit; the SMTP
// send and the "Email sent to X" event are the worker's (T9.03). The recipient is always a Contact the caller can see, never a typed address.

const noBreaks = (v: string) => !/[\r\n]/.test(v);
export const SendEmailInput = z.object({
  to_contact_id: z.uuid(),
  subject: z.string().trim().min(1).max(255).refine(noBreaks, "Remove the line break.").optional(), // AC-44: no header injection
  message: z.string().trim().max(5000).optional(),
});

/** POST /{module}/{id}/actions/send_email. 404 for a document or contact the caller cannot see; 409 for a draft invoice; 422 for a contact with no email. */
export async function requestEmail(tx: Tx, module: string, id: string, input: z.infer<typeof SendEmailInput>) {
  const { number, file } = await currentPdf(tx, module, id); // 404 for an unknown, invisible or draft document; queues a render if needed
  const d = DOCS[module as keyof typeof DOCS];
  const contact = (await tx.execute<{ email: string | null }>(sql`SELECT email::text AS email FROM contacts WHERE id = ${input.to_contact_id} AND deleted_at IS NULL`)).rows[0];
  if (!contact) throw new NotFound();
  if (!contact.email || !z.email().safeParse(contact.email).success) throw new ApiError(422, "NO_EMAIL", "This contact has no email address.", { api_name: "to_contact_id" });
  if (!file) throw new Conflict("INVALID_STATE", "This document has no PDF yet.");

  const emailSendId = newId();
  const { o, u } = (await tx.execute<{ o: string; u: string }>(sql`SELECT app.org_id() AS o, current_setting('app.user_id', true) AS u`)).rows[0]!;
  await tx.execute(sql`
    INSERT INTO email_sends (id, org_id, record_type, record_id, file_id, to_contact_id, to_email, subject, body, status, created_by)
    VALUES (${emailSendId}, ${o}, ${d.recordType}, ${id}, ${file.id}, ${input.to_contact_id}, ${contact.email}, ${input.subject ?? `${d.title} ${number ?? ""}`.trim()}, ${input.message ?? ""}, 'queued', ${u})`);
  enqueueAfterCommit(tx, "email", { org_id: o, user_id: u, email_send_id: emailSendId }, emailSendId);
  return { data: [{ email_send_id: emailSendId, status: "queued" }] };
}
