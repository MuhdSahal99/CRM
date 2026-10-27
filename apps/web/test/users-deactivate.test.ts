import { connectAsApp, connectAsAuth, queryAs, TEST_SEED_PASSWORD } from "@crm/db/testing";
import { getAuth } from "@crm/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as deactivateRoute from "../app/api/v1/users/[id]/actions/deactivate/route";
import * as usersRoute from "../app/api/v1/users/route";
import { call, createSignInUser, signIn } from "./api.ts";
import { BASE } from "./env.ts";

// T1.21 (US-01, US-03): deactivation bans, revokes sessions, marks the membership and logs it; nothing else changes.
describe("deactivate a user (T1.21)", () => {
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let auth: Awaited<ReturnType<typeof connectAsAuth>>;
  let admin: string;
  let adminId: string;
  let saqient: string;

  const deactivate = (id: string, cookie = admin) => call(deactivateRoute, "POST", `/users/${id}/actions/deactivate`, { cookie, params: { id }, body: {} });

  beforeAll(async () => {
    [app, auth] = await Promise.all([connectAsApp(), connectAsAuth()]);
    const { rows } = await auth.query(`SELECT m.user_id, m.org_id FROM member m JOIN "user" u ON u.id = m.user_id WHERE u.email = 'admin@saqient.test'`);
    [adminId, saqient] = [rows[0].user_id, rows[0].org_id];
    admin = await signIn("admin@saqient.test");
  });
  afterAll(() => Promise.all([app?.end(), auth?.end()]));

  it("bans the user, revokes their sessions, sets the membership deactivated and logs user_deactivated", async () => {
    const leaver = await createSignInUser(auth, saqient);
    const leaverCookie = await signIn(leaver.email);
    const { rows: before } = await auth.query("SELECT role, manager_id, created_at FROM member WHERE user_id = $1", [leaver.id]);

    expect((await deactivate(leaver.id)).status).toBe(200);

    const { rows: [user] } = await auth.query(`SELECT banned FROM "user" WHERE id = $1`, [leaver.id]);
    const { rows: sessions } = await auth.query("SELECT 1 FROM session WHERE user_id = $1", [leaver.id]);
    const { rows: after } = await auth.query("SELECT role, manager_id, created_at, status FROM member WHERE user_id = $1", [leaver.id]);
    expect(user.banned).toBe(true);
    expect(sessions).toEqual([]);
    expect(after).toEqual([{ ...before[0], status: "deactivated" }]); // nothing else about them changes (US-01)
    const events = await queryAs(app, { org_id: saqient, user_id: adminId, role: "admin" },
      "SELECT actor_id FROM timeline_events WHERE record_id = $1 AND event_type = 'user_deactivated'", [leaver.id]);
    expect(events).toEqual([{ actor_id: adminId }]);

    // The old cookie stops working at once, and a new sign-in is refused.
    expect((await call(usersRoute, "GET", "/users", { cookie: leaverCookie })).status).toBe(401);
    const retry = await getAuth().handler(new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": "10.21.0.1" },
      body: JSON.stringify({ email: leaver.email, password: TEST_SEED_PASSWORD }),
    }));
    expect(retry.status).toBe(403);
  });

  it("refuses a second deactivation and deactivating yourself (409)", async () => {
    const leaver = await createSignInUser(auth, saqient);
    await deactivate(leaver.id);
    expect((await deactivate(leaver.id)).status).toBe(409);
    expect((await deactivate(adminId)).status).toBe(409);
  });

  it("is Admin-only (403)", async () => {
    const target = await createSignInUser(auth, saqient);
    expect((await deactivate(target.id, await signIn("manager@saqient.test"))).status).toBe(403);
  });
});
