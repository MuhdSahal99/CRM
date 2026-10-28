import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as recordRoute from "../app/api/v1/[module]/[id]/route";
import * as moduleRoute from "../app/api/v1/[module]/route";
import * as relatedRoute from "../app/api/v1/[module]/[id]/[related_list]/route";
import { call, createSignInUser, signIn } from "./api.ts";

// T8.03 (US-11): Sales_Orders CRUD priced by the same engine as quotes, private to owner/managers, with the totals hidden like a quote's.
describe("Sales_Orders API (T8.03)", () => {
  let auth: Awaited<ReturnType<typeof connectAsAuth>>;
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let adminCtx: { org_id: string; user_id: string; role: string; see_all: string };
  let repA: string;
  let repB: string;
  let account: string;
  let product: string;
  const post = (cookie: string, rec: Record<string, unknown>) => call(moduleRoute, "POST", "/Sales_Orders", { cookie, params: { module: "Sales_Orders" }, body: { data: [rec] } });
  const get = (cookie: string, id: string) => call(recordRoute, "GET", `/Sales_Orders/${id}`, { cookie, params: { module: "Sales_Orders", id } });
  const put = (cookie: string, id: string, rec: Record<string, unknown>) => call(recordRoute, "PUT", `/Sales_Orders/${id}`, { cookie, params: { module: "Sales_Orders", id }, body: { data: [rec] } });
  const lines = () => [{ Product: { id: product }, Quantity: "2", List_Price: "100.000" }];

  beforeAll(async () => {
    [auth, app] = await Promise.all([connectAsAuth(), connectAsApp()]);
    const org = (await auth.query("SELECT id FROM orgs WHERE slug = 'saqient'")).rows[0].id;
    const a = await createSignInUser(auth, org, "admin");
    adminCtx = { org_id: org, user_id: a.id, role: "admin", see_all: "on" };
    const admin = await signIn(a.email);
    repA = await signIn((await createSignInUser(auth, org, "rep")).email);
    repB = await signIn((await createSignInUser(auth, org, "rep")).email);
    account = (await call(moduleRoute, "POST", "/Accounts", { cookie: repA, params: { module: "Accounts" }, body: { data: [{ Account_Name: "SO Account" }] } })).json().data[0].details.id;
    product = (await call(moduleRoute, "POST", "/Products", { cookie: admin, params: { module: "Products" }, body: { data: [{ Product_Name: "SO P", Product_Code: `SO-${Date.now().toString(36)}`, VAT_Category: "standard", Unit_Price: "100.000" }] } })).json().data[0].details.id;
  });
  afterAll(() => Promise.all([auth?.end(), app?.end()]));

  it("creates, prices and numbers an order; client totals and number are ignored", async () => {
    const res = await post(repA, { Subject: "S", Account_Name: { id: account }, Grand_Total: "1", SO_Number: "HACK", Line_Items: lines() });
    expect(res.status).toBe(201);
    const so = (await get(repA, res.json().data[0].details.id)).json().data[0];
    expect(so).toMatchObject({ Sub_Total: "200.000", VAT_Total: "10.000", Grand_Total: "210.000", Status: "created" });
    expect(so.SO_Number).toMatch(/^SO-\d{6}$/);
    expect(so.Line_Items).toHaveLength(1);
    expect((await put(repA, so.id, { version: 1, Line_Items: [{ ...lines()[0], Quantity: "3" }] })).status).toBe(200);
    expect((await get(repA, so.id)).json().data[0]).toMatchObject({ Sub_Total: "300.000", Grand_Total: "315.000" });
  });

  it("another rep gets 404 for the order and its Account related list is empty for them", async () => {
    const id = (await post(repA, { Subject: "S2", Account_Name: { id: account }, Line_Items: lines() })).json().data[0].details.id;
    expect((await get(repB, id)).status).toBe(404);
    const list = (cookie: string) => call(relatedRoute, "GET", `/Accounts/${account}/Sales_Orders`, { cookie, params: { module: "Accounts", id: account, related_list: "Sales_Orders" } });
    expect((await list(repA)).json().data.map((s: { id: string }) => s.id)).toContain(id);
    expect((await list(repB)).json().info.count).toBe(0);
  });

  it("a role that cannot see Adjustment gets no totals or lines and cannot write lines", async () => {
    const id = (await post(repA, { Subject: "S3", Account_Name: { id: account }, Line_Items: lines() })).json().data[0].details.id;
    const set = (access: string) => queryAs(app, adminCtx, `INSERT INTO field_permissions (org_id, field_id, role, access)
      SELECT app.org_id(), f.id, 'rep', $1 FROM fields f JOIN modules m ON m.id = f.module_id WHERE m.api_name = 'Sales_Orders' AND f.api_name = 'Adjustment'
      ON CONFLICT (org_id, field_id, role) DO UPDATE SET access = EXCLUDED.access`, [access]);
    await set("hidden");
    try {
      const so = (await get(repA, id)).json().data[0];
      for (const hidden of ["Adjustment", "Grand_Total", "Grand_Total_OMR", "Line_Items", "VAT_Summary"]) expect(so, hidden).not.toHaveProperty(hidden);
      expect((await put(repA, id, { version: 1, Line_Items: lines() })).status).toBe(403);
    } finally {
      await set("read_write");
    }
  });
});
