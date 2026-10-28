import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as recordRoute from "../app/api/v1/[module]/[id]/route";
import * as moduleRoute from "../app/api/v1/[module]/route";
import * as convertRoute from "../app/api/v1/Quotes/[id]/actions/convert/route";
import * as ratesRoute from "../app/api/v1/settings/exchange_rates/route";
import { call, createSignInUser, signIn } from "./api.ts";

// T8.02 (US-11): Quote -> Sales Order copies lines, addresses, links, currency and the STORED rate.
describe("convert Quote -> Sales Order (T8.02)", () => {
  let auth: Awaited<ReturnType<typeof connectAsAuth>>;
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let adminCtx: { org_id: string; user_id: string; role: string; see_all: string };
  let admin: string;
  let repA: string;
  let repB: string;
  let account: string;
  let product: string;
  const convert = (cookie: string, id: string, headers?: Record<string, string>) => call(convertRoute, "POST", `/Quotes/${id}/actions/convert`, { cookie, params: { id }, body: { to: "Sales_Orders" }, headers });
  const quote = async () => (await call(moduleRoute, "POST", "/Quotes", { cookie: repA, params: { module: "Quotes" }, body: { data: [{
    Subject: "Conv", Account_Name: { id: account }, Currency: "INR", Billing_City: "Muscat", Adjustment: "-1.00",
    Line_Items: [{ Product: { id: product }, Quantity: "3", List_Price: "1000.00", Discount: { type: "percent", value: "10" } }] }] } })).json().data[0].details.id as string;

  beforeAll(async () => {
    [auth, app] = await Promise.all([connectAsAuth(), connectAsApp()]);
    const org = (await auth.query("SELECT id FROM orgs WHERE slug = 'saqient'")).rows[0].id;
    const a = await createSignInUser(auth, org, "admin");
    adminCtx = { org_id: org, user_id: a.id, role: "admin", see_all: "on" };
    admin = await signIn(a.email);
    repA = await signIn((await createSignInUser(auth, org, "rep")).email);
    repB = await signIn((await createSignInUser(auth, org, "rep")).email);
    account = (await call(moduleRoute, "POST", "/Accounts", { cookie: repA, params: { module: "Accounts" }, body: { data: [{ Account_Name: "Conv Account" }] } })).json().data[0].details.id;
    product = (await call(moduleRoute, "POST", "/Products", { cookie: admin, params: { module: "Products" }, body: { data: [{ Product_Name: "Conv P", Product_Code: `CV-${Date.now().toString(36)}`, VAT_Category: "standard", Unit_Price: "5.000" }] } })).json().data[0].details.id;
    await call(ratesRoute, "POST", "/settings/exchange_rates", { cookie: admin, body: { data: [{ currency: "INR", rate: "0.0045", effective_from: "2026-01-01" }] } });
  });
  afterAll(() => Promise.all([auth?.end(), app?.end()]));

  it("copies lines, address, links, currency and the stored rate even after the org rate changed; SO.quote_id = Q.id", async () => {
    const q = await quote();
    const before = (await call(recordRoute, "GET", `/Quotes/${q}`, { cookie: repA, params: { module: "Quotes", id: q } })).json().data[0];
    await call(ratesRoute, "POST", "/settings/exchange_rates", { cookie: admin, body: { data: [{ currency: "INR", rate: "0.0099", effective_from: new Date().toISOString().slice(0, 10) }] } });
    const res = await convert(repA, q);
    expect(res.status, res.body).toBe(201);
    const id = res.json().data[0].details.id;
    const so = (await call(recordRoute, "GET", `/Sales_Orders/${id}`, { cookie: repA, params: { module: "Sales_Orders", id } })).json().data[0];
    expect(so).toMatchObject({ Currency: "INR", Exchange_Rate: before.Exchange_Rate, Sub_Total: before.Sub_Total, VAT_Total: before.VAT_Total, Grand_Total: before.Grand_Total, Adjustment: before.Adjustment, Billing_City: "Muscat", Quote_Name: { id: q }, Account_Name: { id: account }, Status: "created" });
    expect(so.SO_Number).toMatch(/^SO-\d{6}$/);
    expect(so.Line_Items.map((l: Record<string, string>) => [l.List_Price, l.Net_Amount, l.VAT_Amount])).toEqual(before.Line_Items.map((l: Record<string, string>) => [l.List_Price, l.Net_Amount, l.VAT_Amount]));
    const [row] = await queryAs(app, adminCtx, "SELECT quote_id FROM sales_orders WHERE id = $1", [id]);
    expect(row.quote_id).toBe(q);
  });

  it("is idempotent with a key, 404 for another rep, 422 for an unsupported target", async () => {
    const q = await quote();
    const headers = { "idempotency-key": `conv-${Date.now()}-0001` };
    const [a, b] = [await convert(repA, q, headers), await convert(repA, q, headers)];
    expect(a.status).toBe(201);
    expect(b.json()).toEqual(a.json());
    expect((await queryAs(app, adminCtx, "SELECT count(*)::int AS n FROM sales_orders WHERE quote_id = $1", [q]))[0].n).toBe(1);
    expect((await convert(repB, q)).status).toBe(404);
    expect((await call(convertRoute, "POST", `/Quotes/${q}/actions/convert`, { cookie: repA, params: { id: q }, body: { to: "Invoices" } })).status).toBe(422);
  });

  it("a role that cannot see Adjustment cannot convert (the copy carries the totals)", async () => {
    const q = await quote();
    const set = (access: string) => queryAs(app, adminCtx, `INSERT INTO field_permissions (org_id, field_id, role, access)
      SELECT app.org_id(), f.id, 'rep', $1 FROM fields f JOIN modules m ON m.id = f.module_id WHERE m.api_name = 'Sales_Orders' AND f.api_name = 'Adjustment'
      ON CONFLICT (org_id, field_id, role) DO UPDATE SET access = EXCLUDED.access`, [access]);
    await set("hidden");
    try {
      expect((await convert(repA, q)).status).toBe(403);
    } finally {
      await set("read_write");
    }
  });
});
