import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as recordRoute from "../app/api/v1/[module]/[id]/route";
import * as moduleRoute from "../app/api/v1/[module]/route";
import { call, signIn } from "./api.ts";

// T4.01 (US-04): Leads through the module registry. Cross-org ids are covered by the visibility matrix.
describe("Leads API (T4.01)", () => {
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let repA: string;
  let repB: string;
  let saqient: string;
  let adminId: string;

  beforeAll(async () => {
    const auth = await connectAsAuth();
    const { rows } = await auth.query(`SELECT u.id, m.org_id FROM "user" u JOIN member m ON m.user_id = u.id WHERE u.email = 'admin@saqient.test'`);
    await auth.end();
    [adminId, saqient] = [rows[0].id, rows[0].org_id];
    app = await connectAsApp();
    [repA, repB] = [await signIn("rep.a@saqient.test"), await signIn("rep.b@saqient.test")];
  });
  afterAll(() => app?.end());

  const create = (cookie: string, record: Record<string, unknown>) => call(moduleRoute, "POST", "/Leads", { cookie, params: { module: "Leads" }, body: { data: [record] } });
  const get = (cookie: string, id: string) => call(recordRoute, "GET", `/Leads/${id}`, { cookie, params: { module: "Leads", id } });
  const list = (cookie: string) => call(moduleRoute, "GET", "/Leads", { cookie, params: { module: "Leads" } });

  it("US-04: a missing Last_Name and Company is a 422 with an error on each field", async () => {
    const res = await create(repA, { First_Name: "Nobody" });
    expect(res.status).toBe(422);
    const fields = res.json().details.errors.map((e: { api_name: string }) => e.api_name);
    expect(fields).toEqual(expect.arrayContaining(["Last_Name", "Company"]));
  });

  it("creates a lead, normalises the mobile by Country, and rep B gets 404 on rep A's lead", async () => {
    const res = await create(repA, { Last_Name: "Hinai", Company: "Hinai Trading", Mobile: "91234567", Country: "OM", Lead_Status: "Not Contacted" });
    expect(res.status).toBe(201);
    const id = res.json().data[0].details.id;
    expect((await get(repA, id)).json().data[0]).toMatchObject({ Last_Name: "Hinai", Company: "Hinai Trading", Mobile: "+96891234567", Lead_Status: "Not Contacted" });
    expect((await get(repB, id)).status).toBe(404);
    expect((await list(repB)).json().data.map((l: { id: string }) => l.id)).not.toContain(id);
    expect((await list(repA)).json().data.map((l: { id: string }) => l.id)).toContain(id);
  });

  it("lists exclude converted leads by default, a converted lead can still be read, and direct SQL cannot edit it", async () => {
    const id = (await create(repA, { Last_Name: "Done", Company: "Done LLC" })).json().data[0].details.id;
    const admin = { org_id: saqient, user_id: adminId, role: "admin", see_all: "on" };
    await queryAs(app, admin, "UPDATE leads SET is_converted = true, converted_at = now() WHERE id = $1", [id]);
    expect((await list(repA)).json().data.map((l: { id: string }) => l.id)).not.toContain(id);
    expect((await get(repA, id)).status).toBe(200);
    await expect(queryAs(app, admin, "UPDATE leads SET company = 'X' WHERE id = $1", [id])).rejects.toThrow(/converted lead cannot be changed/);
  });

  it("T4.02: a converted lead appears only in the converted view, which is Leads-only", async () => {
    const id = (await create(repA, { Last_Name: "Gone", Company: "Gone LLC" })).json().data[0].details.id;
    const view = async (module: string, cvid: string) => call(moduleRoute, "GET", `/${module}?cvid=${cvid}`, { cookie: repA, params: { module } });
    const ids = async (cvid: string) => (await view("Leads", cvid)).json().data.map((l: { id: string }) => l.id);
    expect(await ids("converted")).not.toContain(id);
    await queryAs(app, { org_id: saqient, user_id: adminId, role: "admin", see_all: "on" }, "UPDATE leads SET is_converted = true, converted_at = now() WHERE id = $1", [id]);
    expect(await ids("converted")).toContain(id);
    for (const cvid of ["all", "my", "recently_created", "recently_modified"]) expect(await ids(cvid)).not.toContain(id);
    expect((await view("Accounts", "converted")).status).toBe(422);
  });
});
