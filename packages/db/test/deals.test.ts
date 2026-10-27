import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsApp, connectAsAuth, createMember, createOrg, queryAs } from "./db";

// T5.01 to T5.03: pipelines, stages, currencies, deals and the stage rules (US-07). RLS/FORCE are checked by rls.test.ts.
describe("deals tables (T5.01-T5.03)", () => {
  let app: pg.Client;
  let org: string;
  const admin = {} as Record<string, string>;
  const repA = {} as Record<string, string>;
  const repB = {} as Record<string, string>;
  const stage: Record<string, string> = {};
  let account: string;

  beforeAll(async () => {
    app = await connectAsApp();
    const auth = await connectAsAuth();
    org = await createOrg(auth);
    const adminId = await createMember(auth, org, "admin");
    const manager = await createMember(auth, org, "manager");
    const [a, b] = [await createMember(auth, org, "rep", manager), await createMember(auth, org, "rep", manager)];
    await auth.end();
    Object.assign(admin, { org_id: org, user_id: adminId, role: "admin", see_all: "on" });
    Object.assign(repA, { org_id: org, user_id: a, role: "rep", visible_owner_ids: a });
    Object.assign(repB, { org_id: org, user_id: b, role: "rep", visible_owner_ids: b });
    await queryAs(app, admin, `INSERT INTO currencies (org_id, code, scale, is_base) VALUES (app.org_id(), 'OMR', 3, true), (app.org_id(), 'AED', 2, false)`);
    const [{ id: pipeline }] = await queryAs(app, admin, `INSERT INTO pipelines (id, org_id, name, is_default) VALUES (gen_random_uuid(), app.org_id(), 'Standard', true) RETURNING id`);
    for (const [i, [name, prob, cat, fc]] of ([["Qualification", 10, "open", "pipeline"], ["Proposal/Price Quote", 75, "open", "best_case"], ["Closed Won", 100, "closed_won", "closed"], ["Closed Lost", 0, "closed_lost", "omitted"]] as const).entries()) {
      const [row] = await queryAs(app, admin, `INSERT INTO stages (id, org_id, pipeline_id, name_key, api_value, sort_order, probability, record_category, forecast_category)
        VALUES (gen_random_uuid(), app.org_id(), $1, $2, $3, $4, $5, $6, $7) RETURNING id`, [pipeline, `stages.${i}`, name, i + 1, prob, cat, fc]);
      stage[name] = row.id;
    }
    [{ id: account }] = await queryAs(app, repA, `INSERT INTO accounts (id, org_id, owner_id, account_name) VALUES (gen_random_uuid(), app.org_id(), $1, 'A') RETURNING id`, [a]);
  });
  afterAll(() => app?.end());

  const deal = (c: Record<string, string>, stageName: string, { amount = "10000.000", currency = "OMR", rate = "1", scale = 3, extra = "" } = {}) =>
    queryAs(app, c, `INSERT INTO deals (id, org_id, owner_id, deal_name, account_id, amount, currency, currency_scale, exchange_rate, closing_date, stage_id ${extra ? ", " + extra.split("=")[0] : ""})
      VALUES (gen_random_uuid(), app.org_id(), $1, 'D', $2, $3, $4, $5, $6, '2026-12-31', $7 ${extra ? ", " + extra.split("=")[1] : ""}) RETURNING *`,
      [c.user_id, account, amount, currency, scale, rate, stage[stageName]]).then((r) => r[0]);

  it("a second default pipeline in the same org is refused", async () => {
    await expect(queryAs(app, admin, `INSERT INTO pipelines (id, org_id, name, is_default) VALUES (gen_random_uuid(), app.org_id(), 'Other', true)`)).rejects.toThrow(/pipelines_one_default_key/);
  });

  it("a rep cannot change the pipeline set-up", async () => {
    await expect(queryAs(app, repA, `UPDATE stages SET probability = 1`)).resolves.toEqual([]);
    expect((await queryAs(app, repA, `SELECT probability FROM stages WHERE api_value = 'Qualification'`))[0].probability).toBe(10);
  });

  it("amount_omr equals amount for OMR and converts by the rate otherwise; expected revenue rounds half-up to the currency scale", async () => {
    const omr = await deal(repA, "Qualification");
    expect(omr.amount_omr).toBe("10000.000");
    expect(omr.expected_revenue).toBe("1000.000");
    const aed = await deal(repA, "Qualification", { amount: "1.005", currency: "AED", scale: 2, rate: "0.10500000" });
    expect(aed.amount_omr).toBe("0.106"); // 1.005 * 0.105 = 0.105525 -> 0.106
    expect(aed.expected_revenue).toBe("0.100"); // 1.005 * 10 / 100 = 0.1005 -> 0.10 at scale 2
    const half = await deal(repA, "Qualification", { amount: "0.250", currency: "AED", scale: 2, rate: "0.10500000" });
    expect(half.expected_revenue).toBe("0.030"); // 0.025 -> 0.03 (half-up)
  });

  it("moving Qualification to Proposal sets probability 75, Expected Revenue 7,500.000 and writes history", async () => {
    const d = await deal(repA, "Qualification");
    const [moved] = await queryAs(app, repA, `UPDATE deals SET stage_id = $2 WHERE id = $1 RETURNING probability, expected_revenue, forecast_category`, [d.id, stage["Proposal/Price Quote"]]);
    expect(moved).toEqual({ probability: 75, expected_revenue: "7500.000", forecast_category: "best_case" });
    const history = await queryAs(app, repA, `SELECT stage_id FROM deal_stage_history WHERE deal_id = $1 ORDER BY changed_at, stage_id`, [d.id]);
    expect(history.map((h) => h.stage_id).sort()).toEqual([stage["Qualification"], stage["Proposal/Price Quote"]].sort());
  });

  it("Closed Lost without a reason raises; with one it closes the deal", async () => {
    const d = await deal(repA, "Qualification");
    await expect(queryAs(app, repA, `UPDATE deals SET stage_id = $2 WHERE id = $1`, [d.id, stage["Closed Lost"]])).rejects.toThrow(/reason_for_loss is required/);
    const [lost] = await queryAs(app, repA, `UPDATE deals SET stage_id = $2, reason_for_loss = 'Price' WHERE id = $1 RETURNING closed_at`, [d.id, stage["Closed Lost"]]);
    expect(lost.closed_at).not.toBeNull();
  });

  it("Closed Won sets 100, forecast category closed and closed_at", async () => {
    const d = await deal(repA, "Qualification");
    const [won] = await queryAs(app, repA, `UPDATE deals SET stage_id = $2 WHERE id = $1 RETURNING probability, forecast_category, closed_at`, [d.id, stage["Closed Won"]]);
    expect(won).toMatchObject({ probability: 100, forecast_category: "closed" });
    expect(won.closed_at).not.toBeNull();
  });

  it("private to the owner: rep B sees neither the deal nor its history; a stage of another org is refused", async () => {
    const d = await deal(repA, "Qualification");
    expect(await queryAs(app, repB, `SELECT id FROM deals WHERE id = $1`, [d.id])).toEqual([]);
    expect(await queryAs(app, repB, `SELECT id FROM deal_stage_history WHERE deal_id = $1`, [d.id])).toEqual([]);
    const auth = await connectAsAuth();
    const other = await createOrg(auth);
    const outsider = await createMember(auth, other, "admin");
    await auth.end();
    const [{ id: foreign }] = await queryAs(app, { org_id: other, user_id: outsider, role: "admin", see_all: "on" }, `INSERT INTO accounts (id, org_id, owner_id, account_name) VALUES (gen_random_uuid(), app.org_id(), $1, 'X') RETURNING id`, [outsider]);
    await expect(queryAs(app, repA, `UPDATE deals SET account_id = $2 WHERE id = $1`, [d.id, foreign])).rejects.toThrow();
  });
});
