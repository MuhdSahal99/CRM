import { withTenant, issueInvoice } from "@crm/core";
import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as recordRoute from "../app/api/v1/[module]/[id]/route";
import * as moduleRoute from "../app/api/v1/[module]/route";
import * as issueRoute from "../app/api/v1/Invoices/[id]/actions/issue/route";
import * as soConvertRoute from "../app/api/v1/Sales_Orders/[id]/actions/convert/route";
import * as ratesRoute from "../app/api/v1/settings/exchange_rates/route";
import { call, createSignInUser, signIn } from "./api.ts";

// T8.06 (US-12, ADR-0008): AC-26 gap-free numbering under concurrency and rollbacks, AC-27 idempotent issue, 409 on a non-draft.
describe("issue an invoice (T8.06)", () => {
  let auth: Awaited<ReturnType<typeof connectAsAuth>>;
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let adminCtx: { org_id: string; user_id: string; role: string; see_all: string };
  let rep: string;
  let other: string;
  let account: string;
  let product: string;

  const draft = async () => {
    const so = (await call(moduleRoute, "POST", "/Sales_Orders", { cookie: rep, params: { module: "Sales_Orders" }, body: { data: [{ Subject: "Iss", Currency: "AED", Account_Name: { id: account },
      Line_Items: [{ Product: { id: product }, Quantity: "2", List_Price: "10.00" }] }] } })).json().data[0].details.id as string;
    return (await call(soConvertRoute, "POST", `/Sales_Orders/${so}/actions/convert`, { cookie: rep, params: { id: so }, body: {} })).json().data[0].details.id as string;
  };
  const issue = (cookie: string, id: string, headers?: Record<string, string>) => call(issueRoute, "POST", `/Invoices/${id}/actions/issue`, { cookie, params: { id }, body: {}, headers });

  beforeAll(async () => {
    [auth, app] = await Promise.all([connectAsAuth(), connectAsApp()]);
    const org = (await auth.query("SELECT id FROM orgs WHERE slug = 'saqient'")).rows[0].id;
    const a = await createSignInUser(auth, org, "admin");
    adminCtx = { org_id: org, user_id: a.id, role: "admin", see_all: "on" };
    const admin = await signIn(a.email);
    rep = await signIn((await createSignInUser(auth, org, "rep")).email);
    other = await signIn((await createSignInUser(auth, org, "rep")).email);
    account = (await call(moduleRoute, "POST", "/Accounts", { cookie: rep, params: { module: "Accounts" }, body: { data: [{ Account_Name: "Issue Account" }] } })).json().data[0].details.id;
    product = (await call(moduleRoute, "POST", "/Products", { cookie: admin, params: { module: "Products" }, body: { data: [{ Product_Name: "Iss P", Product_Code: `IS-${Date.now().toString(36)}`, VAT_Category: "standard", Unit_Price: "10.000" }] } })).json().data[0].details.id;
    await call(ratesRoute, "POST", "/settings/exchange_rates", { cookie: admin, body: { data: [{ currency: "AED", rate: "0.105", effective_from: "2026-01-01" }] } });
    await queryAs(app, adminCtx, `INSERT INTO org_settings (org_id, legal_name, vat_number) VALUES (app.org_id(), 'Saqient LLC', 'OM1234567890')
      ON CONFLICT (org_id) DO UPDATE SET legal_name = COALESCE(org_settings.legal_name, EXCLUDED.legal_name), vat_number = COALESCE(org_settings.vat_number, EXCLUDED.vat_number)`);
  });
  afterAll(() => Promise.all([auth?.end(), app?.end()]));

  it("numbers the invoice, snapshots seller and buyer, writes the timeline row; a second issue is 409; another rep gets 404", async () => {
    const id = await draft();
    expect((await issue(other, id)).status).toBe(404);
    const res = await issue(rep, id);
    expect(res.status, res.body).toBe(200);
    expect(res.json().data[0].details.Invoice_Number).toMatch(/^INV-\d{6}$/);
    const row = (await queryAs(app, adminCtx, "SELECT status, invoice_number, invoice_date, seller_snapshot, buyer_snapshot FROM invoices WHERE id = $1", [id]))[0];
    expect(row).toMatchObject({ status: "issued", invoice_number: res.json().data[0].details.Invoice_Number });
    expect(row.invoice_date).toBeTruthy();
    expect(row.seller_snapshot.legal_name).toBeTruthy();
    expect(row.buyer_snapshot.name).toBe("Issue Account");
    expect((await queryAs(app, adminCtx, "SELECT 1 FROM timeline_events WHERE record_id = $1 AND event_type = 'invoice_issued'", [id]))).toHaveLength(1);
    expect((await issue(rep, id)).status).toBe(409);
    const inv = (await call(recordRoute, "GET", `/Invoices/${id}`, { cookie: rep, params: { module: "Invoices", id } })).json().data[0];
    expect(inv.Invoice_Number).toBe(row.invoice_number);
  });

  it("a role without read_write on Invoices.Status cannot issue (403) and nothing is numbered", async () => {
    const id = await draft();
    const grant = (access: string) => queryAs(app, adminCtx, `INSERT INTO field_permissions (org_id, field_id, role, access)
      SELECT app.org_id(), f.id, 'rep', $1 FROM fields f JOIN modules m ON m.id = f.module_id WHERE m.api_name = 'Invoices' AND f.api_name = 'Status'
      ON CONFLICT (org_id, field_id, role) DO UPDATE SET access = EXCLUDED.access`, [access]);
    await grant("read_only");
    try {
      expect((await issue(rep, id)).status).toBe(403);
      expect((await queryAs(app, adminCtx, "SELECT status FROM invoices WHERE id = $1", [id]))[0].status).toBe("draft");
    } finally {
      await grant("read_write");
    }
    expect((await issue(rep, id)).status).toBe(200);
  });

  it("stored totals that no longer match the lines abort the issue and consume no number", async () => {
    const id = await draft();
    await queryAs(app, adminCtx, "UPDATE invoices SET vat_total_omr = vat_total_omr + 1 WHERE id = $1", [id]);
    const before = (await queryAs(app, adminCtx, "SELECT next_value FROM document_sequences WHERE doc_type = 'invoice'"))[0]?.next_value;
    expect((await issue(rep, id)).status).toBe(409);
    expect((await queryAs(app, adminCtx, "SELECT next_value FROM document_sequences WHERE doc_type = 'invoice'"))[0]?.next_value).toBe(before);
    expect((await queryAs(app, adminCtx, "SELECT status FROM invoices WHERE id = $1", [id]))[0].status).toBe("draft");
  });

  it("AC-27: two calls with the same Idempotency-Key assign one number and return the stored response", async () => {
    const id = await draft();
    const headers = { "idempotency-key": `issue-${id}` };
    const [a, b] = [await issue(rep, id, headers), await issue(rep, id, headers)];
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(b.body).toBe(a.body);
    expect((await queryAs(app, adminCtx, "SELECT count(*)::int AS n FROM timeline_events WHERE record_id = $1 AND event_type = 'invoice_issued'", [id]))[0].n).toBe(1);
  });

  it("AC-26: 20 concurrent issues with random rollbacks give contiguous numbers and no duplicates", async () => {
    const ids = await Promise.all(Array.from({ length: 20 }, draft));
    const ctx = { orgId: adminCtx.org_id, userId: adminCtx.user_id, role: "admin" as const, visibleOwnerIds: [adminCtx.user_id], seeAll: true };
    const outcomes = await Promise.all(ids.map((id, i) => withTenant(ctx, async (tx) => {
      await issueInvoice(tx, id);
      if (i % 3 === 0) throw new Error("injected rollback"); // the number taken above must be returned
    }).then(() => true, () => false)));
    expect(outcomes.some((ok) => !ok) && outcomes.some(Boolean)).toBe(true);
    const nums = (await queryAs(app, adminCtx, "SELECT invoice_number FROM invoices WHERE invoice_number ~ '^INV-[0-9]+$' ORDER BY invoice_number"))
      .map((r) => Number(r.invoice_number.slice(4)));
    const mine = (await queryAs(app, adminCtx, "SELECT invoice_number FROM invoices WHERE id = ANY($1)", [ids])).map((r) => Number(r.invoice_number?.slice(4))).filter(Boolean);
    expect(mine).toHaveLength(outcomes.filter(Boolean).length);
    expect(new Set(nums).size).toBe(nums.length);
    const from = Math.min(...mine);
    const tail = nums.filter((n) => n >= from);
    expect(tail).toEqual(Array.from({ length: tail.length }, (_, i) => from + i));
  });
});
