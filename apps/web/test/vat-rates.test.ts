import { effectiveVatRate, withTenant } from "@crm/core";
import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as vatRoute from "../app/api/v1/settings/vat_rates/route";
import { call, createSignInUser, signIn } from "./api.ts";

// T6.02: VAT rates are append-only config with an effective date (US-08).
describe("VAT rates (T6.02)", () => {
  let auth: Awaited<ReturnType<typeof connectAsAuth>>;
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let ctx: { org_id: string; user_id: string; role: string };
  let admin: string;
  let rep: string;
  const tomorrow = new Date(Date.now() + 36 * 3600_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    [auth, app] = await Promise.all([connectAsAuth(), connectAsApp()]);
    const { rows } = await auth.query("SELECT id FROM orgs WHERE slug = 'demo'");
    const user = await createSignInUser(auth, rows[0].id, "admin");
    ctx = { org_id: rows[0].id, user_id: user.id, role: "admin" };
    admin = await signIn(user.email);
    rep = await signIn((await createSignInUser(auth, rows[0].id, "rep")).email);
  });
  afterAll(() => Promise.all([auth?.end(), app?.end()]));

  const rate = (category: string, on?: string) =>
    withTenant({ orgId: ctx.org_id, userId: ctx.user_id, role: "admin", visibleOwnerIds: [ctx.user_id], seeAll: true }, (tx) => effectiveVatRate(tx, category as "standard", on));

  it("the org starts with standard 5.0000 and zero_rated 0.0000", async () => {
    const { data } = (await call(vatRoute, "GET", "/settings/vat_rates", { cookie: rep })).json();
    expect(data.map((r: { category: string; rate: string }) => [r.category, r.rate])).toEqual(expect.arrayContaining([["standard", "5.0000"], ["zero_rated", "0.0000"]]));
  });

  it("AC-35: a rep POST is 403; an admin POST is 201 and a repeat of the same date is 422", async () => {
    const body = { data: [{ category: "standard", rate: "7", effective_from: tomorrow }] };
    expect((await call(vatRoute, "POST", "/settings/vat_rates", { cookie: rep, body })).status).toBe(403);
    expect((await call(vatRoute, "POST", "/settings/vat_rates", { cookie: admin, body })).status).toBe(201);
    expect((await call(vatRoute, "POST", "/settings/vat_rates", { cookie: admin, body })).status).toBe(422);
  });

  it("effectiveVatRate picks the latest row on or before the date: a rate dated tomorrow leaves today at 5", async () => {
    expect(await rate("standard")).toBe("5.0000");
    expect(await rate("standard", tomorrow)).toBe("7.0000");
    expect(await rate("standard", "1999-01-01").catch((e) => e.httpStatus)).toBe(422);
    expect(await rate("exempt")).toBeNull();
  });

  it("crm_app can neither UPDATE nor DELETE a rate", async () => {
    await expect(queryAs(app, ctx, "UPDATE vat_rates SET rate = 99")).rejects.toThrow(/permission denied/);
    await expect(queryAs(app, ctx, "DELETE FROM vat_rates")).rejects.toThrow(/permission denied/);
  });
});
