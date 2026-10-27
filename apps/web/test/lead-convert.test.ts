import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as notesRoute from "../app/api/v1/[module]/[id]/[related_list]/route";
import * as recordRoute from "../app/api/v1/[module]/[id]/route";
import * as convertRoute from "../app/api/v1/Leads/[id]/actions/convert/route";
import * as optionsRoute from "../app/api/v1/Leads/[id]/%5F%5Fconversion_options/route";
import * as moduleRoute from "../app/api/v1/[module]/route";
import { call, signIn } from "./api.ts";

// T4.03 - T4.05 (US-05): converting a lead. Cross-org ids are covered by the visibility matrix.
describe("lead conversion (US-05)", () => {
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let repA: string;
  let repB: string;
  let saqient: string;
  const run = crypto.randomUUID().slice(0, 8);

  beforeAll(async () => {
    app = await connectAsApp();
    const auth = await connectAsAuth();
    saqient = (await auth.query("SELECT id FROM orgs WHERE slug = 'saqient'")).rows[0].id;
    await auth.end();
    [repA, repB] = [await signIn("rep.a@saqient.test"), await signIn("rep.b@saqient.test")];
  });
  afterAll(() => app?.end());

  const create = async (cookie: string, module: string, record: Record<string, unknown>): Promise<string> => {
    const res = await call(moduleRoute, "POST", `/${module}`, { cookie, params: { module }, body: { data: [record] } });
    expect(res.status, res.body).toBe(201);
    return res.json().data[0].details.id;
  };
  /** Reads as an admin who sees everything in Saqient, so a test can check what a rep's request left behind. */
  const rows = (query: string, params: unknown[] = []) => queryAs(app, { org_id: saqient, role: "admin", see_all: "on" }, query, params);
  const convert = (cookie: string, id: string, choice: Record<string, unknown> = {}, headers?: Record<string, string>) =>
    call(convertRoute, "POST", `/Leads/${id}/actions/convert`, { cookie, params: { id }, body: { data: [choice] }, headers });
  const options = (cookie: string, id: string) => call(optionsRoute, "GET", `/Leads/${id}/__conversion_options`, { cookie, params: { id } });

  describe("T4.03 conversion options", () => {
    it("offers an existing Contact with the same email, and an Account with the same company (any case)", async () => {
      const account = await create(repA, "Accounts", { Account_Name: `Acme ${run}` });
      const contact = await create(repA, "Contacts", { Last_Name: "Matcher", Email: `Match-${run}@example.test` });
      const lead = await create(repA, "Leads", { Last_Name: "Lead", Company: `ACME ${run}`, Email: `match-${run}@example.test` });
      const res = await options(repA, lead);
      expect(res.status).toBe(200);
      expect(res.json().data[0]).toMatchObject({
        Accounts: [{ id: account }],
        Contacts: [{ id: contact }],
        preferred: { Accounts: { id: account }, Contacts: { id: contact } },
      });
    });

    it("offers nothing when nothing matches, and a name-only contact match is offered but not preferred", async () => {
      const lonely = await create(repA, "Leads", { Last_Name: `Nobody${run}`, Company: `No Such Co ${run}`, Email: `none-${run}@example.test` });
      expect((await options(repA, lonely)).json().data[0]).toEqual({ Accounts: [], Contacts: [], preferred: { Accounts: null, Contacts: null } });
      const contact = await create(repA, "Contacts", { First_Name: "Sara", Last_Name: `Namesake${run}` });
      const lead = await create(repA, "Leads", { First_Name: "sara", Last_Name: `namesake${run}`, Company: `Other ${run}` });
      expect((await options(repA, lead)).json().data[0]).toMatchObject({ Contacts: [{ id: contact }], preferred: { Contacts: null } });
    });

    it("404 for another rep's lead", async () => {
      const lead = await create(repA, "Leads", { Last_Name: "Private", Company: "Private Co" });
      expect((await options(repB, lead)).status).toBe(404);
    });
  });
  describe("T4.04 convert", () => {
    it("creates exactly one Account and one Contact, flags the lead and writes a converted event", async () => {
      const lead = await create(repA, "Leads", { First_Name: "Hind", Last_Name: `Conv${run}`, Company: `Conv Co ${run}`, Email: `hind-${run}@example.test`, Mobile: "+96891230000", Industry: "Retail", Country: "OM", City: "Muscat" });
      const res = await convert(repA, lead);
      expect(res.status, res.body).toBe(200);
      const { Accounts, Contacts, Deals } = res.json().data[0];
      expect(Deals).toBeNull();
      expect(await rows("SELECT count(*)::int AS n FROM accounts WHERE account_name = $1", [`Conv Co ${run}`])).toEqual([{ n: 1 }]);
      expect(await rows("SELECT count(*)::int AS n FROM contacts WHERE last_name = $1", [`Conv${run}`])).toEqual([{ n: 1 }]);
      expect((await rows("SELECT account_id, email, mobile, mailing_city, converted_from_lead_id FROM contacts WHERE id = $1", [Contacts]))[0])
        .toEqual({ account_id: Accounts, email: `hind-${run}@example.test`, mobile: "+96891230000", mailing_city: "Muscat", converted_from_lead_id: lead });
      expect((await rows("SELECT is_converted, converted_account_id, converted_contact_id, converted_by IS NOT NULL AS by FROM leads WHERE id = $1", [lead]))[0])
        .toEqual({ is_converted: true, converted_account_id: Accounts, converted_contact_id: Contacts, by: true });
      expect(await rows("SELECT meta FROM timeline_events WHERE record_id = $1 AND event_type = 'converted'", [lead])).toEqual([{ meta: { account_id: Accounts, contact_id: Contacts, notes_moved: 0, activities_moved: 0 } }]);
    });

    it("attaching existing records creates no new Account or Contact", async () => {
      const account = await create(repA, "Accounts", { Account_Name: `Existing ${run}` });
      const contact = await create(repA, "Contacts", { Last_Name: `Existing${run}` });
      const lead = await create(repA, "Leads", { Last_Name: `Attach${run}`, Company: `Existing ${run}` });
      const res = await convert(repA, lead, { Accounts: { id: account }, Contacts: { id: contact } });
      expect(res.json().data[0]).toMatchObject({ Accounts: account, Contacts: contact });
      // The lead's own name and company would have made a second Account and a Contact "Attach...": there are none.
      expect(await rows("SELECT (SELECT count(*) FROM accounts WHERE account_name = $1)::int AS a, (SELECT count(*) FROM contacts WHERE last_name IN ($2, $3))::int AS c", [`Existing ${run}`, `Existing${run}`, `Attach${run}`]))
        .toEqual([{ a: 1, c: 1 }]);
    });

    it("rolls everything back when a step after the Account insert fails", async () => {
      const lead = await create(repA, "Leads", { Last_Name: `Roll${run}`, Company: `Rollback Co ${run}` });
      const res = await convert(repA, lead, { Contacts: { id: crypto.randomUUID() } }); // the Account is created first, then the Contact is refused
      expect(res.status).toBe(422);
      expect(res.json().details.api_name).toBe("Contacts");
      expect(await rows("SELECT count(*)::int AS n FROM accounts WHERE account_name = $1", [`Rollback Co ${run}`])).toEqual([{ n: 0 }]);
      expect(await rows("SELECT is_converted FROM leads WHERE id = $1", [lead])).toEqual([{ is_converted: false }]);
      expect(await rows("SELECT 1 FROM timeline_events WHERE record_id = $1 AND event_type = 'converted'", [lead])).toEqual([]);
    });

    it("is idempotent with an Idempotency-Key, and a Deal object is refused until T5.07", async () => {
      const lead = await create(repA, "Leads", { Last_Name: `Idem${run}`, Company: `Idem Co ${run}` });
      const headers = { "idempotency-key": `convert-${run}-0001` };
      const first = await convert(repA, lead, {}, headers);
      const again = await convert(repA, lead, {}, headers);
      expect([first.status, again.status]).toEqual([200, 200]);
      expect(again.json()).toEqual(first.json());
      expect(await rows("SELECT count(*)::int AS n FROM accounts WHERE account_name = $1", [`Idem Co ${run}`])).toEqual([{ n: 1 }]);
      const other = await create(repA, "Leads", { Last_Name: `Deal${run}`, Company: "Deal Co" });
      expect((await convert(repA, other, { Deals: { Closing_Date: "2026-12-01" } })).status).toBe(422);
    });

    it("another rep gets 404 and nothing is created", async () => {
      const lead = await create(repA, "Leads", { Last_Name: `Hidden${run}`, Company: `Hidden Co ${run}` });
      expect((await convert(repB, lead)).status).toBe(404);
      expect(await rows("SELECT count(*)::int AS n FROM accounts WHERE account_name = $1", [`Hidden Co ${run}`])).toEqual([{ n: 0 }]);
    });
  });
  describe("T4.05 notes, activities and the read-only lead", () => {
    it("moves the lead's notes and activities to the Contact; a second convert and a PUT are 409; direct SQL raises", async () => {
      const anyMember = (await rows("SELECT user_id FROM member LIMIT 1"))[0].user_id;
      const lead = await create(repA, "Leads", { Last_Name: `Move${run}`, Company: `Move Co ${run}` });
      const note = await call(notesRoute, "POST", `/Leads/${lead}/Notes`, { cookie: repA, params: { module: "Leads", id: lead, related_list: "Notes" }, body: { data: [{ Note_Content: "Called, wants a quote" }] } });
      expect(note.status, note.body).toBe(201);
      const task = await create(repA, "Tasks", { Subject: `Follow up ${run}`, Who_Id: { id: lead, module: "Leads" } });

      const { Contacts } = (await convert(repA, lead)).json().data[0];
      expect(await rows("SELECT record_type, record_id FROM notes WHERE body = 'Called, wants a quote' AND record_id IN ($1, $2)", [lead, Contacts])).toEqual([{ record_type: "contact", record_id: Contacts }]);
      expect(await rows("SELECT who_type, who_id FROM activities WHERE id = $1", [task])).toEqual([{ who_type: "contact", who_id: Contacts }]);

      const second = await convert(repA, lead);
      expect(second.status).toBe(409);
      expect(second.json().code).toBe("INVALID_STATE");
      const put = await call(recordRoute, "PUT", `/Leads/${lead}`, { cookie: repA, params: { module: "Leads", id: lead }, body: { data: [{ Company: "Changed", version: 3 }] } });
      expect(put.status).toBe(409);
      expect(put.json().code).toBe("INVALID_STATE");
      const del = await call(recordRoute, "DELETE", `/Leads/${lead}`, { cookie: repA, params: { module: "Leads", id: lead } });
      expect(del.status).toBe(409);
      await expect(queryAs(app, { org_id: saqient, user_id: anyMember, role: "admin", see_all: "on" }, "UPDATE leads SET company = 'Direct' WHERE id = $1", [lead])).rejects.toThrow(/converted lead cannot be changed/);
    });
  });
});
