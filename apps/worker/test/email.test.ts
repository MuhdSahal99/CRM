import "./env.ts";
import { closeQueues, contextForMember, createFile, getAuthDb, getQueue, provisionOrg, putFile, type TenantContext, withTenant } from "@crm/core";
import { connectAsApp, connectAsAuth, createMember, createOrg, queryAs } from "@crm/db/testing";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runJob, sweepOrg } from "../src/jobs.ts";

// T9.03 (US-13, AC-42): the email worker. Needs Mailpit (MAILPIT_URL, MAILPIT_SMTP_PORT) and object storage (S3_*): skipped without them.
describe.skipIf(!process.env.MAILPIT_URL || !process.env.S3_BUCKET)("email worker (T9.03)", () => {
  let app: pg.Client;
  let ctx: TenantContext;
  let settings: Record<string, string>;
  let invoice: string;
  let contact: string;
  let file: string;
  const previous = process.env.ALLOW_PRIVATE_SMTP;

  const setPort = (port: number) => queryAs(app, settings, "UPDATE org_settings SET smtp_port = $1", [port]);
  const queue = async (ageMinutes = 0) => (await queryAs(app, settings, `INSERT INTO email_sends (id, org_id, record_type, record_id, file_id, to_contact_id, to_email, subject, body, status, queued_at, created_by)
    VALUES (gen_random_uuid(), app.org_id(), 'invoice', $1, $2, $3, 'buyer@example.test', $4, 'Please find it attached.', 'queued', now() - make_interval(mins => $5), $6) RETURNING id`,
    [invoice, file, contact, `T9.03 ${crypto.randomUUID()}`, ageMinutes, ctx.userId]))[0].id as string;
  const payload = (email_send_id: string) => ({ org_id: ctx.orgId, user_id: ctx.userId, email_send_id });
  const row = async (id: string) => (await queryAs(app, settings, "SELECT status, attempts, subject, error_code, error_message, provider_message_id, sent_at FROM email_sends WHERE id = $1", [id]))[0];
  const events = (id: string, type: string) => queryAs(app, settings, "SELECT meta FROM timeline_events WHERE event_type = $1 AND meta->>'email_send_id' = $2", [type, id]);
  const mailpit = async (subject: string) => ((await (await fetch(`${process.env.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`subject:"${subject}"`)}`)).json()) as { messages: unknown[] }).messages;

  beforeAll(async () => {
    process.env.ALLOW_PRIVATE_SMTP = "true"; // TEMP-DEV: smtp-private-hosts
    app = await connectAsApp();
    const auth = await connectAsAuth();
    const org = await createOrg(auth);
    const admin = await createMember(auth, org, "admin");
    await auth.end();
    settings = { org_id: org, user_id: admin, role: "admin", see_all: "on" };
    ctx = (await contextForMember(getAuthDb(), admin, org))!;
    await withTenant(ctx, provisionOrg);
    await queryAs(app, settings, "UPDATE org_settings SET legal_name = 'Saqient LLC', smtp_host = '127.0.0.1', smtp_from_email = 'sales@saqient.test', smtp_from_name = 'Saqient Sales'");
    await setPort(Number(process.env.MAILPIT_SMTP_PORT ?? 1025));
    const [{ id: account }] = await queryAs(app, settings, "INSERT INTO accounts (id, org_id, owner_id, account_name) VALUES (gen_random_uuid(), app.org_id(), $1, 'Al Noor') RETURNING id", [admin]);
    [{ id: contact }] = await queryAs(app, settings, "INSERT INTO contacts (id, org_id, owner_id, first_name, last_name, email, account_id) VALUES (gen_random_uuid(), app.org_id(), $1, 'Salim', 'Buyer', 'buyer@example.test', $2) RETURNING id", [admin, account]);
    [{ id: invoice }] = await queryAs(app, settings, `INSERT INTO invoices (id, org_id, owner_id, subject, account_id, currency, currency_scale, exchange_rate, sub_total, vat_total, grand_total, vat_total_omr, grand_total_omr)
      VALUES (gen_random_uuid(), app.org_id(), $1, 'I', $2, 'OMR', 3, 1, 10, 0.5, 10.5, 0.5, 10.5) RETURNING id`, [admin, account]);
    file = await withTenant(ctx, async (tx) => {
      const f = await createFile(tx, { kind: "invoice_pdf", filename: "INV-1.pdf", contentType: "application/pdf", record: { type: "invoice", id: invoice } });
      await putFile(tx, f.id, Buffer.from("%PDF-1.4 test"));
      return f.id;
    });
  });
  afterAll(async () => {
    if (previous === undefined) delete process.env.ALLOW_PRIVATE_SMTP;
    else process.env.ALLOW_PRIVATE_SMTP = previous;
    await Promise.all([app?.end(), closeQueues()]);
    await getAuthDb().$client.end();
  });

  it("sends once with the PDF, then marks it sent and logs 'email_sent' in the same transaction", async () => {
    const id = await queue();
    expect(await runJob("email", payload(id))).toEqual({ status: "sent" });
    expect(await row(id)).toMatchObject({ status: "sent", attempts: 1, error_code: null });
    expect((await row(id)).provider_message_id).toContain(id);
    expect(await events(id, "email_sent")).toMatchObject([{ meta: { to: "Salim Buyer", to_email: "buyer@example.test" } }]);
    expect(await mailpit((await row(id)).subject)).toHaveLength(1);
    expect(await runJob("email", payload(id))).toEqual({ skipped: "not queued" }); // a redelivered job is a no-op
    expect(await events(id, "email_sent")).toHaveLength(1);
  });

  it("two jobs at once send one message and log one event", async () => {
    const id = await queue();
    await Promise.all([runJob("email", payload(id)), runJob("email", payload(id))]);
    expect(await events(id, "email_sent")).toHaveLength(1);
    expect(await mailpit((await row(id)).subject)).toHaveLength(1);
  });

  it("an SMTP failure: a retryable attempt goes back to queued and throws; the last attempt is failed with an error and NO sent event", async () => {
    await setPort(1); // nothing listens: connection refused
    try {
      const id = await queue();
      await expect(runJob("email", payload(id), { lastAttempt: false })).rejects.toThrow();
      expect(await row(id)).toMatchObject({ status: "queued", attempts: 1 });
      expect(await runJob("email", payload(id), { lastAttempt: true })).toMatchObject({ status: "failed" });
      expect(await row(id)).toMatchObject({ status: "failed", attempts: 2 });
      expect((await row(id)).error_message).toBeTruthy();
      expect(await events(id, "email_sent")).toHaveLength(0);
      expect(await events(id, "email_failed")).toHaveLength(1);
      expect(await mailpit((await row(id)).subject)).toHaveLength(0);
    } finally {
      await setPort(Number(process.env.MAILPIT_SMTP_PORT ?? 1025));
    }
  });

  it("an org that has not set up email fails the send for good, with a clear message", async () => {
    await queryAs(app, settings, "UPDATE org_settings SET smtp_host = NULL");
    try {
      const id = await queue();
      expect(await runJob("email", payload(id), { lastAttempt: false })).toMatchObject({ status: "failed" });
      expect((await row(id)).error_message).toMatch(/not set up/);
    } finally {
      await queryAs(app, settings, "UPDATE org_settings SET smtp_host = '127.0.0.1'");
    }
  });

  it("AC-42: Redis lost the job after commit: the sweeper requeues the stale row and exactly one event exists", async () => {
    const id = await queue(10); // queued ten minutes ago and never picked up
    expect(await getQueue("email").getJob(`email-${id}`)).toBeUndefined();
    expect(await sweepOrg(ctx.orgId)).toBeGreaterThanOrEqual(1);
    expect(await getQueue("email").getJob(`email-${id}`)).toBeDefined();
    await runJob("email", payload(id));
    await runJob("email", payload(id)); // the sweeper may requeue again; a second delivery does nothing
    expect(await events(id, "email_sent")).toHaveLength(1);
    expect(await mailpit((await row(id)).subject)).toHaveLength(1);
  });
});
