import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as recordRoute from "../app/api/v1/[module]/[id]/route";
import * as moduleRoute from "../app/api/v1/[module]/route";
import { call, signIn } from "./api.ts";

// T2.03: generic create/read through the module registry. Cross-org ids are covered by the visibility matrix.
describe("records API: create and read (T2.03)", () => {
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let repA: string;
  const ids: Record<string, string> = {};
  let saqient: string;

  beforeAll(async () => {
    const auth = await connectAsAuth();
    const { rows } = await auth.query(`SELECT u.email, u.id, m.org_id FROM "user" u JOIN member m ON m.user_id = u.id`);
    await auth.end();
    for (const r of rows) ids[r.email] = r.id;
    saqient = rows.find((r) => r.email === "admin@saqient.test")!.org_id;
    app = await connectAsApp();
    repA = await signIn("rep.a@saqient.test");
  });
  afterAll(() => app?.end());

  const create = (record: Record<string, unknown>, module = "Accounts") =>
    call(moduleRoute, "POST", `/${module}`, { cookie: repA, params: { module }, body: { data: [record] } });
  const get = (id: string, module = "Accounts") => call(recordRoute, "GET", `/${module}/${id}`, { cookie: repA, params: { module, id } });

  it("a missing Account_Name is a 422 on that field", async () => {
    const res = await create({ Phone: "24000000" });
    expect(res.status).toBe(422);
    expect(res.json()).toMatchObject({ code: "INVALID_DATA", details: { api_name: "Account_Name" } });
  });

  it("AC-22: an Owner from another org is a 422 on Owner, and nothing is written", async () => {
    const res = await create({ Account_Name: "Foreign Owner LLC", Owner: { id: ids["admin@demo.test"] } });
    expect(res.status).toBe(422);
    expect(res.json()).toMatchObject({ details: { api_name: "Owner" } });
    const rows = await queryAs(app, { org_id: saqient }, "SELECT 1 FROM accounts WHERE account_name = 'Foreign Owner LLC'");
    expect(rows).toEqual([]);
  });

  it("creates an account owned by the caller, writes a created event, and reads it back as data:[record]", async () => {
    const res = await create({ Account_Name: "Muscat Trading", Industry: "Retail", Annual_Revenue: "1200.500" });
    expect(res.status).toBe(201);
    const [outcome] = res.json().data;
    expect(outcome).toMatchObject({ code: "SUCCESS", status: "success", details: { id: expect.any(String), version: 1 } });
    const id = outcome.details.id;

    const events = await queryAs(app, { org_id: saqient, role: "admin", see_all: "on" },
      "SELECT event_type, actor_id FROM timeline_events WHERE record_type = 'account' AND record_id = $1", [id]);
    expect(events).toEqual([{ event_type: "created", actor_id: ids["rep.a@saqient.test"] }]);

    const read = await get(id);
    expect(read.status).toBe(200);
    const { data } = read.json();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      id,
      version: 1,
      Account_Name: "Muscat Trading",
      Industry: "Retail",
      Annual_Revenue: "1200.500",
      Parent_Account: null,
      Owner: { id: ids["rep.a@saqient.test"], name: "Rep A" },
      Created_By: { id: ids["rep.a@saqient.test"], name: "Rep A" },
      Created_Time: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
    });
  });

  it("a picklist value that is not in the metadata is refused", async () => {
    expect((await create({ Account_Name: "X", Industry: "Space Mining" })).json()).toMatchObject({ details: { api_name: "Industry" } });
  });

  it("a module without a registry entry, or no module at all, is a 404", async () => {
    expect((await create({ Deal_Name: "x" }, "Deals")).status).toBe(404);
    expect((await get(crypto.randomUUID(), "Nope")).status).toBe(404);
  });
});
