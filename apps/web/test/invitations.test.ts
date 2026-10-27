import { acceptInvitation, getAuthDb, getInvitation, hashInviteToken, newInviteToken } from "@crm/core";
import { connectAsApp, connectAsAuth } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as usersRoute from "../app/api/v1/users/route";
import { call, signIn } from "./api.ts";

// Carry-over (slice 3 review): the accept secret is a random single-use token; the invitation id alone accepts nothing.
describe("invitation accept token", () => {
  let auth: Awaited<ReturnType<typeof connectAsAuth>>;
  let admin: string;
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  const input = { name: "Invited", password: "a-long-enough-password" };

  beforeAll(async () => {
    [app, auth] = await Promise.all([connectAsApp(), connectAsAuth()]);
    admin = await signIn("admin@saqient.test");
  });
  afterAll(() => Promise.all([app?.end(), auth?.end()]));

  async function invite() {
    const email = `tok-${crypto.randomUUID().slice(0, 8)}@example.test`;
    const res = await call(usersRoute, "POST", "/users", { cookie: admin, body: { data: [{ email, name: "T", role: "rep" }] } });
    const { id, accept_url } = res.json().data[0].details;
    return { id: id as string, email, token: accept_url.split("/").pop() as string };
  }

  it("stores only the SHA-256 of a 256-bit token, never the token or the id", async () => {
    const { id, token } = await invite();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { rows } = await auth.query("SELECT token_hash FROM invitation WHERE id = $1", [id]);
    expect(rows[0].token_hash).toBe(hashInviteToken(token));
    expect(rows[0].token_hash).not.toContain(token);
  });

  it("the invitation id alone cannot accept or even open the invitation", async () => {
    const { id, email } = await invite();
    expect(await getInvitation(getAuthDb(), id)).toBeNull();
    expect(await acceptInvitation(getAuthDb(), id, input)).toEqual({ ok: false, reason: "gone" });
    expect((await auth.query(`SELECT 1 FROM "user" WHERE email = $1`, [email])).rows).toHaveLength(0);
  });

  it("the token accepts once: creates user and membership, then a reuse is gone", async () => {
    const { id, email, token } = await invite();
    expect(await getInvitation(getAuthDb(), token)).toMatchObject({ email });
    expect(await acceptInvitation(getAuthDb(), token, input)).toEqual({ ok: true, email });
    const { rows } = await auth.query(`SELECT m.role, i.status FROM "user" u JOIN member m ON m.user_id = u.id, invitation i WHERE u.email = $1 AND i.id = $2`, [email, id]);
    expect(rows).toEqual([{ role: "rep", status: "accepted" }]);
    expect(await acceptInvitation(getAuthDb(), token, input)).toEqual({ ok: false, reason: "gone" });
    expect(await getInvitation(getAuthDb(), token)).toBeNull();
  });

  it("an expired, unknown or malformed token cannot accept", async () => {
    const { id, token } = await invite();
    await auth.query("UPDATE invitation SET expires_at = now() - interval '1 second' WHERE id = $1", [id]);
    expect(await acceptInvitation(getAuthDb(), token, input)).toEqual({ ok: false, reason: "gone" });
    expect(await acceptInvitation(getAuthDb(), newInviteToken(), input)).toEqual({ ok: false, reason: "gone" });
    expect(await acceptInvitation(getAuthDb(), "short", input)).toEqual({ ok: false, reason: "gone" });
  });
});
