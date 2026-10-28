import { connectAsApp, connectAsAuth, createOrg, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fieldsRoute from "../app/api/v1/settings/fields/route";
import * as modulesRoute from "../app/api/v1/settings/modules/route";
import { call, createSignInUser, signIn } from "./api.ts";

// T1.19: GET /settings/modules and /settings/fields, scoped to the caller's org.
describe("settings metadata endpoints (T1.19)", () => {
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let auth: Awaited<ReturnType<typeof connectAsAuth>>;
  let rep: string;

  /** Adds a custom picklist field to `orgId`'s Sales_Orders module (no system fields yet), as that org's admin. */
  async function addField(orgId: string, apiName: string) {
    const { rows } = await auth.query("SELECT user_id FROM member WHERE org_id = $1 AND role = 'admin' LIMIT 1", [orgId]);
    const ctx = { org_id: orgId, user_id: rows[0].user_id, role: "admin" };
    await queryAs(app, ctx, `
      WITH p AS (INSERT INTO picklists (id, org_id, api_name) VALUES (gen_random_uuid(), $1, $2) RETURNING id),
      v AS (INSERT INTO picklist_values (id, org_id, picklist_id, value, label_key, sort_order, is_active)
            SELECT gen_random_uuid(), $1, p.id, x.value, 'v', x.n, x.active FROM p, (VALUES ('north', 1, true), ('gone', 2, false)) AS x(value, n, active))
      INSERT INTO fields (id, org_id, module_id, api_name, label_key, data_type, is_system, picklist_id)
      SELECT gen_random_uuid(), $1, m.id, $2, 'fields.region', 'picklist', false, p.id FROM modules m, p WHERE m.api_name = 'Sales_Orders'`, [orgId, apiName]);
  }

  beforeAll(async () => {
    [app, auth] = await Promise.all([connectAsApp(), connectAsAuth()]);
    const { rows } = await auth.query("SELECT id, slug FROM orgs WHERE slug IN ('saqient', 'demo')");
    const org = (slug: string) => rows.find((r) => r.slug === slug)!.id;
    await addField(org("saqient"), "Region");
    await addField(org("demo"), "Demo_Only");
    rep = await signIn("rep.a@saqient.test");
  });
  afterAll(() => Promise.all([app?.end(), auth?.end()]));

  it("a rep lists only their own org's modules", async () => {
    const res = await call(modulesRoute, "GET", "/settings/modules", { cookie: rep });
    expect(res.status).toBe(200);
    const { data } = res.json();
    expect(data).toHaveLength(11);
    expect(data[0]).toEqual({ api_name: "Leads", label_key: "modules.Leads", is_custom: false, visibility: "private" });
    expect(data.find((m: { api_name: string }) => m.api_name === "Accounts").visibility).toBe("public");
  });

  it("a rep lists only their own org's fields, with active picklist values and their access", async () => {
    const res = await call(fieldsRoute, "GET", "/settings/fields?module=Sales_Orders", { cookie: rep });
    expect(res.status).toBe(200);
    expect(res.json().data).toEqual([
      expect.objectContaining({
        api_name: "Region",
        data_type: "picklist",
        is_system: false,
        lookup_module: null,
        access: "read_write",
        picklist_values: [{ value: "north", label_key: "v", category: null, sort_order: 1 }],
      }),
    ]);
  });

  it("a module that exists only in another org returns 404", async () => {
    // A bare org (no provisioning) whose user can sign in: Sales_Orders exists in Saqient and Demo, not here.
    const { email } = await createSignInUser(auth, await createOrg(auth), "admin");
    const res = await call(fieldsRoute, "GET", "/settings/fields?module=Sales_Orders", { cookie: await signIn(email) });
    expect(res.status).toBe(404);
  });

  it("an unknown module name is a 422", async () => {
    expect((await call(fieldsRoute, "GET", "/settings/fields?module=Nope", { cookie: rep })).status).toBe(422);
  });
});
