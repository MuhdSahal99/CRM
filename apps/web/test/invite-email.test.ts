import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as usersRoute from "../app/api/v1/users/route";
import { call, createSignInUser, signIn } from "./api.ts";

// T9.04 (US-03, US-13): an invitation is emailed to the invitee after it commits. Needs Mailpit (MAILPIT_URL, MAILPIT_SMTP_PORT): skipped without it.
describe.skipIf(!process.env.MAILPIT_URL)("invitation emails (T9.04)", () => {
  let auth: Awaited<ReturnType<typeof connectAsAuth>>;
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let ctx: { org_id: string; user_id: string; role: string };
  let admin: string;
  const previous = process.env.ALLOW_PRIVATE_SMTP;

  beforeAll(async () => {
    process.env.ALLOW_PRIVATE_SMTP = "true"; // TEMP-DEV: smtp-private-hosts
    [auth, app] = await Promise.all([connectAsAuth(), connectAsApp()]);
    const org = (await auth.query("SELECT id FROM orgs WHERE slug = 'demo'")).rows[0].id;
    const user = await createSignInUser(auth, org, "admin");
    ctx = { org_id: org, user_id: user.id, role: "admin" };
    admin = await signIn(user.email);
  });
  afterAll(async () => {
    await queryAs(app, ctx, "UPDATE org_settings SET smtp_host = NULL, smtp_port = NULL, smtp_from_email = NULL");
    if (previous === undefined) delete process.env.ALLOW_PRIVATE_SMTP;
    else process.env.ALLOW_PRIVATE_SMTP = previous;
    await Promise.all([auth?.end(), app?.end()]);
  });

  const invite = (email: string) => call(usersRoute, "POST", "/users", { cookie: admin, body: { data: [{ email, name: "New Hire", role: "rep" }] } });
  async function mailTo(email: string) {
    for (let i = 0; i < 50; i++) {
      const found = (await (await fetch(`${process.env.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json()) as { messages: { ID: string }[] };
      if (found.messages[0]) return (await (await fetch(`${process.env.MAILPIT_URL}/api/v1/message/${found.messages[0].ID}`)).json()) as { Text: string; Subject: string };
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return null;
  }

  it("emails the accept link to the invitee, and still returns it to the Admin", async () => {
    await queryAs(app, ctx, "UPDATE org_settings SET smtp_host = '127.0.0.1', smtp_port = $1, smtp_from_email = 'hr@saqient.test'", [Number(process.env.MAILPIT_SMTP_PORT ?? 1025)]);
    const email = `hire-${crypto.randomUUID().slice(0, 8)}@example.test`;
    const res = await invite(email);
    expect(res.status, res.body).toBe(201);
    const url = res.json().data[0].details.accept_url as string;
    expect(url).toMatch(/\/accept-invite\/[A-Za-z0-9_-]{40,}$/);
    const mail = await mailTo(email);
    expect(mail?.Text).toContain(url);
  });

  it("with no SMTP settings the invitation still succeeds and nothing is sent", async () => {
    await queryAs(app, ctx, "UPDATE org_settings SET smtp_host = NULL");
    const email = `nomail-${crypto.randomUUID().slice(0, 8)}@example.test`;
    expect((await invite(email)).status).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const found = (await (await fetch(`${process.env.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json()) as { messages: unknown[] };
    expect(found.messages).toHaveLength(0);
  });
});
