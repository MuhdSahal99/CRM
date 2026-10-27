import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as recordRoute from "../app/api/v1/[module]/[id]/route";
import * as moduleRoute from "../app/api/v1/[module]/route";
import * as searchRoute from "../app/api/v1/[module]/search/route";
import { call, signIn } from "./api.ts";

// T2.03: generic create/read through the module registry. Cross-org ids are covered by the visibility matrix.
describe("records API: create and read (T2.03)", () => {
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let repA: string;
  const ids: Record<string, string> = {};
  let saqient: string;

  beforeAll(async () => {
    const auth = await connectAsAuth();
    const { rows } = await auth.query(`SELECT u.email, u.id, m.org_id FROM "user" u JOIN member m ON m.user_id = u.id`);
    await auth.end();
    for (const r of rows) ids[r.email] = r.id;
    saqient = rows.find((r) => r.email === "admin@saqient.test")!.org_id;
    app = await connectAsApp();
    repA = await signIn("rep.a@saqient.test");
  });
  afterAll(() => app?.end());

  const create = (record: Record<string, unknown>, module = "Accounts") =>
    call(moduleRoute, "POST", `/${module}`, { cookie: repA, params: { module }, body: { data: [record] } });
  const get = (id: string, module = "Accounts") => call(recordRoute, "GET", `/${module}/${id}`, { cookie: repA, params: { module, id } });

  it("a missing Account_Name is a 422 on that field", async () => {
    const res = await create({ Phone: "24000000" });
    expect(res.status).toBe(422);
    expect(res.json()).toMatchObject({ code: "INVALID_DATA", details: { api_name: "Account_Name" } });
  });

  it("AC-22: an Owner from another org is a 422 on Owner, and nothing is written", async () => {
    const res = await create({ Account_Name: "Foreign Owner LLC", Owner: { id: ids["admin@demo.test"] } });
    expect(res.status).toBe(422);
    expect(res.json()).toMatchObject({ details: { api_name: "Owner" } });
    const rows = await queryAs(app, { org_id: saqient }, "SELECT 1 FROM accounts WHERE account_name = 'Foreign Owner LLC'");
    expect(rows).toEqual([]);
  });

  it("creates an account owned by the caller, writes a created event, and reads it back as data:[record]", async () => {
    const res = await create({ Account_Name: "Muscat Trading", Industry: "Retail", Annual_Revenue: "1200.500" });
    expect(res.status).toBe(201);
    const [outcome] = res.json().data;
    expect(outcome).toMatchObject({ code: "SUCCESS", status: "success", details: { id: expect.any(String), version: 1 } });
    const id = outcome.details.id;

    const events = await queryAs(app, { org_id: saqient, role: "admin", see_all: "on" },
      "SELECT event_type, actor_id FROM timeline_events WHERE record_type = 'account' AND record_id = $1", [id]);
    expect(events).toEqual([{ event_type: "created", actor_id: ids["rep.a@saqient.test"] }]);

    const read = await get(id);
    expect(read.status).toBe(200);
    const { data } = read.json();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      id,
      version: 1,
      Account_Name: "Muscat Trading",
      Industry: "Retail",
      Annual_Revenue: "1200.500",
      Parent_Account: null,
      Owner: { id: ids["rep.a@saqient.test"], name: "Rep A" },
      Created_By: { id: ids["rep.a@saqient.test"], name: "Rep A" },
      Created_Time: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
    });
  });

  it("a bulk create names the record a field error belongs to, and writes none of them", async () => {
    const res = await call(moduleRoute, "POST", "/Accounts", { cookie: repA, params: { module: "Accounts" }, body: { data: [{ Account_Name: "Bulk Good" }, { Phone: "1" }] } });
    expect(res.json()).toMatchObject({ details: { api_name: "data.1.Account_Name" } });
    expect(await queryAs(app, { org_id: saqient }, "SELECT 1 FROM accounts WHERE account_name = 'Bulk Good'")).toEqual([]);
  });

  it("a picklist value that is not in the metadata is refused", async () => {
    expect((await create({ Account_Name: "X", Industry: "Space Mining" })).json()).toMatchObject({ details: { api_name: "Industry" } });
  });

  it("a module without a registry entry, or no module at all, is a 404", async () => {
    expect((await create({ Deal_Name: "x" }, "Quotes")).status).toBe(404);
    expect((await get(crypto.randomUUID(), "Nope")).status).toBe(404);
  });

  describe("list (T2.04)", () => {
    const list = (query: string, cookie = repA) => call(moduleRoute, "GET", `/Accounts?${query}`, { cookie, params: { module: "Accounts" } });

    it("AC-34: per_page above 200 is a 422", async () => {
      expect((await list("per_page=100000")).json()).toMatchObject({ code: "INVALID_DATA", details: { api_name: "per_page" } });
    });

    it("AC-36: a sort_by outside the field allowlist is a 422 that echoes no SQL", async () => {
      const res = await list(`sort_by=${encodeURIComponent("amount;drop table")}`);
      expect(res.status).toBe(422);
      expect(res.json()).toMatchObject({ details: { api_name: "sort_by" } });
      expect(res.body).not.toMatch(/drop|select|order by/i);
    });

    it("US-02: rep B lists the account rep A created (Accounts are public in the org)", async () => {
      const { details } = (await create({ Account_Name: "Rep A Public Account" })).json().data[0];
      const repB = await signIn("rep.b@saqient.test");
      const res = await list("per_page=200&sort_by=Account_Name&sort_order=asc", repB);
      expect(res.status).toBe(200);
      expect(res.json().data.map((r: { id: string }) => r.id)).toContain(details.id);
    });

    it("pages with a correct info.more_records and sorts by an allowlisted field", async () => {
      await create({ Account_Name: "AAA Paging 1" });
      await create({ Account_Name: "AAA Paging 2" });
      const first = (await list("per_page=1&sort_by=Account_Name&sort_order=asc")).json();
      expect(first.info).toEqual({ page: 1, per_page: 1, count: 1, more_records: true });
      const all = (await list("per_page=200&sort_by=Account_Name&sort_order=asc")).json();
      const names = all.data.map((r: { Account_Name: string }) => r.Account_Name);
      expect(names.slice(0, 2)).toEqual(["AAA Paging 1", "AAA Paging 2"]);
      expect(first.data[0].Account_Name).toBe("AAA Paging 1");
      expect(all.info.more_records).toBe(false);
      const last = (await list(`per_page=1&page=${all.info.count}&sort_by=Account_Name&sort_order=asc`)).json();
      expect(last.info).toMatchObject({ count: 1, more_records: false });
    });
  });

  describe("update and soft delete (T2.05)", () => {
    const put = (id: string, record: Record<string, unknown>) =>
      call(recordRoute, "PUT", `/Accounts/${id}`, { cookie: repA, params: { module: "Accounts", id }, body: { data: [record] } });
    const del = (id: string) => call(recordRoute, "DELETE", `/Accounts/${id}`, { cookie: repA, params: { module: "Accounts", id } });
    const newAccount = async (name: string) => (await create({ Account_Name: name, Phone: "24000001" })).json().data[0].details.id as string;

    it("is a partial update that bumps version and logs {api_name: [old, new]}", async () => {
      const id = await newAccount("Before Name");
      const res = await put(id, { Account_Name: "After Name", version: 1 });
      expect(res.status).toBe(200);
      expect(res.json().data[0]).toMatchObject({ code: "SUCCESS", details: { id, version: 2 } });
      const [record] = (await get(id)).json().data;
      expect(record).toMatchObject({ Account_Name: "After Name", Phone: "24000001", version: 2 });
      const events = await queryAs(app, { org_id: saqient, role: "admin", see_all: "on" },
        "SELECT changes FROM timeline_events WHERE record_id = $1 AND event_type = 'updated'", [id]);
      expect(events).toEqual([{ changes: { Account_Name: ["Before Name", "After Name"] } }]);
    });

    it("a stale version is a 409 and changes nothing; a missing version is a 422", async () => {
      const id = await newAccount("Versioned");
      await put(id, { Account_Name: "Versioned 2", version: 1 });
      const stale = await put(id, { Account_Name: "Lost Update", version: 1 });
      expect(stale.status).toBe(409);
      expect(stale.json()).toMatchObject({ code: "VERSION_CONFLICT" });
      expect((await get(id)).json().data[0].Account_Name).toBe("Versioned 2");
      expect((await put(id, { Account_Name: "No Version" })).json()).toMatchObject({ details: { api_name: "version" } });
    });

    it("soft delete hides the record from lists and its GET is a 404", async () => {
      const id = await newAccount("To Be Deleted");
      expect((await del(id)).status).toBe(200);
      expect((await get(id)).status).toBe(404);
      const listed = (await call(moduleRoute, "GET", "/Accounts?per_page=200", { cookie: repA, params: { module: "Accounts" } })).json().data;
      expect(listed.map((r: { id: string }) => r.id)).not.toContain(id);
      expect((await del(id)).status).toBe(404);
      expect((await put(id, { Account_Name: "Zombie", version: 2 })).status).toBe(404);
    });
  });

  describe("search (T2.07)", () => {
    const search = async (query: string, cookie = repA) => {
      const res = await call(searchRoute, "GET", `/Accounts/search?${query}`, { cookie, params: { module: "Accounts" } });
      return { status: res.status, body: res.json() };
    };
    let id: string;
    beforeAll(async () => {
      id = (await create({ Account_Name: "Zubair Searchable Holdings", Email: "Info@Zubair-Search.om", Phone: "+968 2412 3456", Employees: 42 })).json().data[0].details.id;
    });
    const ids = (body: { data: { id: string }[] }) => body.data.map((r) => r.id);

    it("word, email, phone and criteria each find the account; rep B finds rep A's account (US-02)", async () => {
      const repB = await signIn("rep.b@saqient.test");
      expect(ids((await search("word=searchable", repB)).body)).toEqual([id]);
      expect(ids((await search("email=info@zubair-search.om")).body)).toEqual([id]);
      expect(ids((await search("phone=24123456")).body)).toEqual([id]);
      const criteria = encodeURIComponent("((Account_Name:starts_with:zubair)and(Employees:between:40,50))");
      expect(ids((await search(`criteria=${criteria}`)).body)).toEqual([id]);
    });

    it("needs exactly one of criteria, word, email or phone", async () => {
      expect((await search("")).status).toBe(422);
      expect((await search("word=ab&email=a@b.om")).status).toBe(422);
    });

    it("bad criteria and a value of the wrong type are 422s, not 500s", async () => {
      expect((await search(`criteria=${encodeURIComponent("((Email:equals:x') or 1=1--))")}`)).status).toBe(422);
      expect((await search(`criteria=${encodeURIComponent("(Employees:equals:many)")}`)).status).toBe(422);
    });

    it("deleted records are not found", async () => {
      await call(recordRoute, "DELETE", `/Accounts/${id}`, { cookie: repA, params: { module: "Accounts", id } });
      expect((await search("word=searchable")).body.data).toEqual([]);
    });
  });
});
