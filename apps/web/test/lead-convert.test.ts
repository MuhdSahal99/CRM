import { connectAsApp, connectAsAuth } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as optionsRoute from "../app/api/v1/Leads/[id]/__conversion_options/route";
import * as moduleRoute from "../app/api/v1/[module]/route";
import { call, signIn } from "./api.ts";

// T4.03 - T4.05 (US-05): converting a lead. Cross-org ids are covered by the visibility matrix.
describe("lead conversion (US-05)", () => {
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let repA: string;
  let repB: string;
  const run = crypto.randomUUID().slice(0, 8);

  beforeAll(async () => {
    app = await connectAsApp();
    [repA, repB] = [await signIn("rep.a@saqient.test"), await signIn("rep.b@saqient.test")];
  });
  afterAll(() => app?.end());

  const create = async (cookie: string, module: string, record: Record<string, unknown>): Promise<string> => {
    const res = await call(moduleRoute, "POST", `/${module}`, { cookie, params: { module }, body: { data: [record] } });
    expect(res.status, res.body).toBe(201);
    return res.json().data[0].details.id;
  };
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
});
