import { describe, expect, it } from "vitest";
import { messageIdFor, sendMail } from "./mail.ts";

// T9.01 (US-13): needs Mailpit (docker compose service `mailpit`; MAILPIT_URL and MAILPIT_SMTP_PORT point at it): skipped without it.
describe("message ids and header safety", () => {
  it("derives the Message-ID from the email_sends id", () => {
    expect(messageIdFor("0198-abc", "sales@saqient.test")).toBe("<0198-abc@saqient.test>");
  });
  it("refuses a line break in the subject or the recipient (AC-44)", async () => {
    const smtp = { host: "127.0.0.1", port: 1, username: null, fromEmail: "a@b.test", fromName: null };
    await expect(sendMail(smtp, { id: "1", to: "x@y.test", subject: "hi\r\nBcc: evil@y.test", text: "t" })).rejects.toThrow(/line break/);
    await expect(sendMail(smtp, { id: "1", to: "x@y.test\r\nBcc: e@y.test", subject: "hi", text: "t" })).rejects.toThrow(/line break/);
    await expect(sendMail({ ...smtp, fromName: "A\nBcc: e@y.test" }, { id: "1", to: "x@y.test", subject: "hi", text: "t" })).rejects.toThrow(/line break/);
  });
});

describe.skipIf(!process.env.MAILPIT_URL)("sending through Mailpit (T9.01)", () => {
  it("delivers with the attachment and a Message-ID from the email_sends id", async () => {
    const id = crypto.randomUUID();
    const subject = `T9.01 ${id}`;
    const smtp = { host: "127.0.0.1", port: Number(process.env.MAILPIT_SMTP_PORT ?? 1025), username: null, fromEmail: "sales@saqient.test", fromName: "Saqient Sales" };
    await sendMail(smtp, { id, to: "buyer@example.test", subject, text: "Please find the quote attached.", attachments: [{ filename: "Q-1.pdf", content: Buffer.from("%PDF-1.4 x"), contentType: "application/pdf" }] });
    const list = (await (await fetch(`${process.env.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`subject:"${subject}"`)}`)).json()) as { messages: { ID: string }[] };
    expect(list.messages).toHaveLength(1);
    const message = (await (await fetch(`${process.env.MAILPIT_URL}/api/v1/message/${list.messages[0]!.ID}`)).json()) as { MessageID: string; From: { Address: string }; To: { Address: string }[]; Attachments: unknown[] };
    expect(message.MessageID).toBe(id + "@saqient.test");
    expect(message.From.Address).toBe("sales@saqient.test");
    expect(message.To[0]!.Address).toBe("buyer@example.test");
    expect(message.Attachments).toMatchObject([{ FileName: "Q-1.pdf", ContentType: "application/pdf" }]);
  });
});
