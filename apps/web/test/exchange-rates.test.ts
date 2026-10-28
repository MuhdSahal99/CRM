import { exchangeRateFor, muscatToday, NoEffectiveRate, withTenant } from "@crm/core";
import { connectAsAuth } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as currenciesRoute from "../app/api/v1/settings/currencies/route";
import * as ratesRoute from "../app/api/v1/settings/exchange_rates/route";
import { call, createSignInUser, signIn } from "./api.ts";

// T6.03: exchange rates (US-09). A fresh org is used so "no rate yet" is true for INR.
describe("exchange rates (T6.03)", () => {
  let auth: Awaited<ReturnType<typeof connectAsAuth>>;
  let tenant: { orgId: string; userId: string; role: "admin"; visibleOwnerIds: string[]; seeAll: true };
  let admin: string;
  let rep: string;

  beforeAll(async () => {
    auth = await connectAsAuth();
    const { rows } = await auth.query("SELECT id FROM orgs WHERE slug = 'demo'");
    const user = await createSignInUser(auth, rows[0].id, "admin");
    tenant = { orgId: rows[0].id, userId: user.id, role: "admin", visibleOwnerIds: [user.id], seeAll: true };
    admin = await signIn(user.email);
    rep = await signIn((await createSignInUser(auth, rows[0].id, "rep")).email);
  });
  afterAll(() => auth?.end());

  it("U: today is the Asia/Muscat date, not the UTC one", () => {
    expect(muscatToday(new Date("2026-03-01T19:59:00Z"))).toBe("2026-03-01");
    expect(muscatToday(new Date("2026-03-01T20:00:00Z"))).toBe("2026-03-02");
  });

  it("AC-35: a rep POST is 403", async () => {
    const body = { data: [{ currency: "AED", rate: "0.105", effective_from: "2026-01-01" }] };
    expect((await call(ratesRoute, "POST", "/settings/exchange_rates", { cookie: rep, body })).status).toBe(403);
  });

  it("with no AED rate the lookup is NoEffectiveRate; after 1 AED = 0.105 it returns 0.10500000, and OMR is 1", async () => {
    const lookup = (c: string, on?: string) => withTenant(tenant, (tx) => exchangeRateFor(tx, c, on));
    await expect(lookup("AED")).rejects.toBeInstanceOf(NoEffectiveRate);
    const post = await call(ratesRoute, "POST", "/settings/exchange_rates", { cookie: admin, body: { data: [{ currency: "AED", rate: "0.105", effective_from: "2026-01-01" }] } });
    expect(post.status).toBe(201);
    expect(await lookup("AED")).toBe("0.10500000");
    await expect(lookup("AED", "2025-12-31")).rejects.toBeInstanceOf(NoEffectiveRate);
    expect(await lookup("OMR")).toBe("1.00000000");
    const dup = await call(ratesRoute, "POST", "/settings/exchange_rates", { cookie: admin, body: { data: [{ currency: "AED", rate: "0.2", effective_from: "2026-01-01" }] } });
    expect(dup.status).toBe(422);
  });

  it("lists the history and the currencies with their current rate; OMR cannot be given a rate", async () => {
    const listRes = await call(ratesRoute, "GET", "/settings/exchange_rates?currency=AED", { cookie: rep });
    const list = listRes.json();
    expect(listRes.status, listRes.body).toBe(200);
    expect(list.data[0]).toMatchObject({ currency: "AED", rate: "0.10500000", effective_from: "2026-01-01" });
    expect(list.info.count).toBe(1);
    const cur = (await call(currenciesRoute, "GET", "/settings/currencies", { cookie: rep })).json().data;
    expect(cur.map((c: { code: string }) => c.code)).toEqual(["OMR", "AED", "INR"]);
    expect(cur.find((c: { code: string }) => c.code === "AED")).toMatchObject({ current_rate: "0.10500000", current_rate_effective_from: "2026-01-01", scale: 2 });
    expect(cur.find((c: { code: string }) => c.code === "INR").current_rate).toBeNull();
    const omr = await call(ratesRoute, "POST", "/settings/exchange_rates", { cookie: admin, body: { data: [{ currency: "OMR", rate: "1", effective_from: "2026-01-01" }] } });
    expect(omr.status).toBe(422);
  });
});
