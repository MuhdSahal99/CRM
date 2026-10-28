import { connectAsApp, connectAsAuth, createMember, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as transferRoute from "../app/api/v1/users/[id]/actions/transfer/route";
import { call, signIn } from "./api.ts";

// T5.10 (US-03): transferring a user's open records. Uses members created here, never the seeded reps.
describe("transfer ownership (T5.10)", () => {
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let org: string;
  let from: string;
  let to: string;
  let admin: string;
  let rep: string;
  const ctx = (user: string) => ({ org_id: org, user_id: user, role: "rep", visible_owner_ids: user });
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    app = await connectAsApp();
    const auth = await connectAsAuth();
    org = (await auth.query("SELECT id FROM orgs WHERE slug = 'saqient'")).rows[0].id;
    [from, to] = [await createMember(auth, org, "rep"), await createMember(auth, org, "rep")];
    await auth.end();
    [admin, rep] = [await signIn("admin@saqient.test"), await signIn("rep.a@saqient.test")];
    const own = (sql: string, params: unknown[] = []) => queryAs(app, ctx(from), sql, params).then((r) => r[0].id as string);
    const stage = (name: string) => `(SELECT id FROM stages WHERE api_value = '${name}')`;
    const account = await own(`INSERT INTO accounts (id, org_id, owner_id, account_name) VALUES (gen_random_uuid(), app.org_id(), $1, 'Transfer Co') RETURNING id`, [from]);
    ids.openLead = await own(`INSERT INTO leads (id, org_id, owner_id, last_name, company) VALUES (gen_random_uuid(), app.org_id(), $1, 'Open', 'Co') RETURNING id`, [from]);
    ids.convertedLead = await own(`INSERT INTO leads (id, org_id, owner_id, last_name, company, is_converted, converted_at) VALUES (gen_random_uuid(), app.org_id(), $1, 'Done', 'Co', true, now()) RETURNING id`, [from]);
    const deal = (stageName: string, extra = "") => `INSERT INTO deals (id, org_id, owner_id, deal_name, account_id, currency, currency_scale, exchange_rate, closing_date, stage_id ${extra ? ", reason_for_loss" : ""})
      VALUES (gen_random_uuid(), app.org_id(), $1, 'D', $2, 'OMR', 3, 1, '2026-12-31', ${stage(stageName)} ${extra}) RETURNING id`;
    ids.openDeal = await own(deal("Qualification"), [from, account]);
    ids.wonDeal = await own(deal("Closed Won"), [from, account]);
    const quote = (stageName: string) => `INSERT INTO quotes (id, org_id, owner_id, subject, account_id, currency, currency_scale, exchange_rate, sub_total, vat_total, grand_total, vat_total_omr, grand_total_omr, quote_number, quote_stage)
      VALUES (gen_random_uuid(), app.org_id(), $1, 'Q', $2, 'OMR', 3, 1, 0, 0, 0, 0, 0, 'T-' || left(gen_random_uuid()::text, 8), '${stageName}') RETURNING id`;
    ids.openQuote = await own(quote("negotiation"), [from, account]);
    ids.wonQuote = await own(quote("closed_won"), [from, account]);
    const order = (status: string) => `INSERT INTO sales_orders (id, org_id, owner_id, subject, account_id, currency, currency_scale, exchange_rate, sub_total, vat_total, grand_total, vat_total_omr, grand_total_omr, so_number, status)
      VALUES (gen_random_uuid(), app.org_id(), $1, 'S', $2, 'OMR', 3, 1, 0, 0, 0, 0, 0, 'T-' || left(gen_random_uuid()::text, 8), '${status}') RETURNING id`;
    ids.openOrder = await own(order("approved"), [from, account]);
    ids.doneOrder = await own(order("delivered"), [from, account]);
    ids.openTask = await own(`INSERT INTO activities (id, org_id, owner_id, type, subject, status) VALUES (gen_random_uuid(), app.org_id(), $1, 'task', 'Open', 'Not Started') RETURNING id`, [from]);
    ids.doneTask = await own(`INSERT INTO activities (id, org_id, owner_id, type, subject, status) VALUES (gen_random_uuid(), app.org_id(), $1, 'task', 'Done', 'Completed') RETURNING id`, [from]);
  });
  afterAll(() => app?.end());

  const transfer = (cookie: string, user: string, target: string) =>
    call(transferRoute, "POST", `/users/${user}/actions/transfer`, { cookie, params: { id: user }, body: { to_user_id: target } });
  const owners = async () => Object.fromEntries((await queryAs(app, { org_id: org, role: "admin", see_all: "on" }, `
    SELECT id, owner_id FROM leads WHERE id = ANY($1) UNION ALL SELECT id, owner_id FROM deals WHERE id = ANY($1) UNION ALL SELECT id, owner_id FROM quotes WHERE id = ANY($1) UNION ALL SELECT id, owner_id FROM sales_orders WHERE id = ANY($1) UNION ALL SELECT id, owner_id FROM activities WHERE id = ANY($1)`, [Object.values(ids)]))
    .map((r) => [r.id, r.owner_id]));

  it("a rep calling it gets 403 and nothing moves", async () => {
    expect((await transfer(rep, from, to)).status).toBe(403);
    expect(Object.values(await owners()).every((o) => o === from)).toBe(true);
  });

  it("an inactive target is refused and nothing moves", async () => {
    const auth = await connectAsAuth();
    const gone = (await auth.query("SELECT user_id FROM member m JOIN \"user\" u ON u.id = m.user_id WHERE u.email = 'deactivated@saqient.test'")).rows[0].user_id;
    await auth.end();
    expect((await transfer(admin, from, gone)).status).toBe(409);
    expect(Object.values(await owners()).every((o) => o === from)).toBe(true);
  });

  it("moves every open lead, deal, quote and activity with one owner_transferred event each; closed records stay", async () => {
    const res = await transfer(admin, from, to);
    expect(res.status, res.body).toBe(200);
    expect(res.json().data).toEqual([{ module: "Leads", count: 1 }, { module: "Deals", count: 1 }, { module: "Activities", count: 1 }, { module: "Quotes", count: 1 }, { module: "Sales_Orders", count: 1 }]);
    const o = await owners();
    expect([o[ids.openLead!], o[ids.openDeal!], o[ids.openTask!], o[ids.openQuote!], o[ids.openOrder!]]).toEqual([to, to, to, to, to]);
    expect([o[ids.convertedLead!], o[ids.wonDeal!], o[ids.doneTask!], o[ids.wonQuote!], o[ids.doneOrder!]]).toEqual([from, from, from, from, from]);
    const events = await queryAs(app, { org_id: org, role: "admin", see_all: "on" }, `SELECT record_id, count(*)::int AS n FROM timeline_events WHERE event_type = 'owner_transferred' AND record_id = ANY($1) GROUP BY record_id`, [Object.values(ids)]);
    expect(events.map((e) => e.record_id).sort()).toEqual([ids.openLead, ids.openDeal, ids.openTask, ids.openQuote, ids.openOrder].sort());
    expect(events.every((e) => e.n === 1)).toBe(true);
  });
});
