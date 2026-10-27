import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { beforeAll, describe, expect, it } from "vitest";
import * as recordRoute from "../app/api/v1/[module]/[id]/route";
import * as moduleRoute from "../app/api/v1/[module]/route";
import * as searchRoute from "../app/api/v1/[module]/search/route";
import { call, signIn } from "./api.ts";

// T2.09 (US-06, AC-13): Contacts through the same generic routes as Accounts.
describe("contacts API (T2.09)", () => {
  let repA: string;
  let demoAccount: string;
  let account: string;

  beforeAll(async () => {
    const auth = await connectAsAuth();
    const { rows } = await auth.query(`SELECT o.id FROM orgs o WHERE o.slug = 'demo'`);
    await auth.end();
    const app = await connectAsApp();
    [{ id: demoAccount }] = await queryAs(app, { org_id: rows[0].id }, "SELECT id FROM accounts LIMIT 1");
    await app.end();
    repA = await signIn("rep.a@saqient.test");
    account = (await create("Accounts", { Account_Name: "Contact Holder LLC" })).json().data[0].details.id;
  });

  const create = (module: string, record: Record<string, unknown>) => call(moduleRoute, "POST", `/${module}`, { cookie: repA, params: { module }, body: { data: [record] } });
  const get = (id: string) => call(recordRoute, "GET", `/Contacts/${id}`, { cookie: repA, params: { module: "Contacts", id } });

  it("US-06: a mobile entered as 9xxx xxxx with Mailing_Country OM is stored and returned as +968…", async () => {
    const res = await create("Contacts", { Last_Name: "Al Balushi", First_Name: "Ahmed", Mobile: "9123 4567", Mailing_Country: "OM", Account_Name: { id: account } });
    expect(res.status).toBe(201);
    const [contact] = (await get(res.json().data[0].details.id)).json().data;
    expect(contact).toMatchObject({ Mobile: "+96891234567", Account_Name: { id: account, name: "Contact Holder LLC" }, Email_Opt_Out: false });
  });

  it("a mobile that is not a valid number is a 422 on Mobile", async () => {
    expect((await create("Contacts", { Last_Name: "X", Mobile: "12", Mailing_Country: "OM" })).json()).toMatchObject({ details: { api_name: "Mobile" } });
    expect((await create("Contacts", { Last_Name: "X", Mobile: "9123 4567" })).json()).toMatchObject({ details: { api_name: "Mobile" } });
  });

  it("a partial update of the mobile uses the stored mailing country", async () => {
    const id = (await create("Contacts", { Last_Name: "Update", Mailing_Country: "AE" })).json().data[0].details.id;
    const res = await call(recordRoute, "PUT", `/Contacts/${id}`, { cookie: repA, params: { module: "Contacts", id }, body: { data: [{ Mobile: "050 123 4567", version: 1 }] } });
    expect(res.status).toBe(200);
    expect((await get(id)).json().data[0].Mobile).toBe("+971501234567");
  });

  it("AC-13: an Account_Name from another org is a 422 on Account_Name", async () => {
    const res = await create("Contacts", { Last_Name: "Cross Org", Account_Name: { id: demoAccount } });
    expect(res.status).toBe(422);
    expect(res.json()).toMatchObject({ details: { api_name: "Account_Name" } });
  });

  it("is searchable by name and mobile", async () => {
    const search = (q: string) => call(searchRoute, "GET", `/Contacts/search?${q}`, { cookie: repA, params: { module: "Contacts" } });
    expect((await search("word=ahmed al bal")).json().data.map((c: { Last_Name: string }) => c.Last_Name)).toContain("Al Balushi");
    expect((await search("phone=91234567")).json().data.length).toBeGreaterThan(0);
  });
});
