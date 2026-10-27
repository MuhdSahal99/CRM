import { beforeAll, describe, expect, it } from "vitest";
import * as recordRoute from "../app/api/v1/[module]/[id]/route";
import * as moduleRoute from "../app/api/v1/[module]/route";
import * as timelineRoute from "../app/api/v1/[module]/[id]/timeline/route";
import { call, signIn } from "./api.ts";

// T3.04 (US-15, AC-18): GET /{module}/{id}/timeline.
describe("timeline read API (T3.04)", () => {
  let repA: string;
  let repB: string;
  let manager: string;
  let account: string;
  let task: string;

  const create = (cookie: string, module: string, record: Record<string, unknown>) => call(moduleRoute, "POST", `/${module}`, { cookie, params: { module }, body: { data: [record] } });
  const timeline = (cookie: string, module: string, id: string) => call(timelineRoute, "GET", `/${module}/${id}/timeline`, { cookie, params: { module, id } });
  type Event = { id: string; event_type: string; actor: { id: string; name: string } | null; occurred_at: string; meta?: { subject?: string } };

  beforeAll(async () => {
    [repA, repB, manager] = await Promise.all(["rep.a", "rep.b", "manager"].map((u) => signIn(`${u}@saqient.test`)));
    account = (await create(repA, "Accounts", { Account_Name: "Timeline Co" })).json().data[0].details.id;
    await call(recordRoute, "PUT", `/Accounts/${account}`, { cookie: repA, params: { module: "Accounts", id: account }, body: { data: [{ Account_Name: "Timeline Co Ltd", version: 1 }] } });
    await create(repA, "Calls", { Subject: "Logged call", Call_Type: "Inbound", Call_Start_Time: "2026-03-01T09:00:00Z", Call_Duration_Seconds: 60, What_Id: { id: account, module: "Accounts" } });
    task = (await create(repA, "Tasks", { Subject: "Mine", What_Id: { id: account, module: "Accounts" } })).json().data[0].details.id;
  });

  it("lists field changes and linked activities, newest first, with the actor's name", async () => {
    const res = await timeline(repA, "Accounts", account);
    expect(res.status).toBe(200);
    const events: Event[] = res.json().data;
    expect(events.map((e) => e.event_type)).toEqual(["activity_logged", "activity_logged", "updated", "created"]);
    expect(events.find((e) => e.event_type === "updated")).toMatchObject({ changes: { Account_Name: ["Timeline Co", "Timeline Co Ltd"] }, actor: { name: "Rep A" } });
    expect(events.find((e) => e.meta?.subject === "Logged call")).toMatchObject({ meta: { type: "call" } });
    const times = events.map((e) => Date.parse(e.occurred_at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(res.json().info).toMatchObject({ count: 4, more_records: false });
  });

  it("pages", async () => {
    const res = await call(timelineRoute, "GET", `/Accounts/${account}/timeline?per_page=1&page=2`, { cookie: repA, params: { module: "Accounts", id: account } });
    expect(res.json()).toMatchObject({ data: [{ event_type: "activity_logged" }], info: { per_page: 1, page: 2, more_records: true } });
  });

  it("AC-18: another rep's private activity is not on a public record's timeline for me, but is for their manager", async () => {
    expect((await timeline(repB, "Accounts", account)).json().data.map((e: Event) => e.event_type)).toEqual(["updated", "created"]);
    expect((await timeline(manager, "Accounts", account)).json().data).toHaveLength(4);
  });

  it("AC-18: rep B reading the timeline of rep A's task gets the same 404 as for an id that does not exist", async () => {
    const hidden = await timeline(repB, "Tasks", task);
    expect(hidden.status).toBe(404);
    expect(hidden.body).toBe((await timeline(repB, "Tasks", crypto.randomUUID())).body);
    expect((await timeline(repA, "Tasks", task)).status).toBe(200);
    expect((await timeline(repA, "Calls", task)).status).toBe(404); // a task is not a call
  });
});
