import { muscatToday } from "@crm/core";
import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as recordRoute from "../app/api/v1/[module]/[id]/route";
import * as moduleRoute from "../app/api/v1/[module]/route";
import * as pipelineRoute from "../app/api/v1/settings/pipeline/route";
import * as ratesRoute from "../app/api/v1/settings/exchange_rates/route";
import { call, createSignInUser, signIn } from "./api.ts";

// T6.04 (US-09): deals in AED and INR keep the rate captured when they were created or their currency last changed.
describe("deals in AED and INR (T6.04)", () => {
  let auth: Awaited<ReturnType<typeof connectAsAuth>>;
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let admin: string;
  let rep: string;
  let ctx: { org_id: string; user_id: string; role: string; see_all: string };
  let account: string;
  let stage: string;

  const create = (Currency: string) => call(moduleRoute, "POST", "/Deals", { cookie: rep, params: { module: "Deals" }, body: { data: [{
    Deal_Name: `FX ${Currency}`, Account_Name: { id: account }, Amount: "1000.000", Closing_Date: "2026-12-31", Stage: { id: stage }, Currency }] } });
  const read = async (id: string) => (await call(recordRoute, "GET", `/Deals/${id}`, { cookie: rep, params: { module: "Deals", id } })).json().data[0];
  const rate = (currency: string, rate: string, effective_from: string) =>
    call(ratesRoute, "POST", "/settings/exchange_rates", { cookie: admin, body: { data: [{ currency, rate, effective_from }] } });

  beforeAll(async () => {
    [auth, app] = await Promise.all([connectAsAuth(), connectAsApp()]);
    const { rows } = await auth.query("SELECT id FROM orgs WHERE slug = 'saqient'");
    const user = await createSignInUser(auth, rows[0].id, "admin");
    ctx = { org_id: rows[0].id, user_id: user.id, role: "admin", see_all: "on" };
    admin = await signIn(user.email);
    rep = await signIn((await createSignInUser(auth, rows[0].id, "rep")).email);
    account = (await call(moduleRoute, "POST", "/Accounts", { cookie: rep, params: { module: "Accounts" }, body: { data: [{ Account_Name: "FX Account" }] } })).json().data[0].details.id;
    stage = (await call(pipelineRoute, "GET", "/settings/pipeline", { cookie: rep })).json().data[0].stages[0].id;
  });
  afterAll(() => Promise.all([auth?.end(), app?.end()]));

  it("INR with no rate is blocked with a clear message; an OMR deal still works", async () => {
    const res = await create("INR");
    expect(res.status).toBe(422);
    expect(res.json()).toMatchObject({ code: "NO_EFFECTIVE_RATE", message: expect.stringContaining("INR") });
    expect((await create("OMR")).status).toBe(201);
  });

  it("an AED deal stores the rate; a later rate change leaves it; a currency change re-captures", async () => {
    expect((await rate("AED", "0.105", "2026-01-01")).status).toBe(201);
    const id = (await create("AED")).json().data[0].details.id;
    expect(await read(id)).toMatchObject({ Currency: "AED", Exchange_Rate: "0.10500000" });
    const [row] = await queryAs(app, ctx, "SELECT amount_omr, currency_scale FROM deals WHERE id = $1", [id]);
    expect(row).toMatchObject({ amount_omr: "105.000", currency_scale: 2 });

    expect((await rate("AED", "0.2", muscatToday())).status).toBe(201);
    const [after] = await queryAs(app, ctx, "SELECT amount_omr, exchange_rate FROM deals WHERE id = $1", [id]);
    expect(after).toMatchObject({ amount_omr: "105.000", exchange_rate: "0.10500000" });

    expect((await rate("INR", "0.0046", "2026-01-01")).status).toBe(201);
    const put = await call(recordRoute, "PUT", `/Deals/${id}`, { cookie: rep, params: { module: "Deals", id }, body: { data: [{ Currency: "INR", version: 1 }] } });
    expect(put.status).toBe(200);
    expect(await read(id)).toMatchObject({ Currency: "INR", Exchange_Rate: "0.00460000" });
  });

  it("a client cannot set Exchange_Rate", async () => {
    const id = (await create("AED")).json().data[0].details.id;
    const put = await call(recordRoute, "PUT", `/Deals/${id}`, { cookie: rep, params: { module: "Deals", id }, body: { data: [{ Exchange_Rate: "9", version: 1 }] } });
    expect(put.status).toBe(422); // read-only, like every system-computed field
    expect((await read(id)).Exchange_Rate).toBe("0.20000000");
  });
});
