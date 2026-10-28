import { describe, expect, it } from "vitest";
import * as relatedRoute from "../app/api/v1/[module]/[id]/[related_list]/route";
import * as moduleRoute from "../app/api/v1/[module]/route";
import * as layoutsRoute from "../app/api/v1/settings/layouts/route";
import * as relatedListsRoute from "../app/api/v1/settings/related_lists/route";
import { call, signIn } from "./api.ts";

// T2.10. A Demo user reading a Saqient account's related list gets 404: covered by the visibility matrix.
describe("related lists and layouts (T2.10)", () => {
  const create = async (cookie: string, module: string, record: Record<string, unknown>) =>
    (await call(moduleRoute, "POST", `/${module}`, { cookie, params: { module }, body: { data: [record] } })).json().data[0].details.id as string;

  it("Account → Contacts lists that account's contacts only", async () => {
    const rep = await signIn("rep.a@saqient.test");
    const [mine, other] = [await create(rep, "Accounts", { Account_Name: "Related Parent" }), await create(rep, "Accounts", { Account_Name: "Other Parent" })];
    const ahmed = await create(rep, "Contacts", { Last_Name: "Related One", Account_Name: { id: mine } });
    await create(rep, "Contacts", { Last_Name: "Elsewhere", Account_Name: { id: other } });

    const params = { module: "Accounts", id: mine, related_list: "Contacts" };
    const res = await call(relatedRoute, "GET", `/Accounts/${mine}/Contacts`, { cookie: rep, params });
    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({ data: [{ id: ahmed, Last_Name: "Related One" }], info: { count: 1, more_records: false } });
    expect((await call(relatedRoute, "GET", `/Accounts/${mine}/Invoices`, { cookie: rep, params: { ...params, related_list: "Invoices" } })).status).toBe(404);
  });

  it("AC-17: Account -> Quotes shows a rep only their own quotes", async () => {
    const [a, b] = [await signIn("rep.a@saqient.test"), await signIn("rep.b@saqient.test")];
    const account = await create(a, "Accounts", { Account_Name: "Quote Parent" });
    const quote = await create(a, "Quotes", { Subject: "Related quote", Account_Name: { id: account } });
    const list = (cookie: string) => call(relatedRoute, "GET", `/Accounts/${account}/Quotes`, { cookie, params: { module: "Accounts", id: account, related_list: "Quotes" } });
    expect((await list(a)).json().data.map((q: { id: string }) => q.id)).toEqual([quote]);
    expect((await list(b)).json()).toMatchObject({ data: [], info: { count: 0 } });
  });

  it("settings list the related lists and the default layout of a module", async () => {
    const rep = await signIn("rep.b@saqient.test");
    const lists = await call(relatedListsRoute, "GET", "/settings/related_lists?module=Accounts", { cookie: rep });
    expect(lists.json().data).toEqual([
      { api_name: "Contacts", module: "Contacts", label_key: "related.Contacts" },
      { api_name: "Deals", module: "Deals", label_key: "related.Deals" },
      { api_name: "Quotes", module: "Quotes", label_key: "related.Quotes" },
    ]);

    const layouts = (await call(layoutsRoute, "GET", "/settings/layouts?module=Accounts", { cookie: rep })).json().data;
    expect(layouts).toHaveLength(1);
    expect(layouts[0]).toMatchObject({ name: "Standard", is_default: true });
    expect(layouts[0].sections[0]).toMatchObject({ label_key: "sections.account_information", columns: 2 });
    expect(layouts[0].sections[0].fields.slice(0, 2)).toEqual(["Owner", "Account_Name"]);
  });
});
