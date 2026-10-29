import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedPerf } from "../src/seed-perf";
import { connectAsApp, connectAsAuth, createMember, createOrg, queryAs } from "./db";

// T11.11: the performance seed adds exactly what it is asked, only in the org it is given, and a re-run adds nothing.
describe("seedPerf (T11.11)", () => {
  let app: pg.Client;
  let org: string;
  let user: string;
  const counts = { accounts: 30, contacts: 20, leads: 10, deals: 12 };

  beforeAll(async () => {
    app = await connectAsApp();
    const auth = await connectAsAuth();
    org = await createOrg(auth);
    user = await createMember(auth, org, "admin");
    await auth.end();
    const admin = { org_id: org, user_id: user, role: "admin", see_all: "on" };
    await queryAs(app, admin, "INSERT INTO currencies (org_id, code, scale, is_base) VALUES (app.org_id(), 'OMR', 3, true)");
    const [{ id }] = await queryAs(app, admin, "INSERT INTO pipelines (id, org_id, name, is_default) VALUES (gen_random_uuid(), app.org_id(), 'Standard', true) RETURNING id");
    await queryAs(app, admin, "INSERT INTO stages (id, org_id, pipeline_id, name_key, api_value, sort_order, probability, record_category, forecast_category) VALUES (gen_random_uuid(), app.org_id(), $1, 's', 'Qualification', 1, 10, 'open', 'pipeline')", [id]);
  });
  afterAll(() => app?.end());

  it("adds the requested records, linked to each other, and a second run adds none", async () => {
    expect(await seedPerf(app, { orgId: org, userId: user }, counts)).toEqual(counts);
    const admin = { org_id: org, user_id: user, role: "admin", see_all: "on" };
    const n = async (table: string) => Number((await queryAs(app, admin, `SELECT count(*) AS n FROM ${table} WHERE zoho_id LIKE 'perf-%'`))[0].n);
    expect([await n("accounts"), await n("contacts"), await n("leads"), await n("deals")]).toEqual([30, 20, 10, 12]);
    expect(Number((await queryAs(app, admin, "SELECT count(DISTINCT account_id) AS n FROM contacts WHERE zoho_id LIKE 'perf-%'"))[0].n)).toBe(20);
    expect(await seedPerf(app, { orgId: org, userId: user }, counts)).toEqual({ accounts: 0, contacts: 0, leads: 0, deals: 0 });
  });

  it("writes nothing for another org's context", async () => {
    const auth = await connectAsAuth();
    const other = await createOrg(auth);
    await auth.end();
    await expect(seedPerf(app, { orgId: other, userId: user }, counts)).rejects.toThrow(); // the owner is not a member of that org (composite FK)
  });

  it("refuses to run in production", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await expect(seedPerf(app, { orgId: org, userId: user }, counts)).rejects.toThrow(/production/);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
