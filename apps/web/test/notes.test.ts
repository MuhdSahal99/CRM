import { beforeAll, describe, expect, it } from "vitest";
import * as relatedRoute from "../app/api/v1/[module]/[id]/[related_list]/route";
import * as moduleRoute from "../app/api/v1/[module]/route";
import * as timelineRoute from "../app/api/v1/[module]/[id]/timeline/route";
import { call, signIn } from "./api.ts";

// T3.05 (US-05): the Notes related list.
describe("notes API (T3.05)", () => {
  let repA: string;
  let repB: string;
  let demo: string;
  let account: string;

  const create = (module: string, record: Record<string, unknown>, cookie = repA) => call(moduleRoute, "POST", `/${module}`, { cookie, params: { module }, body: { data: [record] } });
  const notes = (cookie: string, module: string, id: string, method = "GET", body?: unknown) =>
    call(relatedRoute, method, `/${module}/${id}/Notes`, { cookie, params: { module, id, related_list: "Notes" }, body });

  beforeAll(async () => {
    [repA, repB, demo] = await Promise.all([signIn("rep.a@saqient.test"), signIn("rep.b@saqient.test"), signIn("rep@demo.test")]);
    account = (await create("Accounts", { Account_Name: "Noted Co" })).json().data[0].details.id;
  });

  it("adds a note to an account, lists it newest first, and the timeline shows note_added with its text", async () => {
    const add = await notes(repA, "Accounts", account, "POST", { data: [{ Note_Content: "First call went well" }] });
    expect(add.status).toBe(201);
    await notes(repB, "Accounts", account, "POST", { data: [{ Note_Content: "Second note" }] }); // accounts are public in the org
    const list = (await notes(repA, "Accounts", account)).json();
    expect(list.data.map((n: { Note_Content: string }) => n.Note_Content)).toEqual(["Second note", "First call went well"]);
    expect(list.data[1]).toMatchObject({ id: add.json().data[0].details.id, Created_By: { name: "Rep A" } });

    const events = (await call(timelineRoute, "GET", `/Accounts/${account}/timeline`, { cookie: repA, params: { module: "Accounts", id: account } })).json().data;
    expect(events[0]).toMatchObject({ event_type: "note_added", actor: { name: "Rep B" }, meta: { body: "Second note" } });
  });

  it("rejects an empty or oversized note with a 422 on Note_Content", async () => {
    for (const Note_Content of ["   ", "x".repeat(32001)]) {
      const res = await notes(repA, "Accounts", account, "POST", { data: [{ Note_Content }] });
      expect(res.status).toBe(422);
      expect(res.json()).toMatchObject({ details: { api_name: "data.0.Note_Content" } });
    }
  });

  it("another org's account answers like a random id, for reading and writing", async () => {
    const random = crypto.randomUUID();
    const [read, write] = [await notes(demo, "Accounts", account), await notes(demo, "Accounts", account, "POST", { data: [{ Note_Content: "x" }] })];
    expect([read.status, write.status]).toEqual([404, 404]);
    expect(read.body).toBe((await notes(demo, "Accounts", random)).body);
  });

  it("a module without a Notes list, and a list other than Notes, are 404", async () => {
    const task = (await create("Tasks", { Subject: "t" })).json().data[0].details.id;
    expect((await notes(repA, "Tasks", task)).status).toBe(404);
    const other = await call(relatedRoute, "POST", `/Accounts/${account}/Contacts`, { cookie: repA, params: { module: "Accounts", id: account, related_list: "Contacts" }, body: { data: [{ Note_Content: "x" }] } });
    expect(other.status).toBe(404);
  });
});
