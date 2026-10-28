import { sql } from "drizzle-orm";
import nodemailer from "nodemailer";
import { parseConfig } from "./config.ts";
import type { Tx } from "./tenant.ts";

// T9.01 (US-13): the org's SMTP settings and one send. nodemailer is only used here. OQ-09 (provider, domain, SPF/DKIM) blocks the prod config.
// shortcut: the password comes from SMTP_PASSWORD, not from the Secrets Manager reference in org_settings.smtp_secret_ref; resolve the ref when hosting is decided.

export type Smtp = { host: string; port: number; username: string | null; fromEmail: string; fromName: string | null };
export class SmtpNotConfigured extends Error {
  constructor() {
    super("Email is not set up: an Admin must enter the SMTP host, port and sender in the organisation settings.");
  }
}

export async function loadSmtp(tx: Tx): Promise<Smtp> {
  const row = (await tx.execute<{ smtp_host: string | null; smtp_port: number | null; smtp_username: string | null; smtp_from_email: string | null; smtp_from_name: string | null }>(sql`
    SELECT smtp_host, smtp_port, smtp_username, smtp_from_email, smtp_from_name FROM org_settings WHERE org_id = app.org_id()`)).rows[0];
  if (!row?.smtp_host || !row.smtp_port || !row.smtp_from_email) throw new SmtpNotConfigured();
  return { host: row.smtp_host, port: row.smtp_port, username: row.smtp_username, fromEmail: row.smtp_from_email, fromName: row.smtp_from_name };
}

/** `Message-ID` derived from email_sends.id, so a redelivered job sends the same id and a mail server can drop the duplicate. */
export const messageIdFor = (emailSendId: string, fromEmail: string) => `<${emailSendId}@${fromEmail.split("@")[1]}>`;

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);
const noBreaks = (name: string, value: string) => {
  if (/[\r\n]/.test(value)) throw new Error(`${name} must not contain a line break.`); // header injection (AC-44)
};

export type Outgoing = { id: string; to: string; subject: string; text: string; attachments?: { filename: string; content: Buffer; contentType: string }[] };

/** One message over STARTTLS (required unless the server is on this machine). Resolves with the provider's message id; rejects on any SMTP error. */
export async function sendMail(smtp: Smtp, msg: Outgoing): Promise<{ messageId: string }> {
  for (const [name, value] of [["to", msg.to], ["subject", msg.subject], ["from name", smtp.fromName ?? ""], ["from", smtp.fromEmail]] as const) noBreaks(name, value);
  const password = parseConfig(process.env).SMTP_PASSWORD;
  if (smtp.username && !password) throw new Error("SMTP_PASSWORD is not set.");
  const transport = nodemailer.createTransport({
    host: smtp.host, port: smtp.port, secure: smtp.port === 465, requireTLS: smtp.port !== 465 && !LOOPBACK.has(smtp.host),
    auth: smtp.username ? { user: smtp.username, pass: password! } : undefined,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 30_000,
  });
  try {
    const info = await transport.sendMail({
      messageId: messageIdFor(msg.id, smtp.fromEmail),
      from: smtp.fromName ? { name: smtp.fromName, address: smtp.fromEmail } : smtp.fromEmail,
      to: msg.to, subject: msg.subject, text: msg.text, attachments: msg.attachments,
    });
    return { messageId: info.messageId };
  } finally {
    transport.close();
  }
}
