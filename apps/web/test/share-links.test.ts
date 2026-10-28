import { createHash } from "node:crypto";
import { closeQueues, hashShareToken, TOKEN_FORMAT } from "@crm/core";
import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as moduleRoute from "../app/api/v1/[module]/route";
import * as linksRoute from "../app/api/v1/[module]/[id]/share_links/route";
import * as recordRoute from "../app/api/v1/[module]/[id]/route";
import * as linkRoute from "../app/api/v1/[module]/[id]/share_links/[link_id]/route";
import * as ratesRoute from "../app/api/v1/settings/exchange_rates/route";
import { call, createSignInUser, signIn } from "./api.ts";

// T9.05 (US-14, ADR-0009, AC-40): share links. The PDF is marked ready in SQL, so no object storage is needed here.
describe("share links (T9.05)", () => {
  let auth: Awaited<ReturnType<typeof connectAsAuth>>;
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let adminCtx: { org_id: string; user_id: string; role: string; see_all: string };
  let rep: string;
  let other: string;
  let quote: string;
  let account: string;
  let product: string;
  let mobile: string;
  let noMobile: string;

  const create = (cookie: string, id: string, body: unknown, headers?: Record<string, string>) =>
    call(linksRoute, "POST", `/Quotes/${id}/share_links`, { cookie, params: { module: "Quotes", id }, body, headers });
  const resolve = async (token: string) => queryAs(app, {}, "SELECT * FROM resolve_share_link($1)", [hashShareToken(token)]);
  const markReady = (id: string) => queryAs(app, adminCtx, "UPDATE files SET status = 'ready', size_bytes = 10, sha256 = decode(repeat('00', 32), 'hex') WHERE record_id = $1 AND status = 'pending'", [id]);

  beforeAll(async () => {
    [auth, app] = await Promise.all([connectAsAuth(), connectAsApp()]);
    const org = (await auth.query("SELECT id FROM orgs WHERE slug = 'saqient'")).rows[0].id;
    const a = await createSignInUser(auth, org, "admin");
    adminCtx = { org_id: org, user_id: a.id, role: "admin", see_all: "on" };
    const admin = await signIn(a.email);
    rep = await signIn((await createSignInUser(auth, org, "rep")).email);
    other = await signIn((await createSignInUser(auth, org, "rep")).email);
    account = (await call(moduleRoute, "POST", "/Accounts", { cookie: rep, params: { module: "Accounts" }, body: { data: [{ Account_Name: "Share Co" }] } })).json().data[0].details.id;
    const contact = async (fields: Record<string, unknown>) => (await call(moduleRoute, "POST", "/Contacts", { cookie: rep, params: { module: "Contacts" }, body: { data: [{ Last_Name: "Buyer", Account_Name: { id: account }, ...fields }] } })).json().data[0].details.id as string;
    mobile = await contact({ First_Name: "Salim", Mobile: "+96891234567" });
    noMobile = await contact({});
    product = (await call(moduleRoute, "POST", "/Products", { cookie: admin, params: { module: "Products" }, body: { data: [{ Product_Name: "Share P", Product_Code: `SH-${Date.now().toString(36)}`, VAT_Category: "standard", Unit_Price: "10.000" }] } })).json().data[0].details.id;
    await call(ratesRoute, "POST", "/settings/exchange_rates", { cookie: admin, body: { data: [{ currency: "AED", rate: "0.105", effective_from: "2026-01-01" }] } });
    quote = (await call(moduleRoute, "POST", "/Quotes", { cookie: rep, params: { module: "Quotes" }, body: { data: [{ Subject: "Share quote", Currency: "AED", Account_Name: { id: account }, Line_Items: [{ Product: { id: product }, Quantity: "1", List_Price: "10.00" }] }] } })).json().data[0].details.id;
  });
  afterAll(() => Promise.all([auth?.end(), app?.end(), closeQueues()]));

  it("202 until the PDF is stored (and the render is queued, not rolled back); 422 NO_MOBILE; another rep and an unknown contact get 404", async () => {
    const early = await create(rep, quote, { to_contact_id: mobile });
    expect(early.status).toBe(202);
    expect(await queryAs(app, adminCtx, "SELECT kind, status FROM files WHERE record_id = $1", [quote])).toMatchObject([{ kind: "quote_pdf", status: "pending" }]);
    expect((await create(rep, quote, { to_contact_id: noMobile })).status).toBe(422);
    expect((await create(rep, quote, { to_contact_id: noMobile })).json().code).toBe("NO_MOBILE");
    expect((await create(other, quote, { to_contact_id: mobile })).status).toBe(404); // rep B cannot see rep A's quote
    expect((await create(rep, quote, { to_contact_id: crypto.randomUUID() })).status).toBe(404);
    await markReady(quote);
  });

  it("creates a link: the plaintext only in the response, only its sha256 in the table, a 7-day expiry, a wa.me URL and a whatsapp_shared event", async () => {
    const res = await create(rep, quote, { to_contact_id: mobile, message: "Your quote" });
    expect(res.status, res.body).toBe(201);
    const link = res.json().data[0];
    const token = link.url.split("/s/")[1];
    expect(token).toMatch(TOKEN_FORMAT);
    expect(link.whatsapp_url).toBe(`https://wa.me/96891234567?text=${encodeURIComponent(`Your quote\n${link.url}`)}`);
    const [row] = await queryAs(app, adminCtx, "SELECT encode(token_hash, 'hex') AS hash, expires_at - created_at AS ttl, row_to_json(s)::text AS everything FROM share_links s WHERE id = $1", [link.id]);
    expect(row.hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(row.everything).not.toContain(token);
    expect(row.ttl).toMatchObject({ days: 7 });
    expect(await queryAs(app, adminCtx, "SELECT meta FROM timeline_events WHERE event_type = 'whatsapp_shared' AND record_id = $1", [quote])).toMatchObject([{ meta: { share_link_id: link.id } }]);
    const list = await call(linksRoute, "GET", `/Quotes/${quote}/share_links`, { cookie: rep, params: { module: "Quotes", id: quote } });
    expect(list.body).not.toContain(token);
    expect(list.json().data[0]).toMatchObject({ id: link.id, access_count: 0 });
    expect((await call(linksRoute, "GET", `/Quotes/${quote}/share_links`, { cookie: other, params: { module: "Quotes", id: quote } })).status).toBe(404);
  });

  it("an idempotent replay returns the link's metadata without the plaintext", async () => {
    const headers = { "idempotency-key": `link-${crypto.randomUUID()}` };
    const first = await create(rep, quote, { to_contact_id: mobile }, headers);
    const again = await create(rep, quote, { to_contact_id: mobile }, headers);
    expect(first.json().data[0].url).toBeTruthy();
    expect(again.json().data[0].url).toBeUndefined();
    expect(again.json().data[0].id).toBe(first.json().data[0].id);
    expect(again.body).not.toContain(first.json().data[0].url.split("/s/")[1]);
  });

  it("AC-40: the resolver returns at most one row with four columns, bumps the counters, and ignores a crafted session search_path", async () => {
    const link = (await create(rep, quote, { to_contact_id: mobile })).json().data[0];
    const token = link.url.split("/s/")[1];
    const rows = await resolve(token);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).toEqual(["share_link_id", "storage_key", "filename", "content_type"]);
    expect(rows[0].share_link_id).toBe(link.id);
    expect((await queryAs(app, adminCtx, "SELECT access_count, last_accessed_at FROM share_links WHERE id = $1", [link.id]))[0]).toMatchObject({ access_count: 1 });
    expect(await resolve("A".repeat(43))).toHaveLength(0); // an unknown token

    // SECURITY DEFINER, owned by crm_owner, with search_path pinned in the function itself; crm_app cannot create temp tables or schemas to shadow anything.
    const [fn] = await queryAs(app, {}, "SELECT prosecdef, proowner::regrole::text AS owner, proconfig FROM pg_proc WHERE proname = 'resolve_share_link'");
    expect(fn).toMatchObject({ prosecdef: true, owner: "crm_owner", proconfig: ["search_path=pg_catalog, public"] });
    await app.query("BEGIN");
    try {
      await app.query("SET LOCAL search_path = pg_temp, no_such_schema"); // a hostile session path: public is not even on it
      expect((await app.query("SELECT * FROM public.resolve_share_link($1)", [hashShareToken(token)])).rows).toHaveLength(1);
    } finally {
      await app.query("ROLLBACK");
    }
  });

  it("revoke ends the link on the next request, is repeatable, and logs share_link_revoked; another rep gets 404", async () => {
    const link = (await create(rep, quote, { to_contact_id: mobile })).json().data[0];
    const token = link.url.split("/s/")[1];
    const revoke = (cookie: string) => call(linkRoute, "DELETE", `/Quotes/${quote}/share_links/${link.id}`, { cookie, params: { module: "Quotes", id: quote, link_id: link.id } });
    expect((await revoke(other)).status).toBe(404);
    expect(await resolve(token)).toHaveLength(1);
    expect((await revoke(rep)).status).toBe(200);
    expect(await resolve(token)).toHaveLength(0);
    expect((await revoke(rep)).status).toBe(200);
    expect(await queryAs(app, adminCtx, "SELECT 1 FROM timeline_events WHERE event_type = 'share_link_revoked' AND meta->>'share_link_id' = $1", [link.id])).toHaveLength(1);
    expect((await call(linkRoute, "DELETE", `/Quotes/${quote}/share_links/not-a-uuid`, { cookie: rep, params: { module: "Quotes", id: quote, link_id: "not-a-uuid" } })).status).toBe(404);
  });

  it("expiry: a link past expires_at resolves to nothing, and no link may outlive 30 days (CHECK)", async () => {
    const live = (await create(rep, quote, { to_contact_id: mobile })).json().data[0];
    const insert = (token: string, createdAgo: string, expiresIn: string) => queryAs(app, adminCtx, `INSERT INTO share_links (id, org_id, file_id, record_type, record_id, token_hash, created_at, expires_at, created_by)
      SELECT gen_random_uuid(), org_id, file_id, record_type, record_id, $1, now() - $2::interval, now() + $3::interval, created_by FROM share_links WHERE id = $4`, [hashShareToken(token), createdAgo, expiresIn, live.id]);
    const [expired, fresh] = ["E".repeat(43), "F".repeat(43)];
    await insert(expired, "8 days", "-1 second");
    await insert(fresh, "1 day", "6 days");
    expect(await resolve(expired)).toHaveLength(0);
    expect(await resolve(fresh)).toHaveLength(1);
    await expect(insert("G".repeat(43), "0 seconds", "31 days")).rejects.toThrow(/share_links_ttl/);
  });

  it("a deleted document's links end with it: deleting revokes them, and the resolver ignores a deleted parent even if nothing revoked the link", async () => {
    const make = async () => {
      const id = (await call(moduleRoute, "POST", "/Quotes", { cookie: rep, params: { module: "Quotes" }, body: { data: [{ Subject: "Doomed", Currency: "AED", Account_Name: { id: account }, Line_Items: [{ Product: { id: product }, Quantity: "1", List_Price: "10.00" }] }] } })).json().data[0].details.id as string;
      await create(rep, id, { to_contact_id: mobile }); // 202: queues the render
      await markReady(id);
      const link = (await create(rep, id, { to_contact_id: mobile })).json().data[0];
      return { id, linkId: link.id as string, token: link.url.split("/s/")[1] as string };
    };
    // 1. The delete path revokes.
    const a = await make();
    expect(await resolve(a.token)).toHaveLength(1);
    expect((await call(recordRoute, "DELETE", `/Quotes/${a.id}`, { cookie: rep, params: { module: "Quotes", id: a.id } })).status).toBe(200);
    expect((await queryAs(app, adminCtx, "SELECT revoked_at FROM share_links WHERE id = $1", [a.linkId]))[0].revoked_at).not.toBeNull();
    expect(await resolve(a.token)).toHaveLength(0);
    // 2. A soft delete that skipped the API (so nothing revoked) still ends the link, and the link stays revocable afterwards.
    const b = await make();
    await queryAs(app, adminCtx, "UPDATE quotes SET deleted_at = now(), deleted_by = $2 WHERE id = $1", [b.id, adminCtx.user_id]);
    expect(await resolve(b.token)).toHaveLength(0);
    expect((await call(linkRoute, "DELETE", `/Quotes/${b.id}/share_links/${b.linkId}`, { cookie: rep, params: { module: "Quotes", id: b.id, link_id: b.linkId } })).status).toBe(200);
  });
});
