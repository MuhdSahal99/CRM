import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { beforeAll, describe, expect, it } from "vitest";
import * as recordRoute from "../app/api/v1/[module]/[id]/route";
import * as relatedRoute from "../app/api/v1/[module]/[id]/[related_list]/route";
import * as timelineRoute from "../app/api/v1/[module]/[id]/timeline/route";
import * as moduleRoute from "../app/api/v1/[module]/route";
import * as searchRoute from "../app/api/v1/[module]/search/route";
import * as kanbanRoute from "../app/api/v1/Deals/kanban/route";
import * as pipelineRoute from "../app/api/v1/settings/pipeline/route";
import { call, signIn } from "./api.ts";

// T5.01 to T5.06: Deals through the module registry, private to the owner and their managers (US-02, US-07).
describe("Deals API", () => {
  let repA: string;
  let repB: string;
  let manager: string;
  let shared: string;
  let pipeline: { id: string; stages: { id: string; api_value: string }[] };
  const stageId = (name: string) => pipeline.stages.find((s) => s.api_value === name)!.id;

  beforeAll(async () => {
    [repA, repB, manager] = await Promise.all(["rep.a", "rep.b", "manager"].map((u) => signIn(`${u}@saqient.test`)));
    pipeline = (await call(pipelineRoute, "GET", "/settings/pipeline", { cookie: repA })).json().data[0];
    shared = await account(repA, "Deals Shared Parent");
  });

  const create = (cookie: string, record: Record<string, unknown>) => call(moduleRoute, "POST", "/Deals", { cookie, params: { module: "Deals" }, body: { data: [record] } });
  const get = (cookie: string, id: string) => call(recordRoute, "GET", `/Deals/${id}`, { cookie, params: { module: "Deals", id } });
  const update = (cookie: string, id: string, changes: Record<string, unknown>) =>
    call(recordRoute, "PUT", `/Deals/${id}`, { cookie, params: { module: "Deals", id }, body: { data: [changes] } });
  const account = async (cookie: string, name: string) =>
    (await call(moduleRoute, "POST", "/Accounts", { cookie, params: { module: "Accounts" }, body: { data: [{ Account_Name: name }] } })).json().data[0].details.id as string;
  const deal = async (cookie: string, accountId: string, extra: Record<string, unknown> = {}) => {
    const res = await create(cookie, { Deal_Name: "Uniq Deal", Account_Name: { id: accountId }, Amount: "10000.000", Closing_Date: "2026-12-31", Stage: { id: stageId("Qualification") }, ...extra });
    expect(res.status, res.body).toBe(201);
    return res.json().data[0].details.id as string;
  };

  it("T5.01: GET /settings/pipeline returns the one seeded pipeline with ordered stages", async () => {
    const res = (await call(pipelineRoute, "GET", "/settings/pipeline", { cookie: repB })).json().data;
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ name: "Standard", is_default: true });
    expect(res[0].stages.map((s: { api_value: string }) => s.api_value).slice(0, 2)).toEqual(["Qualification", "Needs Analysis"]);
    expect(res[0].stages.find((s: { api_value: string }) => s.api_value === "Proposal/Price Quote")).toMatchObject({ probability: 75, name_key: "stages.proposal_price_quote" });
  });

  it("T5.04: a deal defaults its probability and pipeline from the stage; rep B gets 404, the manager 200", async () => {
    const acc = shared;
    const id = await deal(repA, acc);
    expect((await get(repA, id)).json().data[0]).toMatchObject({
      Deal_Name: "Uniq Deal", Probability: 10, Stage: { id: stageId("Qualification"), name: "Qualification" }, Pipeline: { id: pipeline.id, name: "Standard" },
      Account_Name: { id: acc }, Amount: "10000.000", Expected_Revenue: "1000.000", Forecast_Category: "pipeline",
    });
    expect((await get(repB, id)).status).toBe(404);
    expect((await get(manager, id)).status).toBe(200);
    expect((await call(moduleRoute, "GET", "/Deals", { cookie: repB, params: { module: "Deals" } })).json().data.map((d: { id: string }) => d.id)).not.toContain(id);
  });

  it("AC-11: rep B's search by deal name finds nothing while Accounts are still found", async () => {
    const acc = await account(repA, "Zeta Parent Co");
    await deal(repA, acc, { Deal_Name: "Zeta Deal Quux" });
    const search = (cookie: string, module: string, word: string) => call(searchRoute, "GET", `/${module}/search?word=${encodeURIComponent(word)}`, { cookie, params: { module } });
    expect((await search(repA, "Deals", "Quux")).json().data.length).toBeGreaterThan(0);
    expect((await search(repB, "Deals", "Quux")).json().data).toEqual([]);
    expect((await search(repB, "Accounts", "Zeta Parent")).json().data.length).toBeGreaterThan(0);
  });

  it("AC-13: an account from another org is a 422", async () => {
    const demo = await signIn("rep@demo.test");
    const foreign = await account(demo, "Demo Only");
    const res = await create(repA, { Deal_Name: "X", Account_Name: { id: foreign }, Closing_Date: "2026-12-31", Stage: { id: stageId("Qualification") } });
    expect(res.status).toBe(422);
    expect(res.json().details.api_name).toBe("Account_Name");
  });

  it("US-07: moving to Proposal updates probability and expected revenue and writes stage_changed", async () => {
    const id = await deal(repA, shared);
    const v = (await get(repA, id)).json().data[0].version;
    expect((await update(repA, id, { version: v, Stage: { id: stageId("Proposal/Price Quote") } })).status).toBe(200);
    expect((await get(repA, id)).json().data[0]).toMatchObject({ Probability: 75, Expected_Revenue: "7500.000", Forecast_Category: "best_case" });
    const events = (await call(timelineRoute, "GET", `/Deals/${id}/timeline`, { cookie: repA, params: { module: "Deals", id } })).json().data;
    expect(events.map((e: { event_type: string }) => e.event_type)).toEqual(expect.arrayContaining(["created", "stage_changed"]));
  });

  it("US-07: Closed Lost without a reason is a field-level 422; with one it closes; Closed Won sets 100", async () => {
    const id = await deal(repA, shared);
    let v = (await get(repA, id)).json().data[0].version;
    const bad = await update(repA, id, { version: v, Stage: { id: stageId("Closed Lost") } });
    expect(bad.status).toBe(422);
    expect(bad.json().details.api_name).toBe("Reason_For_Loss");
    expect((await get(repA, id)).json().data[0].Stage.name).toBe("Qualification");
    expect((await update(repA, id, { version: v, Stage: { id: stageId("Closed Lost") }, Reason_For_Loss: "Price" })).status).toBe(200);
    v = (await get(repA, id)).json().data[0].version;
    expect((await update(repA, id, { version: v, Stage: { id: stageId("Closed Won") } })).status).toBe(200);
    expect((await get(repA, id)).json().data[0]).toMatchObject({ Probability: 100, Forecast_Category: "closed" });
  });

  it("T5.05: the Kanban totals come from the server and follow visibility", async () => {
    await deal(repA, shared, { Amount: "250.500" });
    type Column = { stage: { api_value: string }; count: number; sum_amount_omr: string; deals: unknown[] };
    const qualification = async (cookie: string) =>
      ((await call(kanbanRoute, "GET", `/Deals/kanban?pipeline_id=${pipeline.id}`, { cookie })).json().data as Column[]).find((c) => c.stage.api_value === "Qualification")!;
    const [a, b, m] = [await qualification(repA), await qualification(repB), await qualification(manager)];
    expect(a.count).toBeGreaterThan(0);
    expect(Number(a.sum_amount_omr)).toBeGreaterThanOrEqual(250.5);
    expect(a.sum_amount_omr).toMatch(/^\d+\.\d{3}$/);
    expect(b).toMatchObject({ count: 0, sum_amount_omr: "0.000", deals: [] });
    expect(m.count).toBeGreaterThanOrEqual(a.count); // the manager sees the team
    expect((await call(kanbanRoute, "GET", `/Deals/kanban?pipeline_id=${crypto.randomUUID()}`, { cookie: repA })).status).toBe(404);
  });

  it("AC-17 (T5.06): rep B listing an account's Deals gets an empty list for rep A's deals; rep A and a manager see them", async () => {
    const acc = await account(repA, "Related Deals Parent");
    const id = await deal(repA, acc);
    const related = (cookie: string) => call(relatedRoute, "GET", `/Accounts/${acc}/Deals`, { cookie, params: { module: "Accounts", id: acc, related_list: "Deals" } });
    expect((await related(repB)).json()).toMatchObject({ data: [], info: { count: 0 } });
    expect((await related(repA)).json().data.map((d: { id: string }) => d.id)).toEqual([id]);
    expect((await related(manager)).json().data).toHaveLength(1);
  });

  it.each(["Amount", "Probability"])("when a role cannot see %s: the Kanban total is null and Expected_Revenue is hidden", async (hidden) => {
    const [auth, app] = [await connectAsAuth(), await connectAsApp()];
    const { rows } = await auth.query(`SELECT user_id, org_id FROM member WHERE role = 'admin' AND org_id = (SELECT org_id FROM member m JOIN "user" u ON u.id = m.user_id WHERE u.email = 'admin@saqient.test') LIMIT 1`);
    await auth.end();
    const admin = { org_id: rows[0].org_id, user_id: rows[0].user_id, role: "admin", see_all: "on" };
    const set = (access: string) => queryAs(app, admin, `INSERT INTO field_permissions (org_id, field_id, role, access)
      SELECT app.org_id(), f.id, 'rep', $1 FROM fields f JOIN modules m ON m.id = f.module_id WHERE m.api_name = 'Deals' AND f.api_name = $2
      ON CONFLICT (org_id, field_id, role) DO UPDATE SET access = EXCLUDED.access`, [access, hidden]);
    const board = async () => (await call(kanbanRoute, "GET", `/Deals/kanban?pipeline_id=${pipeline.id}`, { cookie: repA })).json().data as { sum_amount_omr: string | null; deals: object[] }[];
    await set("hidden");
    try {
      const columns = await board();
      if (hidden === "Amount") expect(columns.every((c) => c.sum_amount_omr === null)).toBe(true);
      const list = (await call(moduleRoute, "GET", "/Deals", { cookie: repA, params: { module: "Deals" } })).json().data[0];
      expect(Object.keys(list)).not.toContain(hidden);
      expect(Object.keys(list)).not.toContain("Expected_Revenue"); // derived from Amount and Probability
      expect(columns.flatMap((c) => c.deals).every((d) => !(hidden in d) && !("Expected_Revenue" in d))).toBe(true);
    } finally {
      await set("read_write");
      await app.end();
    }
    expect((await board()).every((c) => c.sum_amount_omr !== null)).toBe(true);
  });
});
