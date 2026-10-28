import { cancelInvoice, withTenant } from "@crm/core";
import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as moduleRoute from "../app/api/v1/[module]/route";
import * as cancelRoute from "../app/api/v1/Invoices/[id]/actions/cancel/route";
import * as issueRoute from "../app/api/v1/Invoices/[id]/actions/issue/route";
import * as paidRoute from "../app/api/v1/Invoices/[id]/actions/mark_paid/route";
import * as soConvertRoute from "../app/api/v1/Sales_Orders/[id]/actions/convert/route";
import * as ratesRoute from "../app/api/v1/settings/exchange_rates/route";
import { call, createSignInUser, signIn } from "./api.ts";

// T8.07 (US-12, AC-25): cancel keeps the number and writes its timeline row in the same transaction; mark paid; paid -> cancelled is Admin only.
describe("cancel and mark paid (T8.07)", () => {
  let auth: Awaited<ReturnType<typeof connectAsAuth>>;
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let adminCtx: { org_id: string; user_id: string; role: string; see_all: string };
  let admin: string;
  let rep: string;
  let other: string;
  let account: string;
  let product: string;

  const post = (mod: Parameters<typeof call>[0], action: string, cookie: string, id: string, body: unknown = {}) => call(mod, "POST", `/Invoices/${id}/actions/${action}`, { cookie, params: { id }, body });
  const draft = async () => {
    const so = (await call(moduleRoute, "POST", "/Sales_Orders", { cookie: rep, params: { module: "Sales_Orders" }, body: { data: [{ Subject: "St", Currency: "AED", Account_Name: { id: account },
      Line_Items: [{ Product: { id: product }, Quantity: "1", List_Price: "10.00" }] }] } })).json().data[0].details.id as string;
    return (await call(soConvertRoute, "POST", `/Sales_Orders/${so}/actions/convert`, { cookie: rep, params: { id: so }, body: {} })).json().data[0].details.id as string;
  };
  const issued = async () => { const id = await draft(); expect((await post(issueRoute, "issue", rep, id)).status).toBe(200); return id; };
  const row = async (id: string) => (await queryAs(app, adminCtx, "SELECT status, invoice_number, cancel_reason, paid_at FROM invoices WHERE id = $1", [id]))[0];
  const events = async (id: string, type: string) => queryAs(app, adminCtx, "SELECT meta, changes FROM timeline_events WHERE record_id = $1 AND event_type = $2", [id, type]);

  beforeAll(async () => {
    [auth, app] = await Promise.all([connectAsAuth(), connectAsApp()]);
    const org = (await auth.query("SELECT id FROM orgs WHERE slug = 'saqient'")).rows[0].id;
    const a = await createSignInUser(auth, org, "admin");
    adminCtx = { org_id: org, user_id: a.id, role: "admin", see_all: "on" };
    admin = await signIn(a.email);
    rep = await signIn((await createSignInUser(auth, org, "rep")).email);
    other = await signIn((await createSignInUser(auth, org, "rep")).email);
    account = (await call(moduleRoute, "POST", "/Accounts", { cookie: rep, params: { module: "Accounts" }, body: { data: [{ Account_Name: "Status Account" }] } })).json().data[0].details.id;
    product = (await call(moduleRoute, "POST", "/Products", { cookie: admin, params: { module: "Products" }, body: { data: [{ Product_Name: "St P", Product_Code: `ST-${Date.now().toString(36)}`, VAT_Category: "standard", Unit_Price: "10.000" }] } })).json().data[0].details.id;
    await call(ratesRoute, "POST", "/settings/exchange_rates", { cookie: admin, body: { data: [{ currency: "AED", rate: "0.105", effective_from: "2026-01-01" }] } });
    await queryAs(app, adminCtx, `INSERT INTO org_settings (org_id, legal_name) VALUES (app.org_id(), 'Saqient LLC') ON CONFLICT (org_id) DO NOTHING`);
  });
  afterAll(() => Promise.all([auth?.end(), app?.end()]));

  it("cancel keeps the number, stores the reason and writes invoice_cancelled; a draft or a short reason is refused; another rep gets 404", async () => {
    const id = await issued();
    const number = (await row(id)).invoice_number;
    expect((await post(cancelRoute, "cancel", rep, await draft(), { reason: "mistake" })).status).toBe(409);
    expect((await post(cancelRoute, "cancel", rep, id, { reason: "x" })).status).toBe(422);
    expect((await post(cancelRoute, "cancel", other, id, { reason: "wrong buyer" })).status).toBe(404);
    expect((await post(cancelRoute, "cancel", rep, id, { reason: "wrong buyer" })).status).toBe(200);
    expect(await row(id)).toMatchObject({ status: "cancelled", invoice_number: number, cancel_reason: "wrong buyer" });
    expect((await events(id, "invoice_cancelled"))[0].meta).toMatchObject({ reason: "wrong buyer", invoice_number: number });
    expect((await post(cancelRoute, "cancel", rep, id, { reason: "again please" })).status).toBe(409);
  });

  it("AC-25: the cancel and its timeline row commit or roll back together", async () => {
    const id = await issued();
    const ctx = { orgId: adminCtx.org_id, userId: adminCtx.user_id, role: "admin" as const, visibleOwnerIds: [adminCtx.user_id], seeAll: true };
    await withTenant(ctx, async (tx) => { await cancelInvoice(tx, id, { reason: "rolled back" }); throw new Error("abort"); }).catch(() => {});
    expect((await row(id)).status).toBe("issued");
    expect(await events(id, "invoice_cancelled")).toHaveLength(0);
  });

  it("mark paid sets paid_at and writes invoice_paid; a second call or a draft is 409", async () => {
    const id = await issued();
    expect((await post(paidRoute, "mark_paid", rep, await draft())).status).toBe(409);
    expect((await post(paidRoute, "mark_paid", rep, id, { paid_on: "2026-10-01" })).status).toBe(200);
    expect(await row(id)).toMatchObject({ status: "paid" });
    expect((await row(id)).paid_at).toBeTruthy();
    expect(await events(id, "invoice_paid")).toHaveLength(1);
    expect((await post(paidRoute, "mark_paid", rep, id)).status).toBe(409);
  });

  it("a paid invoice can be cancelled by an Admin only", async () => {
    const id = await issued();
    await post(paidRoute, "mark_paid", rep, id);
    expect((await post(cancelRoute, "cancel", rep, id, { reason: "refund issued" })).status).toBe(403);
    expect((await row(id)).status).toBe("paid");
    expect((await post(cancelRoute, "cancel", admin, id, { reason: "refund issued" })).status).toBe(200);
    expect((await row(id)).status).toBe("cancelled");
  });
});
