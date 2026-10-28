import { lookup } from "node:dns/promises";
import net from "node:net";
import { sql } from "drizzle-orm";
import nodemailer from "nodemailer";
import { parseConfig } from "./config.ts";
import type { Tx } from "./tenant.ts";

// T9.01 (US-13): the org's SMTP settings and one send. nodemailer is only used here. OQ-09 (provider, domain, SPF/DKIM) blocks the prod config.
// The host and port are chosen by an org Admin, so they are untrusted: the destination must resolve to public addresses on a mail port, and
// the global SMTP_PASSWORD goes only to SMTP_PASSWORD_HOST. shortcut: a per-org password from org_settings.smtp_secret_ref (Secrets Manager) comes
// when hosting is decided; until then an org uses that host or an unauthenticated relay.

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

/** Loopback, private, link-local, CGNAT, multicast, unspecified and mapped/unparseable IPv6: anywhere a tenant must not make the server connect. */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split(".").map(Number) as [number, number, number];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && c === 0)));
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return !net.isIPv4(v.slice(7)) || isPrivateAddress(v.slice(7));
  return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("ff");
}

const MAIL_PORTS = new Set([25, 465, 587]);

/** The address to connect to. The check and the connection use the same lookup result, so the name cannot be re-pointed in between. */
export async function resolveSmtpHost(host: string, port: number, allowPrivate: boolean): Promise<string> {
  if (allowPrivate) return host; // TEMP-DEV: smtp-private-hosts
  if (!MAIL_PORTS.has(port)) throw new Error(`SMTP port ${port} is not allowed: use 25, 465 or 587.`);
  const addresses = await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) throw new Error("The SMTP host must resolve to a public address.");
  return addresses[0]!.address;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);
const noBreaks = (name: string, value: string) => {
  if (/[\r\n]/.test(value)) throw new Error(`${name} must not contain a line break.`); // header injection (AC-44)
};

export type Outgoing = { id: string; to: string; subject: string; text: string; attachments?: { filename: string; content: Buffer; contentType: string }[] };

/** One message over STARTTLS (required unless the server is on this machine). Resolves with the provider's message id; rejects on any SMTP error. */
export async function sendMail(smtp: Smtp, msg: Outgoing): Promise<{ messageId: string }> {
  for (const [name, value] of [["to", msg.to], ["subject", msg.subject], ["from name", smtp.fromName ?? ""], ["from", smtp.fromEmail]] as const) noBreaks(name, value);
  const config = parseConfig(process.env);
  if (smtp.username && (!config.SMTP_PASSWORD || config.SMTP_PASSWORD_HOST?.toLowerCase() !== smtp.host.toLowerCase())) {
    throw new Error("No SMTP credentials are configured for this host.");
  }
  const address = await resolveSmtpHost(smtp.host, smtp.port, config.ALLOW_PRIVATE_SMTP);
  const transport = nodemailer.createTransport({
    host: address, port: smtp.port, secure: smtp.port === 465, requireTLS: smtp.port !== 465 && !LOOPBACK.has(smtp.host),
    tls: { servername: smtp.host }, // verify the certificate against the name, though we connect to the checked address
    auth: smtp.username ? { user: smtp.username, pass: config.SMTP_PASSWORD! } : undefined,
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
