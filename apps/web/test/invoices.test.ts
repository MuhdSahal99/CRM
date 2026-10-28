import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as recordRoute from "../app/api/v1/[module]/[id]/route";
import * as moduleRoute from "../app/api/v1/[module]/route";
import * as soConvertRoute from "../app/api/v1/Sales_Orders/[id]/actions/convert/route";
import * as transitionRoute from "../app/api/v1/Sales_Orders/[id]/actions/transition/route";
import * as ratesRoute from "../app/api/v1/settings/exchange_rates/route";
import { call, createSignInUser, signIn } from "./api.ts";

// T8.05 (US-11, AC-23 API): Sales Order -> draft Invoice with the copied rate; a non-draft invoice answers PUT with 409.
describe("convert Sales Order -> Invoice (T8.05)", () => {
  let auth: Awaited<ReturnType<typeof connectAsAuth>>;
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let adminCtx: { org_id: string; user_id: string; role: string; see_all: string };
  let rep: string;
  let other: string;
  let account: string;
  let product: string;

  const order = async () => (await call(moduleRoute, "POST", "/Sales_Orders", { cookie: rep, params: { module: "Sales_Orders" }, body: { data: [{ Subject: "Inv", Currency: "AED", Account_Name: { id: account }, Customer_No: "C-1", Purchase_Order_Ref: "PO-9",
    Line_Items: [{ Product: { id: product }, Quantity: "2", List_Price: "10.00" }] }] } })).json().data[0].details.id as string;
  const convert = (cookie: string, id: string) => call(soConvertRoute, "POST", `/Sales_Orders/${id}/actions/convert`, { cookie, params: { id }, body: {} });

  beforeAll(async () => {
    [auth, app] = await Promise.all([connectAsAuth(), connectAsApp()]);
    const org = (await auth.query("SELECT id FROM orgs WHERE slug = 'saqient'")).rows[0].id;
    const a = await createSignInUser(auth, org, "admin");
    adminCtx = { org_id: org, user_id: a.id, role: "admin", see_all: "on" };
    const admin = await signIn(a.email);
    rep = await signIn((await createSignInUser(auth, org, "rep")).email);
    other = await signIn((await createSignInUser(auth, org, "rep")).email);
    account = (await call(moduleRoute, "POST", "/Accounts", { cookie: rep, params: { module: "Accounts" }, body: { data: [{ Account_Name: "Inv Account" }] } })).json().data[0].details.id;
    product = (await call(moduleRoute, "POST", "/Products", { cookie: admin, params: { module: "Products" }, body: { data: [{ Product_Name: "Inv P", Product_Code: `IV-${Date.now().toString(36)}`, VAT_Category: "standard", Unit_Price: "10.000" }] } })).json().data[0].details.id;
    await call(ratesRoute, "POST", "/settings/exchange_rates", { cookie: admin, body: { data: [{ currency: "AED", rate: "0.105", effective_from: "2026-01-01" }] } });
  });
  afterAll(() => Promise.all([auth?.end(), app?.end()]));

  it("creates a draft invoice with no number, sales_order_id set and the SO's rate and lines", async () => {
    const so = await order();
    const soRec = (await call(recordRoute, "GET", `/Sales_Orders/${so}`, { cookie: rep, params: { module: "Sales_Orders", id: so } })).json().data[0];
    const res = await convert(rep, so);
    expect(res.status, res.body).toBe(201);
    const id = res.json().data[0].details.id;
    const inv = (await call(recordRoute, "GET", `/Invoices/${id}`, { cookie: rep, params: { module: "Invoices", id } })).json().data[0];
    expect(inv).toMatchObject({ Invoice_Number: null, Status: "draft", Exchange_Rate: soRec.Exchange_Rate, Grand_Total: soRec.Grand_Total, Customer_No: "C-1", Purchase_Order_Ref: "PO-9", Sales_Order_Name: { id: so } });
    expect(inv.Line_Items).toHaveLength(1);
    expect((await queryAs(app, adminCtx, "SELECT sales_order_id FROM invoices WHERE id = $1", [id]))[0].sales_order_id).toBe(so);
    expect((await convert(other, so)).status).toBe(404);
  });

  it("PUT works on a draft and is 409 once the invoice is issued (AC-23 API); DELETE is 409 too", async () => {
    const id = (await convert(rep, await order())).json().data[0].details.id;
    const put = () => call(recordRoute, "PUT", `/Invoices/${id}`, { cookie: rep, params: { module: "Invoices", id }, body: { data: [{ version: 1, Subject: "edited" }] } });
    expect((await put()).status).toBe(200);
    await queryAs(app, adminCtx, "UPDATE invoices SET status = 'issued', invoice_number = 'T-' || left(id::text, 8) WHERE id = $1", [id]);
    expect((await put()).status).toBe(409);
    expect((await call(recordRoute, "DELETE", `/Invoices/${id}`, { cookie: rep, params: { module: "Invoices", id } })).status).toBe(409);
  });

  it("a field hidden from the role on either document is not copied (Customer_No); the others are", async () => {
    const hide = (module: string, access: string) => queryAs(app, adminCtx, `INSERT INTO field_permissions (org_id, field_id, role, access)
      SELECT app.org_id(), f.id, 'rep', $1 FROM fields f JOIN modules m ON m.id = f.module_id WHERE m.api_name = $2 AND f.api_name = 'Customer_No'
      ON CONFLICT (org_id, field_id, role) DO UPDATE SET access = EXCLUDED.access`, [access, module]);
    for (const module of ["Invoices", "Sales_Orders"]) {
      const so = await order();
      await hide(module, "hidden");
      try {
        const id = (await convert(rep, so)).json().data[0].details.id;
        expect((await queryAs(app, adminCtx, "SELECT customer_no, purchase_order_ref FROM invoices WHERE id = $1", [id]))[0], module).toEqual({ customer_no: null, purchase_order_ref: "PO-9" });
      } finally {
        await hide(module, "read_write");
      }
    }
  });

  it("a cancelled sales order cannot be invoiced", async () => {
    const so = await order();
    await call(transitionRoute, "POST", `/Sales_Orders/${so}/actions/transition`, { cookie: rep, params: { id: so }, body: { to: "cancelled" } });
    expect((await convert(rep, so)).status).toBe(409);
  });
});
