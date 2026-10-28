import { closeQueues, getQueue } from "@crm/core";
import { connectAsApp, connectAsAuth, createMember, createOrg, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as moduleRoute from "../app/api/v1/[module]/route";
import * as sendRoute from "../app/api/v1/[module]/[id]/actions/send_email/route";
import * as issueRoute from "../app/api/v1/Invoices/[id]/actions/issue/route";
import * as soConvertRoute from "../app/api/v1/Sales_Orders/[id]/actions/convert/route";
import * as ratesRoute from "../app/api/v1/settings/exchange_rates/route";
import { call, createSignInUser, signIn } from "./api.ts";

// T9.02 (US-13, AC-44, AC-45): the request half of an email send.
describe("send an email: request (T9.02)", () => {
  let auth: Awaited<ReturnType<typeof connectAsAuth>>;
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let adminCtx: { org_id: string; user_id: string; role: string; see_all: string };
  let rep: string;
  let other: string;
  let quote: string;
  let account: string;
  let product: string;
  let contact: string;
  let strangerContact: string;
  let noEmailContact: string;

  const send = (cookie: string, module: string, id: string, body: unknown, headers?: Record<string, string>) =>
    call(sendRoute, "POST", `/${module}/${id}/actions/send_email`, { cookie, params: { module, id }, body, headers });
  const rows = (id: string) => queryAs(app, adminCtx, "SELECT id, status, to_email, subject, body, file_id FROM email_sends WHERE record_id = $1 ORDER BY queued_at", [id]);

  beforeAll(async () => {
    [auth, app] = await Promise.all([connectAsAuth(), connectAsApp()]);
    const org = (await auth.query("SELECT id FROM orgs WHERE slug = 'saqient'")).rows[0].id;
    const a = await createSignInUser(auth, org, "admin");
    adminCtx = { org_id: org, user_id: a.id, role: "admin", see_all: "on" };
    const admin = await signIn(a.email);
    rep = await signIn((await createSignInUser(auth, org, "rep")).email);
    other = await signIn((await createSignInUser(auth, org, "rep")).email);
    account = (await call(moduleRoute, "POST", "/Accounts", { cookie: rep, params: { module: "Accounts" }, body: { data: [{ Account_Name: "Mail Account" }] } })).json().data[0].details.id;
    const make = async (cookie: string, fields: Record<string, unknown>) => {
      const res = await call(moduleRoute, "POST", "/Contacts", { cookie, params: { module: "Contacts" }, body: { data: [{ Last_Name: "Buyer", ...fields }] } });
      expect(res.status, res.body).toBe(201);
      return res.json().data[0].details.id as string;
    };
    contact = await make(rep, { Email: "buyer@example.test", Account_Name: { id: account } });
    noEmailContact = await make(rep, { Account_Name: { id: account } });
    // Contacts are visible org-wide, so a contact the caller "cannot see" is one in another org (tenant isolation).
    const org2 = await createOrg(auth);
    const owner2 = await createMember(auth, org2, "admin");
    strangerContact = (await queryAs(app, { org_id: org2, user_id: owner2, role: "admin", see_all: "on" },
      "INSERT INTO contacts (id, org_id, owner_id, last_name, email) VALUES (gen_random_uuid(), app.org_id(), $1, 'Foreign', 'foreign@example.test') RETURNING id", [owner2]))[0].id;
    product = (await call(moduleRoute, "POST", "/Products", { cookie: admin, params: { module: "Products" }, body: { data: [{ Product_Name: "Mail P", Product_Code: `ML-${Date.now().toString(36)}`, VAT_Category: "standard", Unit_Price: "10.000" }] } })).json().data[0].details.id;
    await call(ratesRoute, "POST", "/settings/exchange_rates", { cookie: admin, body: { data: [{ currency: "AED", rate: "0.105", effective_from: "2026-01-01" }] } });
    quote = (await call(moduleRoute, "POST", "/Quotes", { cookie: rep, params: { module: "Quotes" }, body: { data: [{ Subject: "Mail quote", Currency: "AED", Account_Name: { id: account }, Line_Items: [{ Product: { id: product }, Quantity: "1", List_Price: "10.00" }] }] } })).json().data[0].details.id;
  });
  afterAll(() => Promise.all([auth?.end(), app?.end(), closeQueues()]));

  it("queues a row for the visible contact, attaches the current PDF file and enqueues a job named email-<id>", async () => {
    const res = await send(rep, "Quotes", quote, { to_contact_id: contact, subject: "Your quote", message: "Hello" });
    expect(res.status, res.body).toBe(202);
    const { email_send_id, status } = res.json().data[0];
    expect(status).toBe("queued");
    expect(await rows(quote)).toMatchObject([{ id: email_send_id, status: "queued", to_email: "buyer@example.test", subject: "Your quote", body: "Hello" }]);
    expect((await queryAs(app, adminCtx, "SELECT status, kind FROM files WHERE id = $1", [(await rows(quote))[0].file_id]))[0]).toMatchObject({ kind: "quote_pdf" });
    expect(await getQueue("email").getJob(`email-${email_send_id}`)).toBeDefined();
  });

  it("is idempotent with a key: the same key sends once", async () => {
    const id = (await call(moduleRoute, "POST", "/Quotes", { cookie: rep, params: { module: "Quotes" }, body: { data: [{ Subject: "Mail quote 2", Currency: "AED", Account_Name: { id: account }, Line_Items: [{ Product: { id: product }, Quantity: "1" }] }] } })).json().data[0].details.id as string;
    const headers = { "idempotency-key": `mail-${id}` };
    const [a, b] = [await send(rep, "Quotes", id, { to_contact_id: contact }, headers), await send(rep, "Quotes", id, { to_contact_id: contact }, headers)];
    expect([a.status, b.status]).toEqual([202, 202]);
    expect(b.json()).toEqual(a.json()); // the stored response, whatever order jsonb keeps its keys in
    expect(await rows(id)).toHaveLength(1);
  });

  it("AC-44: a CR/LF in the subject is a 422 and nothing is queued", async () => {
    const before = (await rows(quote)).length;
    expect((await send(rep, "Quotes", quote, { to_contact_id: contact, subject: "Hi\r\nBcc: evil@example.test" })).status).toBe(422);
    expect((await rows(quote)).length).toBe(before);
  });

  it("AC-45: a contact the caller cannot see is 404, and a raw email address is 422", async () => {
    expect((await send(rep, "Quotes", quote, { to_contact_id: strangerContact })).status).toBe(404);
    expect((await send(rep, "Quotes", quote, { to_contact_id: "buyer@example.test" })).status).toBe(422);
    expect((await send(rep, "Quotes", quote, { to_email: "buyer@example.test" })).status).toBe(422);
  });

  it("a document the caller cannot see is 404, a contact with no email is 422, a draft invoice is 404, an unsupported module is 404", async () => {
    expect((await send(other, "Quotes", quote, { to_contact_id: contact })).status).toBe(404); // rep B cannot see rep A's quote
    expect((await send(rep, "Quotes", quote, { to_contact_id: noEmailContact })).status).toBe(422);
    expect((await send(rep, "Quotes", crypto.randomUUID(), { to_contact_id: contact })).status).toBe(404);
    expect((await send(rep, "Accounts", account, { to_contact_id: contact })).status).toBe(404);
    const so = (await call(moduleRoute, "POST", "/Sales_Orders", { cookie: rep, params: { module: "Sales_Orders" }, body: { data: [{ Subject: "Mail SO", Currency: "AED", Account_Name: { id: account }, Line_Items: [{ Product: { id: product }, Quantity: "1", List_Price: "10.00" }] }] } })).json().data[0].details.id as string;
    const invoice = (await call(soConvertRoute, "POST", `/Sales_Orders/${so}/actions/convert`, { cookie: rep, params: { id: so }, body: {} })).json().data[0].details.id as string;
    expect((await send(rep, "Invoices", invoice, { to_contact_id: contact })).status).toBe(404); // a draft has no PDF
    expect((await call(issueRoute, "POST", `/Invoices/${invoice}/actions/issue`, { cookie: rep, params: { id: invoice }, body: {} })).status).toBe(200);
    expect((await send(rep, "Invoices", invoice, { to_contact_id: contact })).status).toBe(202);
  });
});
