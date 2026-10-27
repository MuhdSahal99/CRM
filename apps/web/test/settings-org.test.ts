import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as orgRoute from "../app/api/v1/settings/org/route";
import { call, createSignInUser, signIn } from "./api.ts";

// T6.01: org settings. A fresh admin in the seeded org changes it, so the seeded users are untouched.
describe("org settings (T6.01)", () => {
  let auth: Awaited<ReturnType<typeof connectAsAuth>>;
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let ctx: { org_id: string; user_id: string; role: string };
  let admin: string;
  let rep: string;

  beforeAll(async () => {
    auth = await connectAsAuth();
    const { rows } = await auth.query("SELECT id FROM orgs WHERE slug = 'demo'");
    app = await connectAsApp();
    const user = await createSignInUser(auth, rows[0].id, "admin");
    ctx = { org_id: rows[0].id, user_id: user.id, role: "admin" };
    admin = await signIn(user.email);
    rep = await signIn((await createSignInUser(auth, rows[0].id, "rep")).email);
  });
  afterAll(() => Promise.all([auth?.end(), app?.end()]));

  it("AC-35: a rep cannot update the settings (403); a rep can read them", async () => {
    expect((await call(orgRoute, "PUT", "/settings/org", { cookie: rep, body: { data: [{ vat_number: "OM1", version: 1 }] } })).status).toBe(403);
    expect((await call(orgRoute, "GET", "/settings/org", { cookie: rep })).status).toBe(200);
  });

  it("the seller VAT number round-trips, a stale version is 409, and a change is logged", async () => {
    const before = (await call(orgRoute, "GET", "/settings/org", { cookie: admin })).json().data[0];
    const put = await call(orgRoute, "PUT", "/settings/org", { cookie: admin, body: { data: [{ vat_number: "OM1100123456", smtp_host: "smtp.example.test", version: before.version }] } });
    expect(put.status).toBe(200);
    const after = (await call(orgRoute, "GET", "/settings/org", { cookie: admin })).json().data[0];
    expect(after).toMatchObject({ vat_number: "OM1100123456", smtp_host: "smtp.example.test", version: before.version + 1 });
    const stale = await call(orgRoute, "PUT", "/settings/org", { cookie: admin, body: { data: [{ vat_number: "X", version: before.version }] } });
    expect(stale.status).toBe(409);
    const rows = await queryAs(app, ctx, "SELECT changes FROM timeline_events WHERE record_type = 'org' AND event_type = 'updated' AND changes ? 'vat_number' ORDER BY occurred_at DESC LIMIT 1");
    expect(rows[0].changes.vat_number).toEqual([null, "OM1100123456"]);
  });

  it("AC-46: the response carries no password or secret reference, only whether one is set", async () => {
    await queryAs(app, ctx, "UPDATE org_settings SET smtp_secret_ref = 'arn:aws:secretsmanager:x'");
    const res = await call(orgRoute, "GET", "/settings/org", { cookie: admin });
    expect(res.body).not.toMatch(/password|arn:aws|smtp_secret_ref/);
    expect(res.json().data[0]).toHaveProperty("smtp_secret_configured");
  });
});
