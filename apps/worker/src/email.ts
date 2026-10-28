import { enqueueAfterCommit, loadSmtp, openFile, recordEvent, sendMail, SmtpNotConfigured, type TenantContext, withTenant } from "@crm/core";
import { sql } from "drizzle-orm";
import type { Run } from "./jobs.ts";

// T9.03 (US-13, ADR-0011, AC-42): one email_sends row, sent at most once. The claim (queued -> sending) commits before the SMTP call, so a
// redelivered job finds `sending` or `sent` and exits. "Sent" and its timeline event commit together; a failure records `failed` and no
// sent event. A crash between the SMTP call and that commit leaves `sending`; the sweeper requeues it, and the Message-ID (derived from the
// row id) lets a mail server drop the duplicate.

type Claimed = { id: string; record_type: string; record_id: string; file_id: string; to_email: string; subject: string; body: string; contact_name: string | null; file_ready: boolean };

/** An SMTP error that retrying cannot fix: the server refused the message or login, or the org's setup is wrong. */
const permanent = (error: unknown) => error instanceof SmtpNotConfigured || (typeof (error as { responseCode?: number }).responseCode === "number" && (error as { responseCode: number }).responseCode >= 500) || /line break|No SMTP credentials|sender domain|public address|not allowed/.test(String((error as Error)?.message));

export async function sendEmailJob(ctx: TenantContext, id: string, run: Run) {
  const claimed = await withTenant(ctx, async (tx) => {
    const row = (await tx.execute<Claimed>(sql`
      WITH c AS (UPDATE email_sends SET status = 'sending', attempts = attempts + 1 WHERE id = ${id} AND status = 'queued'
        RETURNING id, record_type, record_id, file_id, to_email::text AS to_email, subject, body, to_contact_id)
      SELECT c.id, c.record_type, c.record_id, c.file_id, c.to_email, c.subject, c.body,
        (SELECT nullif(concat_ws(' ', first_name, last_name), '') FROM contacts WHERE id = c.to_contact_id) AS contact_name,
        (SELECT status = 'ready' FROM files WHERE id = c.file_id) AS file_ready FROM c`)).rows[0];
    if (row && !row.file_ready) await tx.execute(sql`UPDATE email_sends SET status = 'queued', attempts = attempts - 1 WHERE id = ${id}`); // still rendering: not an attempt
    return row;
  });
  if (!claimed) return { skipped: "not queued" };

  try {
    if (!claimed.file_ready) throw Object.assign(new Error("The PDF is not ready yet."), { code: "PDF_PENDING" });
    const { smtp, attachment } = await withTenant(ctx, async (tx) => {
      const file = await openFile(tx, claimed.file_id);
      return { smtp: await loadSmtp(tx), attachment: { filename: file.filename, content: Buffer.from(await new Response(file.stream).arrayBuffer()), contentType: file.contentType } };
    });
    const sent = await sendMail(smtp, { id, to: claimed.to_email, subject: claimed.subject, text: claimed.body || claimed.subject, attachments: [attachment] });
    await withTenant(ctx, async (tx) => {
      await tx.execute(sql`UPDATE email_sends SET status = 'sent', sent_at = now(), provider_message_id = ${sent.messageId}, error_code = NULL, error_message = NULL WHERE id = ${id}`);
      await recordEvent(tx, { recordType: claimed.record_type as never, recordId: claimed.record_id, eventType: "email_sent", meta: { email_send_id: id, to: claimed.contact_name ?? claimed.to_email, to_email: claimed.to_email } });
    });
    return { status: "sent" };
  } catch (error) {
    const code = String((error as { code?: string }).code ?? (error as Error).name ?? "SMTP_ERROR").slice(0, 40);
    const message = String((error as Error).message ?? error).slice(0, 500);
    if (permanent(error) || run.lastAttempt) {
      await withTenant(ctx, async (tx) => {
        await tx.execute(sql`UPDATE email_sends SET status = 'failed', error_code = ${code}, error_message = ${message} WHERE id = ${id}`);
        await recordEvent(tx, { recordType: claimed.record_type as never, recordId: claimed.record_id, eventType: "email_failed", meta: { email_send_id: id, to: claimed.contact_name ?? claimed.to_email, error_code: code } });
      });
      return { status: "failed", error_code: code };
    }
    await withTenant(ctx, (tx) => tx.execute(sql`UPDATE email_sends SET status = 'queued', error_code = ${code}, error_message = ${message} WHERE id = ${id}`)); // BullMQ retries with backoff
    throw error;
  }
}

/** Requeues emails stuck `queued` (the enqueue after commit was lost) or `sending` (the worker died) for more than `minutes`. Returns how many. */
export async function sweepStaleEmails(ctx: TenantContext, minutes: number): Promise<number> {
  return withTenant(ctx, async (tx) => {
    const { rows } = await tx.execute<{ id: string; created_by: string }>(sql`
      UPDATE email_sends SET status = 'queued' WHERE status IN ('queued', 'sending') AND queued_at < now() - make_interval(mins => ${minutes})
      RETURNING id, created_by`);
    for (const r of rows) enqueueAfterCommit(tx, "email", { org_id: ctx.orgId, user_id: r.created_by, email_send_id: r.id }, r.id);
    return rows.length;
  });
}
