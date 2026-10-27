import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { beforeAll, describe, expect, it } from "vitest";
import * as recordRoute from "../app/api/v1/[module]/[id]/route";
import * as moduleRoute from "../app/api/v1/[module]/route";
import { call, signIn } from "./api.ts";

// T3.02 (US-15): Tasks, Calls and Meetings are three modules over one table, through the generic routes.
describe("activities API (T3.02)", () => {
  let repA: string;
  let repB: string;
  let manager: string;
  let demoAccount: string;
  let account: string;
  let contact: string;

  const create = (cookie: string, module: string, record: Record<string, unknown>) => call(moduleRoute, "POST", `/${module}`, { cookie, params: { module }, body: { data: [record] } });
  const get = (cookie: string, module: string, id: string) => call(recordRoute, "GET", `/${module}/${id}`, { cookie, params: { module, id } });
  const idOf = (res: { json: () => { data: { details: { id: string } }[] } }) => res.json().data[0]!.details.id;

  beforeAll(async () => {
    const auth = await connectAsAuth();
    const { rows } = await auth.query(`SELECT o.id FROM orgs o WHERE o.slug = 'demo'`);
    await auth.end();
    const app = await connectAsApp();
    [{ id: demoAccount }] = await queryAs(app, { org_id: rows[0].id }, "SELECT id FROM accounts LIMIT 1");
    await app.end();
    [repA, repB, manager] = await Promise.all(["rep.a", "rep.b", "manager"].map((u) => signIn(`${u}@saqient.test`)));
    account = idOf(await create(repA, "Accounts", { Account_Name: "Activity Holder LLC" }));
    contact = idOf(await create(repA, "Contacts", { Last_Name: "Linked", Account_Name: { id: account } }));
  });

  const samples: [string, Record<string, unknown>][] = [
    ["Tasks", { Subject: "Send quote", Due_Date: "2026-03-01", Status: "Not Started", Priority: "High" }],
    ["Calls", { Subject: "Intro call", Call_Type: "Outbound", Call_Start_Time: "2026-03-01T09:00:00+04:00", Call_Duration_Seconds: 300 }],
    ["Meetings", { Subject: "Kick-off", Start_DateTime: "2026-03-02T10:00:00+04:00", End_DateTime: "2026-03-02T11:00:00+04:00", Venue: "Muscat" }],
  ];

  it.each(samples)("%s: create, read, update and delete", async (module, record) => {
    const linked = { ...record, Who_Id: { id: contact, module: "Contacts" }, What_Id: { id: account, module: "Accounts" } };
    const res = await create(repA, module, linked);
    expect(res.status).toBe(201);
    const id = idOf(res);
    const [read] = (await get(repA, module, id)).json().data;
    expect(read).toMatchObject({ Subject: record.Subject, Who_Id: { id: contact, module: "Contacts", name: "Linked" }, What_Id: { id: account, module: "Accounts", name: "Activity Holder LLC" } });

    const put = await call(recordRoute, "PUT", `/${module}/${id}`, { cookie: repA, params: { module, id }, body: { data: [{ Subject: "Renamed", version: 1 }] } });
    expect(put.status).toBe(200);
    expect((await get(repA, module, id)).json().data[0].Subject).toBe("Renamed");

    expect((await call(recordRoute, "DELETE", `/${module}/${id}`, { cookie: repA, params: { module, id } })).status).toBe(200);
    expect((await get(repA, module, id)).status).toBe(404);
  });

  it("a task keeps its due date as a plain date", async () => {
    const id = idOf(await create(repA, "Tasks", { Subject: "Dated", Due_Date: "2026-03-01" }));
    expect((await get(repA, "Tasks", id)).json().data[0].Due_Date).toBe("2026-03-01");
  });

  it("a call needs Call_Type, Call_Start_Time and Call_Duration_Seconds", async () => {
    for (const missing of ["Call_Type", "Call_Start_Time", "Call_Duration_Seconds"]) {
      const { [missing]: _, ...rest } = samples[1]![1];
      const res = await create(repA, "Calls", rest);
      expect(res.status, missing).toBe(422);
      expect(res.json()).toMatchObject({ details: { api_name: missing } });
    }
    expect((await create(repA, "Calls", { ...samples[1]![1], Call_Duration_Seconds: -1 })).status).toBe(422);
  });

  it("a meeting that ends before it starts is a 422", async () => {
    const res = await create(repA, "Meetings", { ...samples[2]![1], End_DateTime: "2026-03-02T09:00:00+04:00" });
    expect(res.status).toBe(422);
  });

  it("a task is not served as a call, and the type cannot be written", async () => {
    const id = idOf(await create(repA, "Tasks", { Subject: "Only a task" }));
    expect((await get(repA, "Calls", id)).status).toBe(404);
    expect((await call(recordRoute, "PUT", `/Calls/${id}`, { cookie: repA, params: { module: "Calls", id }, body: { data: [{ Subject: "x", version: 1 }] } })).status).toBe(404);
    expect((await call(recordRoute, "DELETE", `/Calls/${id}`, { cookie: repA, params: { module: "Calls", id } })).status).toBe(404);
    expect((await create(repA, "Tasks", { Subject: "x", type: "call" })).status).toBe(422);
  });

  it("a link to another org's record, or to the wrong kind of record, is a 422 on that field", async () => {
    const other = await create(repA, "Tasks", { Subject: "x", What_Id: { id: demoAccount, module: "Accounts" } });
    expect(other.status).toBe(422);
    expect(other.json()).toMatchObject({ details: { api_name: "What_Id" } });
    // An account is not a valid Who_Id.
    expect((await create(repA, "Tasks", { Subject: "x", Who_Id: { id: account, module: "Accounts" } })).status).toBe(422);
  });

  it("ADR-0005: rep B gets 404 and no list row for rep A's task on a public account; the manager sees it", async () => {
    const id = idOf(await create(repA, "Tasks", { Subject: "Private to A", What_Id: { id: account, module: "Accounts" } }));
    expect((await get(repB, "Tasks", id)).status).toBe(404);
    expect((await get(manager, "Tasks", id)).status).toBe(200);
    const list = (cookie: string) => call(moduleRoute, "GET", "/Tasks?per_page=200", { cookie, params: { module: "Tasks" } }).then((r) => r.json().data.map((t: { id: string }) => t.id));
    expect(await list(repB)).not.toContain(id);
    expect(await list(repA)).toContain(id);
  });
});
