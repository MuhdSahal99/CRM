import { closeQueues, contextForMember, createFile, createLogger, getAuthDb, hashShareToken, log, putFile, withTenant } from "@crm/core";
import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as moduleRoute from "../app/api/v1/[module]/route";
import * as linksRoute from "../app/api/v1/[module]/[id]/share_links/route";
import * as linkRoute from "../app/api/v1/[module]/[id]/share_links/[link_id]/route";
import * as shareRoute from "../app/s/[token]/route";
import * as ratesRoute from "../app/api/v1/settings/exchange_rates/route";
import { call, createSignInUser, signIn } from "./api.ts";

// T9.06 (US-14, ADR-0009): the public /s/{token} route. The 200 cases need object storage (S3_*) for the PDF bytes: skipped without it.
// A fresh client address per call, so these requests never share a rate-limit bucket (rate-limit.test.ts covers the limits).
const fetchShare = (token: string, suffix = "") =>
  shareRoute.GET(new Request(`http://localhost:3000/s/${token}${suffix}`, { headers: { "x-forwarded-for": `10.${Array.from({ length: 3 }, () => Math.floor(Math.random() * 256)).join(".")}` } }), { params: Promise.resolve({ token }) });
const snapshot = async (res: Response) => ({ status: res.status, body: await res.text(), headers: [...res.headers.entries()].sort() });

describe.skipIf(!process.env.S3_BUCKET)("public share link route (T9.06)", () => {
  let auth: Awaited<ReturnType<typeof connectAsAuth>>;
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let adminCtx: { org_id: string; user_id: string; role: string; see_all: string };
  let rep: string;
  let repId: string;
  let quote: string;
  let contact: string;
  let fileId: string;
  const BYTES = "%PDF-1.4 the shared quote";

  const mint = async () => {
    const res = await call(linksRoute, "POST", `/Quotes/${quote}/share_links`, { cookie: rep, params: { module: "Quotes", id: quote }, body: { to_contact_id: contact } });
    expect(res.status, res.body).toBe(201);
    const link = res.json().data[0];
    return { id: link.id as string, token: link.url.split("/s/")[1] as string };
  };

  beforeAll(async () => {
    [auth, app] = await Promise.all([connectAsAuth(), connectAsApp()]);
    const org = (await auth.query("SELECT id FROM orgs WHERE slug = 'saqient'")).rows[0].id;
    const a = await createSignInUser(auth, org, "admin");
    adminCtx = { org_id: org, user_id: a.id, role: "admin", see_all: "on" };
    const admin = await signIn(a.email);
    const r = await createSignInUser(auth, org, "rep");
    repId = r.id;
    rep = await signIn(r.email);
    const account = (await call(moduleRoute, "POST", "/Accounts", { cookie: rep, params: { module: "Accounts" }, body: { data: [{ Account_Name: "Route Co" }] } })).json().data[0].details.id;
    contact = (await call(moduleRoute, "POST", "/Contacts", { cookie: rep, params: { module: "Contacts" }, body: { data: [{ Last_Name: "Buyer", Mobile: "+96891234567", Account_Name: { id: account } }] } })).json().data[0].details.id;
    const product = (await call(moduleRoute, "POST", "/Products", { cookie: admin, params: { module: "Products" }, body: { data: [{ Product_Name: "Route P", Product_Code: `RT-${Date.now().toString(36)}`, VAT_Category: "standard", Unit_Price: "10.000" }] } })).json().data[0].details.id;
    await call(ratesRoute, "POST", "/settings/exchange_rates", { cookie: admin, body: { data: [{ currency: "AED", rate: "0.105", effective_from: "2026-01-01" }] } });
    quote = (await call(moduleRoute, "POST", "/Quotes", { cookie: rep, params: { module: "Quotes" }, body: { data: [{ Subject: "Route quote", Currency: "AED", Account_Name: { id: account }, Line_Items: [{ Product: { id: product }, Quantity: "1", List_Price: "10.00" }] }] } })).json().data[0].details.id;
    const ctx = (await contextForMember(getAuthDb(), repId, org))!;
    fileId = await withTenant(ctx, async (tx) => {
      const f = await createFile(tx, { kind: "quote_pdf", filename: "QT-000001.pdf", contentType: "application/pdf", record: { type: "quote", id: quote } });
      await putFile(tx, f.id, Buffer.from(BYTES));
      return f.id;
    });
  });
  afterAll(() => Promise.all([auth?.end(), app?.end(), closeQueues()]));

  it("serves the PDF with the required headers (AC-07), ignoring any query string (AC-04), and the response names no storage host, key or id (AC-09)", async () => {
    const { id, token } = await mint();
    for (const suffix of ["", "?file=other&download=1", "?token=x#fragment"]) {
      const res = await fetchShare(token, suffix);
      expect(res.status, suffix).toBe(200);
      expect(await res.clone().text()).toBe(BYTES);
      expect(Object.fromEntries(res.headers)).toMatchObject({
        "content-type": "application/pdf",
        "content-disposition": 'inline; filename="QT-000001.pdf"',
        "cache-control": "no-store, private",
        "x-robots-tag": "noindex, nofollow",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
        "content-security-policy": expect.stringContaining("default-src 'none'"),
      });
      const everything = [...res.headers.entries()].flat().join(" ");
      expect(everything).not.toMatch(/amazonaws|127\.0\.0\.1|localhost:|org\/|[0-9a-f]{8}-[0-9a-f]{4}-/);
      expect(everything).not.toContain(id);
      expect(everything).not.toContain(fileId);
    }
    expect((await queryAs(app, adminCtx, "SELECT access_count FROM share_links WHERE id = $1", [id]))[0].access_count).toBe(3);
  });

  it("AC-01: a random token, an expired link, a revoked link and a malformed token get the same 404, body and headers", async () => {
    const live = await mint();
    const revoked = await mint();
    await call(linkRoute, "DELETE", `/Quotes/${quote}/share_links/${revoked.id}`, { cookie: rep, params: { module: "Quotes", id: quote, link_id: revoked.id } });
    const expiredToken = "E".repeat(43);
    await queryAs(app, adminCtx, `INSERT INTO share_links (id, org_id, file_id, record_type, record_id, token_hash, created_at, expires_at, created_by)
      SELECT gen_random_uuid(), org_id, file_id, record_type, record_id, $1, now() - interval '8 days', now() - interval '1 second', created_by FROM share_links WHERE id = $2`, [hashShareToken(expiredToken), live.id]);
    const answers = await Promise.all([fetchShare("R".repeat(43)), fetchShare(expiredToken), fetchShare(revoked.token), fetchShare("short"), fetchShare(live.token + "%2F..")].map(async (p) => snapshot(await p)));
    for (const a of answers) expect(a).toEqual(answers[0]);
    expect(answers[0]!.status).toBe(404);
    expect(answers[0]!.body).toContain("expired");
  });

  it("AC-03: a revoked link is a 404 on the very next request", async () => {
    const { id, token } = await mint();
    expect((await fetchShare(token)).status).toBe(200);
    await call(linkRoute, "DELETE", `/Quotes/${quote}/share_links/${id}`, { cookie: rep, params: { module: "Quotes", id: quote, link_id: id } });
    expect((await fetchShare(token)).status).toBe(404);
  });

  it("AC-05: re-rendering the document does not change what an existing link serves", async () => {
    const { token } = await mint();
    const ctx = (await contextForMember(getAuthDb(), repId, adminCtx.org_id))!;
    await withTenant(ctx, async (tx) => {
      const f = await createFile(tx, { kind: "quote_pdf", filename: "QT-000001.pdf", contentType: "application/pdf", record: { type: "quote", id: quote } });
      await putFile(tx, f.id, Buffer.from("%PDF-1.4 a newer render"));
    });
    expect(await (await fetchShare(token)).text()).toBe(BYTES);
  });

  it("AC-08: a link stops working one second after expires_at", async () => {
    const live = await mint();
    const token = "T".repeat(43);
    await queryAs(app, adminCtx, `INSERT INTO share_links (id, org_id, file_id, record_type, record_id, token_hash, created_at, expires_at, created_by)
      SELECT gen_random_uuid(), org_id, file_id, record_type, record_id, $1, now() - interval '1 day', now() + interval '1500 milliseconds', created_by FROM share_links WHERE id = $2`, [hashShareToken(token), live.id]);
    expect((await fetchShare(token)).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 2600)); // expires_at + 1 s
    expect((await fetchShare(token)).status).toBe(404);
  });

  it("AC-06: the log lines from opening, missing and expired links hold the link id and never the token", async () => {
    const { id, token } = await mint();
    const lines: string[] = [];
    const capture = createLogger({ write: (line: string) => lines.push(line) }); // what the real logger would print, after redaction
    const spies = (["info", "warn", "error"] as const).map((level) => vi.spyOn(log, level).mockImplementation(((...args: unknown[]) => (capture[level] as (...a: unknown[]) => void)(...args)) as never));
    try {
      expect((await fetchShare(token, "?utm=whatsapp")).status).toBe(200);
      const missing = "M".repeat(43);
      expect((await fetchShare(missing)).status).toBe(404);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    const out = lines.join("\n");
    expect(out).toContain(id);
    expect(out).toContain("/s/[redacted]");
    expect(out).not.toContain(token);
    expect(out).not.toContain("M".repeat(43));
    expect(out).not.toContain("utm=whatsapp");
  });
});
