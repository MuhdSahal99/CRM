import { lookup } from "node:dns/promises";
import net from "node:net";
import { sql } from "drizzle-orm";
import nodemailer from "nodemailer";
import { parseConfig } from "./config.ts";
import type { Tx } from "./tenant.ts";

// T9.01 (US-13): the org's SMTP settings and one send. nodemailer is only used here. OQ-09 (provider, domain, SPF/DKIM) blocks the prod config.
// The host and port are chosen by an org Admin, so they are untrusted: the destination must resolve to public addresses on a mail port, and
// the shared SMTP account (SMTP_USERNAME/SMTP_PASSWORD) goes only to SMTP_PASSWORD_HOST and only for senders in SMTP_FROM_DOMAINS. shortcut: a per-org password from org_settings.smtp_secret_ref (Secrets Manager) comes
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

const subnets = (family: "ipv4" | "ipv6", list: [string, number][]) => {
  const out = new net.BlockList();
  for (const [address, prefix] of list) out.addSubnet(address, prefix, family);
  return out;
};
// IANA special-purpose blocks: nowhere a tenant may make the server connect (loopback, private, link-local, CGNAT, benchmarking, documentation, multicast, reserved).
const V4_DENIED = subnets("ipv4", [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3]]);
// IPv6 is an allow-list: global unicast 2000::/3 only, minus the ranges that embed or tunnel an IPv4 address (Teredo, 6to4) or are for documentation.
// That leaves out ::1, ::, fc00::/7, fe80::/10, ff00::/8, IPv4-mapped (::ffff:), NAT64 (64:ff9b::) and every other embedding form.
const V6_GLOBAL = subnets("ipv6", [["2000::", 3]]);
const V6_DENIED = subnets("ipv6", [["2001::", 32], ["2001:db8::", 32], ["2001:10::", 28], ["2002::", 16], ["3fff::", 20]]);

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return V4_DENIED.check(ip, "ipv4");
  if (net.isIPv6(ip)) return !V6_GLOBAL.check(ip, "ipv6") || V6_DENIED.check(ip, "ipv6");
  return true; // not an address at all
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
  // Authentication means the shared account, and only for its own host and verified sender domains: an org's smtp_username is just the request for it.
  let auth: { user: string; pass: string } | undefined;
  if (smtp.username) {
    if (!config.SMTP_USERNAME || !config.SMTP_PASSWORD || config.SMTP_PASSWORD_HOST?.toLowerCase() !== smtp.host.toLowerCase()) throw new Error("No SMTP credentials are configured for this host.");
    const verified = (config.SMTP_FROM_DOMAINS ?? "").toLowerCase().split(",").map((d) => d.trim());
    if (!verified.includes(smtp.fromEmail.split("@")[1]!.toLowerCase())) throw new Error("The sender domain is not verified for the shared SMTP account.");
    auth = { user: config.SMTP_USERNAME, pass: config.SMTP_PASSWORD };
  }
  const address = await resolveSmtpHost(smtp.host, smtp.port, config.ALLOW_PRIVATE_SMTP);
  const transport = nodemailer.createTransport({
    host: address, port: smtp.port, secure: smtp.port === 465, requireTLS: smtp.port !== 465 && !LOOPBACK.has(smtp.host),
    tls: { servername: smtp.host }, // verify the certificate against the name, though we connect to the checked address
    auth,
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
