import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsApp, connectAsAuth, createMember, createOrg, queryAs } from "./db";

describe("metadata tables (T1.17, ADR-0006)", () => {
  let app: pg.Client;
  let auth: pg.Client;
  let org: string;
  let admin: string;
  let rep: string;
  let moduleId: string;
  let picklistId: string;

  const as = (role: "admin" | "rep", sql: string, params: unknown[] = []) =>
    queryAs(app, { org_id: org, user_id: role === "admin" ? admin : rep, role }, sql, params);
  const insertField = (role: "admin" | "rep", apiName: string, dataType: string, picklist: string | null = null) =>
    as(
      role,
      `INSERT INTO fields (id, org_id, created_by, updated_by, module_id, api_name, label_key, data_type, is_system, picklist_id)
       VALUES (gen_random_uuid(), $1, $2, $2, $3, $4, 'fields.x', $5, false, $6) RETURNING id`,
      [org, role === "admin" ? admin : rep, moduleId, apiName, dataType, picklist],
    );

  beforeAll(async () => {
    [app, auth] = await Promise.all([connectAsApp(), connectAsAuth()]);
    org = await createOrg(auth);
    admin = await createMember(auth, org, "admin");
    rep = await createMember(auth, org, "rep");
    [{ id: moduleId }] = await as("admin", `INSERT INTO modules (id, org_id, created_by, updated_by, api_name, label_key, sort_order)
      VALUES (gen_random_uuid(), $1, $2, $2, 'Leads', 'modules.leads', 1) RETURNING id`, [org, admin]);
    [{ id: picklistId }] = await as("admin", `INSERT INTO picklists (id, org_id, created_by, updated_by, api_name)
      VALUES (gen_random_uuid(), $1, $2, $2, 'lead_source') RETURNING id`, [org, admin]);
  });
  afterAll(() => Promise.all([app?.end(), auth?.end()]));

  it("api_name is immutable on fields and modules, even for an admin", async () => {
    const [{ id }] = await insertField("admin", "Nickname", "text");
    await expect(as("admin", "UPDATE fields SET api_name = 'Renamed' WHERE id = $1", [id])).rejects.toThrow(/api_name is immutable/);
    await expect(as("admin", "UPDATE modules SET api_name = 'Prospects' WHERE id = $1", [moduleId])).rejects.toThrow(/api_name is immutable/);
    await expect(as("admin", "UPDATE fields SET label_key = 'fields.nick' WHERE id = $1 RETURNING id", [id])).resolves.toHaveLength(1);
  });

  it("a rep reads metadata but cannot insert or update it", async () => {
    expect(await as("rep", "SELECT api_name FROM modules")).toEqual([{ api_name: "Leads" }]);
    await expect(insertField("rep", "Sneaky", "text")).rejects.toThrow(/row-level security/);
    // UPDATE under a restrictive USING sees no rows: nothing changes, nothing errors.
    expect(await as("rep", "UPDATE modules SET label_key = 'x' RETURNING id")).toEqual([]);
  });

  it("the picklist CHECK holds: picklist types need a picklist, other types must not have one", async () => {
    await expect(insertField("admin", "Source", "picklist")).rejects.toThrow(/fields_picklist/);
    await expect(insertField("admin", "Notes", "text", picklistId)).rejects.toThrow(/fields_picklist/);
    await expect(insertField("admin", "Lead_Source", "picklist", picklistId)).resolves.toHaveLength(1);
  });
});
