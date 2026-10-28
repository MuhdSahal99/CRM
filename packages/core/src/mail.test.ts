import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isPrivateAddress, messageIdFor, resolveSmtpHost, sendMail } from "./mail.ts";

const smtp = { host: "127.0.0.1", port: 1, username: null, fromEmail: "a@b.test", fromName: null };
const base = { id: "1", to: "x@y.test", subject: "hi", text: "t" };

describe("message ids and header safety", () => {
  it("derives the Message-ID from the email_sends id", () => {
    expect(messageIdFor("0198-abc", "sales@saqient.test")).toBe("<0198-abc@saqient.test>");
  });
  it("refuses a line break in the subject, the recipient or the sender name (AC-44)", async () => {
    await expect(sendMail(smtp, { ...base, subject: "hi\r\nBcc: evil@y.test" })).rejects.toThrow(/line break/);
    await expect(sendMail(smtp, { ...base, to: "x@y.test\r\nBcc: e@y.test" })).rejects.toThrow(/line break/);
    await expect(sendMail({ ...smtp, fromName: "A\nBcc: e@y.test" }, base)).rejects.toThrow(/line break/);
  });
});

describe("an org-chosen SMTP destination is untrusted", () => {
  it("classifies loopback, private, link-local, CGNAT, multicast and mapped addresses as private", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "198.18.0.1", "192.0.0.8", "203.0.113.5", "::1", "::", "fd00::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::7f00:1", "2002:7f00:1::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "2001:db8::1", "not an ip"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
  it("refuses a private destination or a non-mail port, and returns the checked address for a public one", async () => {
    await expect(resolveSmtpHost("169.254.169.254", 587, false)).rejects.toThrow(/public address/);
    await expect(resolveSmtpHost("127.0.0.1", 25, false)).rejects.toThrow(/public address/);
    await expect(resolveSmtpHost("93.184.216.34", 6379, false)).rejects.toThrow(/port 6379/);
    expect(await resolveSmtpHost("93.184.216.34", 587, false)).toBe("93.184.216.34");
  });
  it("uses the shared account only for its own host and its verified sender domains, and never an org-chosen username", async () => {
    const saved = { ...process.env };
    Object.assign(process.env, { SMTP_USERNAME: "relay", SMTP_PASSWORD: "global-secret", SMTP_PASSWORD_HOST: "smtp.operator.test", SMTP_FROM_DOMAINS: "saqient.test", ALLOW_PRIVATE_SMTP: "false" });
    const authed = { ...smtp, port: 587, username: "anything-the-org-typed" };
    try {
      await expect(sendMail({ ...authed, host: "attacker.example" }, base)).rejects.toThrow(/No SMTP credentials/);
      await expect(sendMail({ ...authed, host: "smtp.operator.test", fromEmail: "ceo@victim.example" }, base)).rejects.toThrow(/sender domain/);
    } finally {
      process.env = saved;
    }
  });
});

// T9.01 (US-13): needs Mailpit (docker compose service `mailpit`; MAILPIT_URL and MAILPIT_SMTP_PORT point at it): skipped without it.
describe.skipIf(!process.env.MAILPIT_URL)("sending through Mailpit (T9.01)", () => {
  const previous = process.env.ALLOW_PRIVATE_SMTP;
  beforeAll(() => void (process.env.ALLOW_PRIVATE_SMTP = "true")); // TEMP-DEV: smtp-private-hosts
  afterAll(() => void (previous === undefined ? delete process.env.ALLOW_PRIVATE_SMTP : (process.env.ALLOW_PRIVATE_SMTP = previous)));

  it("delivers with the attachment and a Message-ID from the email_sends id", async () => {
    const id = crypto.randomUUID();
    const subject = `T9.01 ${id}`;
    const target = { host: "127.0.0.1", port: Number(process.env.MAILPIT_SMTP_PORT ?? 1025), username: null, fromEmail: "sales@saqient.test", fromName: "Saqient Sales" };
    await sendMail(target, { id, to: "buyer@example.test", subject, text: "Please find the quote attached.", attachments: [{ filename: "Q-1.pdf", content: Buffer.from("%PDF-1.4 x"), contentType: "application/pdf" }] });
    const list = (await (await fetch(`${process.env.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`subject:"${subject}"`)}`)).json()) as { messages: { ID: string }[] };
    expect(list.messages).toHaveLength(1);
    const message = (await (await fetch(`${process.env.MAILPIT_URL}/api/v1/message/${list.messages[0]!.ID}`)).json()) as { MessageID: string; From: { Address: string }; To: { Address: string }[]; Attachments: unknown[] };
    expect(message.MessageID).toBe(id + "@saqient.test");
    expect(message.From.Address).toBe("sales@saqient.test");
    expect(message.To[0]!.Address).toBe("buyer@example.test");
    expect(message.Attachments).toMatchObject([{ FileName: "Q-1.pdf", ContentType: "application/pdf" }]);
  });
});
