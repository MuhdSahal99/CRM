import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as userRoute from "../app/api/v1/users/[id]/route";
import * as usersRoute from "../app/api/v1/users/route";
import { call, signIn } from "./api.ts";

// T1.20 (US-03): list, invite, read and update users. Cross-org ids are covered by the visibility matrix.
describe("users API (T1.20)", () => {
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let auth: Awaited<ReturnType<typeof connectAsAuth>>;
  let admin: string;
  let rep: string;
  const ids: Record<string, string> = {};
  let saqient: string;

  beforeAll(async () => {
    [app, auth] = await Promise.all([connectAsApp(), connectAsAuth()]);
    const { rows } = await auth.query(`SELECT u.email, u.id, m.org_id FROM "user" u JOIN member m ON m.user_id = u.id`);
    for (const r of rows) ids[r.email] = r.id;
    saqient = rows.find((r) => r.email === "admin@saqient.test")!.org_id;
    [admin, rep] = [await signIn("admin@saqient.test"), await signIn("rep.a@saqient.test")];
  });
  afterAll(() => Promise.all([app?.end(), auth?.end()]));

  const invite = (cookie: string, person: Record<string, unknown>) => call(usersRoute, "POST", "/users", { cookie, body: { data: [person] } });
  const put = (id: string, change: Record<string, unknown>) => call(userRoute, "PUT", `/users/${id}`, { cookie: admin, params: { id }, body: { data: [change] } });

  it("AC-35: a rep cannot invite (403), but can list their org's users", async () => {
    expect((await invite(rep, { email: "x@example.test", name: "X", role: "rep" })).status).toBe(403);
    const list = await call(usersRoute, "GET", "/users?status=active", { cookie: rep });
    expect(list.status).toBe(200);
    const emails = list.json().data.map((u: { email: string }) => u.email);
    expect(emails).toContain("rep.b@saqient.test");
    expect(emails).not.toContain("admin@demo.test");
    expect(list.json().data.find((u: { email: string }) => u.email === "rep.a@saqient.test")).toMatchObject({
      role: "rep",
      status: "active",
      manager: { id: ids["manager@saqient.test"], name: "Sales Manager" },
    });
  });

  it("an admin invite creates a pending invitation and returns its accept link", async () => {
    const res = await invite(admin, { email: "new.rep@saqient.test", name: "New Rep", role: "rep", manager_id: ids["manager@saqient.test"] });
    expect(res.status).toBe(201);
    const [outcome] = res.json().data;
    expect(outcome).toMatchObject({ code: "SUCCESS", details: { accept_url: expect.stringMatching(/^http:\/\/localhost:3000\/accept-invite\/[A-Za-z0-9_-]{43}$/) } });
    const { rows } = await auth.query("SELECT org_id, email, role, status, manager_id FROM invitation WHERE id = $1", [outcome.details.id]);
    expect(rows[0]).toEqual({ org_id: saqient, email: "new.rep@saqient.test", role: "rep", status: "pending", manager_id: ids["manager@saqient.test"] });
    const list = await call(usersRoute, "GET", "/users", { cookie: admin });
    expect(list.json().data).toContainEqual(expect.objectContaining({ email: "new.rep@saqient.test", status: "invited" }));
    // Pending invitations are admin-only.
    const rep = await signIn("rep.a@saqient.test");
    const asRep = await call(usersRoute, "GET", "/users", { cookie: rep });
    expect(asRep.json().data.filter((u: { status: string }) => u.status === "invited")).toEqual([]);
  });

  it("T2.02: an invite retried with the same Idempotency-Key replays the first answer", async () => {
    const send = (name: string) =>
      call(usersRoute, "POST", "/users", { cookie: admin, headers: { "idempotency-key": "invite-retry-0001" }, body: { data: [{ email: "retry@saqient.test", name, role: "rep" }] } });
    const first = await send("Retry");
    const again = await send("Retry");
    expect(first.status).toBe(201);
    expect(again).toMatchObject({ status: 201, body: first.body });
    expect((await send("Changed")).json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("an invite for an existing member's email or with a foreign manager is refused per person", async () => {
    expect((await invite(admin, { email: "rep.b@saqient.test", name: "B", role: "rep" })).json().data[0].code).toBe("DUPLICATE_DATA");
    expect((await invite(admin, { email: "y@saqient.test", name: "Y", role: "rep", manager_id: ids["admin@demo.test"] })).json().data[0].code).toBe("INVALID_DATA");
  });

  it("changing a role or manager writes role_changed; a cycle is a 422", async () => {
    const repB = ids["rep.b@saqient.test"]!;
    expect((await put(repB, { role: "manager", manager_id: null })).status).toBe(200);
    expect((await call(userRoute, "GET", `/users/${repB}`, { cookie: rep, params: { id: repB } })).json().data[0]).toMatchObject({ role: "manager", manager: null });
    const events = await queryAs(app, { org_id: saqient, user_id: ids["admin@saqient.test"]!, role: "admin" },
      "SELECT actor_id, changes FROM timeline_events WHERE record_id = $1 AND event_type = 'role_changed'", [repB]);
    expect(events).toEqual([{ actor_id: ids["admin@saqient.test"], changes: { role: ["rep", "manager"], manager_id: [ids["manager@saqient.test"], null] } }]);

    // Rep B reports to the manager again; making the manager report to rep B would close a loop.
    await put(repB, { manager_id: ids["manager@saqient.test"] });
    const loop = await put(ids["manager@saqient.test"]!, { manager_id: repB });
    expect(loop.status).toBe(422);
    expect(loop.json()).toMatchObject({ details: { api_name: "manager_id" } });
    await put(repB, { role: "rep" }); // leave the seed as it was for other files
  });

  it("an admin cannot change their own role (409), so the org keeps its admin", async () => {
    const self = ids["admin@saqient.test"]!;
    expect((await put(self, { role: "rep" })).status).toBe(409);
    expect((await put(self, { manager_id: null })).status).toBe(200); // other changes to yourself are fine
  });

  it("a second invite for a pending invitation's email is refused", async () => {
    const email = `twice-${crypto.randomUUID()}@saqient.test`;
    expect((await invite(admin, { email, name: "Twice", role: "rep" })).json().data[0].code).toBe("SUCCESS");
    expect((await invite(admin, { email, name: "Twice", role: "admin" })).json().data[0].code).toBe("DUPLICATE_DATA");
  });

  it("a rep cannot change roles (403)", async () => {
    const id = ids["rep.a@saqient.test"]!;
    expect((await call(userRoute, "PUT", `/users/${id}`, { cookie: rep, params: { id }, body: { data: [{ role: "admin" }] } })).status).toBe(403);
  });
});
