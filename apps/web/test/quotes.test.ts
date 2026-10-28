import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as recordRoute from "../app/api/v1/[module]/[id]/route";
import * as moduleRoute from "../app/api/v1/[module]/route";
import * as ratesRoute from "../app/api/v1/settings/exchange_rates/route";
import { call, createSignInUser, signIn } from "./api.ts";

// T7.05, T7.06 (US-10): quotes are priced on the server by priceDocument; the PRD worked example is stored exactly.
describe("quotes API (T7.05, T7.06)", () => {
  let auth: Awaited<ReturnType<typeof connectAsAuth>>;
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let admin: string;
  let repA: string;
  let repB: string;
  let adminCtx: { org_id: string; user_id: string; role: string; see_all: string };
  let account: string;
  const product: Record<string, string> = {};

  const post = (cookie: string, rec: Record<string, unknown>) => call(moduleRoute, "POST", "/Quotes", { cookie, params: { module: "Quotes" }, body: { data: [rec] } });
  const put = (cookie: string, id: string, rec: Record<string, unknown>) => call(recordRoute, "PUT", `/Quotes/${id}`, { cookie, params: { module: "Quotes", id }, body: { data: [rec] } });
  const get = (cookie: string, id: string) => call(recordRoute, "GET", `/Quotes/${id}`, { cookie, params: { module: "Quotes", id } });
  const fixture = () => [
    { Product: { id: product.A }, Quantity: "3", List_Price: "100.000", Discount: { type: "percent", value: "10" } },
    { Product: { id: product.B }, Quantity: "1", List_Price: "50.000" },
    { Product: { id: product.C }, Quantity: "2", List_Price: "12.345" },
  ];
  const base = () => ({ Subject: "Fixture", Account_Name: { id: account } });
  const setAdjustment = (access: string) => queryAs(app, adminCtx, `INSERT INTO field_permissions (org_id, field_id, role, access)
    SELECT app.org_id(), f.id, 'rep', $1 FROM fields f JOIN modules m ON m.id = f.module_id WHERE m.api_name = 'Quotes' AND f.api_name = 'Adjustment'
    ON CONFLICT (org_id, field_id, role) DO UPDATE SET access = EXCLUDED.access`, [access]);

  beforeAll(async () => {
    [auth, app] = await Promise.all([connectAsAuth(), connectAsApp()]);
    const org = (await auth.query("SELECT id FROM orgs WHERE slug = 'saqient'")).rows[0].id;
    const a = await createSignInUser(auth, org, "admin");
    adminCtx = { org_id: org, user_id: a.id, role: "admin", see_all: "on" };
    admin = await signIn(a.email);
    repA = await signIn((await createSignInUser(auth, org, "rep")).email);
    repB = await signIn((await createSignInUser(auth, org, "rep")).email);
    account = (await call(moduleRoute, "POST", "/Accounts", { cookie: repA, params: { module: "Accounts" }, body: { data: [{ Account_Name: "Quote Account" }] } })).json().data[0].details.id;
    const tag = Date.now().toString(36);
    for (const [k, vat, price] of [["A", "standard", "100.000"], ["B", "zero_rated", "50.000"], ["C", "exempt", "12.345"]] as const) {
      const res = await call(moduleRoute, "POST", "/Products", { cookie: admin, params: { module: "Products" }, body: { data: [{ Product_Name: `Q ${k}`, Product_Code: `Q${k}-${tag}`, VAT_Category: vat, Unit_Price: price }] } });
      product[k] = res.json().data[0].details.id;
    }
    await call(ratesRoute, "POST", "/settings/exchange_rates", { cookie: admin, body: { data: [{ currency: "AED", rate: "0.105", effective_from: "2026-01-01" }] } });
  });
  afterAll(async () => {
    await Promise.all([auth?.end(), app?.end()]);
  });

  it("the US-10 fixture stores 358.000 and the VAT summary; client totals, rate and number are ignored (AC-20, AC-21)", async () => {
    const res = await post(repA, {
      ...base(), Adjustment: "-0.190", Grand_Total: "1.000", Sub_Total: "1.000", VAT_Total: "0", Exchange_Rate: "9", Quote_Number: "HACK-1",
      Line_Items: fixture().map((l) => ({ ...l, VAT_Amount: "0", Total: "0.001" })),
    });
    expect(res.status).toBe(201);
    const q = (await get(repA, res.json().data[0].details.id)).json().data[0];
    expect(q).toMatchObject({ Sub_Total: "344.690", VAT_Total: "13.500", Adjustment: "-0.190", Grand_Total: "358.000", Exchange_Rate: "1.00000000", Currency: "OMR", Quote_Stage: "draft" });
    expect(q.Quote_Number).toMatch(/^QT-\d{6}$/);
    expect(q.Line_Items.map((l: Record<string, string>) => [l.Net_Amount, l.VAT_Amount, l.Total])).toEqual([["270.000", "13.500", "283.500"], ["50.000", "0.000", "50.000"], ["24.690", "0.000", "24.690"]]);
    expect(q.VAT_Summary).toEqual([
      { VAT_Category: "standard", Base: "270.000", VAT: "13.500" },
      { VAT_Category: "zero_rated", Base: "50.000", VAT: "0.000" },
      { VAT_Category: "exempt", Base: "24.690", VAT: "0.000" },
    ]);
  });

  it("an OMR product on an AED quote defaults to price / rate at 2 dp, and the OMR equivalent uses the quote's rate", async () => {
    const res = await post(repA, { ...base(), Currency: "AED", Line_Items: [{ Product: { id: product.A }, Quantity: "1" }] });
    expect(res.status).toBe(201);
    const id = res.json().data[0].details.id;
    const q = (await get(repA, id)).json().data[0];
    expect(q.Line_Items[0].List_Price).toMatch(/^\d+\.\d{2}0$/); // 2 dp, held in a 3 dp column
    const [row] = await queryAs(app, adminCtx, "SELECT grand_total_omr = round(grand_total * exchange_rate, 3) AS omr_ok, (grand_total = round(grand_total, 2)) AS two_dp FROM quotes WHERE id = $1", [id]);
    expect(row).toEqual({ omr_ok: true, two_dp: true });
    expect((await post(repA, { ...base(), Currency: "AED", Line_Items: [{ Product: { id: product.A }, Quantity: "1", List_Price: "1.005" }] })).status).toBe(422);
  });

  it("a missing product, a quantity of 0 or a malformed quantity is 422 on that line", async () => {
    const line = (over: Record<string, unknown>) => post(repA, { ...base(), Line_Items: [{ Product: { id: product.A }, Quantity: "1", ...over }] });
    expect((await post(repA, { ...base(), Line_Items: [{ Quantity: "1" }] })).status).toBe(422);
    for (const Quantity of ["0", "-1", "1.0001", "1e3"]) expect((await line({ Quantity })).status, Quantity).toBe(422);
    expect((await line({ Quantity: "0" })).body).toContain("Line_Items.0.Quantity");
    expect((await line({ Product: { id: "00000000-0000-4000-8000-000000000000" } })).status).toBe(422);
  });

  it("editing a quantity re-prices everything; a stale version is 409; a currency change re-captures the rate", async () => {
    const id = (await post(repA, { ...base(), Line_Items: fixture() })).json().data[0].details.id;
    expect((await get(repA, id)).json().data[0]).toMatchObject({ Sub_Total: "344.690", Grand_Total: "358.190", version: 1 });
    const edited = fixture();
    edited[0]!.Quantity = "4";
    expect((await put(repA, id, { version: 1, Line_Items: edited })).status).toBe(200);
    expect((await get(repA, id)).json().data[0]).toMatchObject({ Sub_Total: "434.690", VAT_Total: "18.000", Grand_Total: "452.690", version: 2 });
    expect((await put(repA, id, { version: 1, Subject: "stale" })).status).toBe(409);
    const aed = await put(repA, id, { version: 2, Currency: "AED", Line_Items: fixture().map((l) => ({ ...l, List_Price: "10.00" })) });
    expect(aed.status).toBe(200);
    const q = (await get(repA, id)).json().data[0];
    expect(q.Currency).toBe("AED");
    expect(q.Exchange_Rate).not.toBe("1.00000000");
  });

  it("rep B cannot read or change rep A's quote; its lines stay hidden (AC-18)", async () => {
    const id = (await post(repA, { ...base(), Line_Items: fixture() })).json().data[0].details.id;
    expect((await get(repB, id)).status).toBe(404);
    expect((await put(repB, id, { version: 1, Subject: "x" })).status).toBe(404);
    expect((await get(admin, id)).json().data[0].Line_Items).toHaveLength(3);
  });

  it("a role that cannot see Adjustment gets no Grand_Total, OMR totals, lines or VAT summary", async () => {
    const id = (await post(repA, { ...base(), Line_Items: fixture() })).json().data[0].details.id;
    await setAdjustment("hidden");
    try {
      const q = (await get(repA, id)).json().data[0];
      for (const hidden of ["Adjustment", "Grand_Total", "Grand_Total_OMR", "Line_Items", "VAT_Summary"]) expect(q, hidden).not.toHaveProperty(hidden);
      expect(q).toHaveProperty("Sub_Total");
    } finally {
      await setAdjustment("read_write");
    }
  });
});
