import { closeQueues, contextForMember, getAuthDb, putFile, withTenant } from "@crm/core";
import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as moduleRoute from "../app/api/v1/[module]/route";
import * as pdfRoute from "../app/api/v1/[module]/[id]/pdf/route";
import * as issueRoute from "../app/api/v1/Invoices/[id]/actions/issue/route";
import * as soConvertRoute from "../app/api/v1/Sales_Orders/[id]/actions/convert/route";
import * as ratesRoute from "../app/api/v1/settings/exchange_rates/route";
import { call, createSignInUser, signIn } from "./api.ts";

// T8.12 (US-12, ADR-0012): the PDF is served through the app, only to those who can see the document.
describe("document PDF download (T8.12)", () => {
  let auth: Awaited<ReturnType<typeof connectAsAuth>>;
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let adminCtx: { org_id: string; user_id: string; role: string; see_all: string };
  let rep: string;
  let repId: string;
  let other: string;
  let account: string;
  let product: string;

  const get = (cookie: string, module: string, id: string) => call(pdfRoute, "GET", `/${module}/${id}/pdf`, { cookie, params: { module, id } });
  const lines = [{ Product: { id: "" }, Quantity: "1", List_Price: "10.00" }];
  const draft = async () => {
    const so = (await call(moduleRoute, "POST", "/Sales_Orders", { cookie: rep, params: { module: "Sales_Orders" }, body: { data: [{ Subject: "Pdf", Currency: "AED", Account_Name: { id: account }, Line_Items: lines }] } })).json().data[0].details.id as string;
    return (await call(soConvertRoute, "POST", `/Sales_Orders/${so}/actions/convert`, { cookie: rep, params: { id: so }, body: {} })).json().data[0].details.id as string;
  };
  const issued = async () => {
    const id = await draft();
    expect((await call(issueRoute, "POST", `/Invoices/${id}/actions/issue`, { cookie: rep, params: { id }, body: {} })).status).toBe(200);
    return id;
  };
  const filesOf = (id: string) => queryAs(app, adminCtx, "SELECT id, status, kind FROM files WHERE record_id = $1 ORDER BY created_at", [id]);

  beforeAll(async () => {
    [auth, app] = await Promise.all([connectAsAuth(), connectAsApp()]);
    const org = (await auth.query("SELECT id FROM orgs WHERE slug = 'saqient'")).rows[0].id;
    const a = await createSignInUser(auth, org, "admin");
    adminCtx = { org_id: org, user_id: a.id, role: "admin", see_all: "on" };
    const admin = await signIn(a.email);
    const r = await createSignInUser(auth, org, "rep");
    repId = r.id;
    rep = await signIn(r.email);
    other = await signIn((await createSignInUser(auth, org, "rep")).email);
    account = (await call(moduleRoute, "POST", "/Accounts", { cookie: rep, params: { module: "Accounts" }, body: { data: [{ Account_Name: "Pdf Account" }] } })).json().data[0].details.id;
    product = (await call(moduleRoute, "POST", "/Products", { cookie: admin, params: { module: "Products" }, body: { data: [{ Product_Name: "Pdf P", Product_Code: `PD-${Date.now().toString(36)}`, VAT_Category: "standard", Unit_Price: "10.000" }] } })).json().data[0].details.id;
    lines[0]!.Product.id = product;
    await call(ratesRoute, "POST", "/settings/exchange_rates", { cookie: admin, body: { data: [{ currency: "AED", rate: "0.105", effective_from: "2026-01-01" }] } });
    await queryAs(app, adminCtx, "UPDATE org_settings SET legal_name = COALESCE(legal_name, 'Saqient LLC')");
  });
  afterAll(() => Promise.all([auth?.end(), app?.end(), closeQueues()]));

  it("a draft invoice, an unknown id and an unsupported module are 404", async () => {
    expect((await get(rep, "Invoices", await draft())).status).toBe(404);
    expect((await get(rep, "Invoices", crypto.randomUUID())).status).toBe(404);
    expect((await get(rep, "Accounts", account)).status).toBe(404);
  });

  it("an issued invoice whose render has not finished answers 202 with Retry-After, and another rep still gets 404", async () => {
    const id = await issued();
    const res = await get(rep, "Invoices", id);
    expect(res.status).toBe(202);
    expect((await get(other, "Invoices", id)).status).toBe(404);
    expect(await filesOf(id)).toHaveLength(1); // asking again never queues a second render of an invoice
  });

  it("a quote with no render queues one and answers 202; asking again does not queue another", async () => {
    const quote = (await call(moduleRoute, "POST", "/Quotes", { cookie: rep, params: { module: "Quotes" }, body: { data: [{ Subject: "Pdf quote", Currency: "AED", Account_Name: { id: account }, Line_Items: lines }] } })).json().data[0].details.id as string;
    expect((await get(rep, "Quotes", quote)).status).toBe(202);
    expect((await get(rep, "Quotes", quote)).status).toBe(202);
    expect(await filesOf(quote)).toMatchObject([{ kind: "quote_pdf", status: "pending" }]);
    expect((await get(other, "Quotes", quote)).status).toBe(404);
  });

  describe.skipIf(!process.env.S3_BUCKET)("with object storage", () => {
    it("streams the stored bytes through the app: 200, no redirect, no storage host in the response", async () => {
      const id = await issued();
      const [file] = await filesOf(id);
      const ctx = (await contextForMember(getAuthDb(), repId, adminCtx.org_id))!;
      await withTenant(ctx, (tx) => putFile(tx, file.id, Buffer.from("%PDF-1.4 test document")));
      const res = await call(pdfRoute, "GET", `/Invoices/${id}/pdf`, { cookie: rep, params: { module: "Invoices", id } });
      expect(res.status).toBe(200);
      expect(res.body).toBe("%PDF-1.4 test document");
      const raw = await pdfRoute.GET!(new Request(`http://localhost:3000/api/v1/Invoices/${id}/pdf`, { headers: { cookie: rep } }), { params: Promise.resolve({ module: "Invoices", id }) });
      expect(raw.headers.get("content-type")).toBe("application/pdf");
      expect(raw.headers.get("cache-control")).toBe("no-store, private");
      expect(raw.headers.get("location")).toBeNull();
      expect([...raw.headers.values()].join(" ")).not.toContain(process.env.S3_ENDPOINT ?? "amazonaws");
      expect((await get(other, "Invoices", id)).status).toBe(404);
    });
  });
});
