import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsApp, connectAsAuth, createMember, createOrg, queryAs } from "./db";

// Tenant tables = every public table with an org_id column, plus orgs itself (keyed by id).
const TENANT_TABLES_SQL = `
  SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS force
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped)
  ORDER BY 1`;

describe("tenant isolation (ADR-0003)", () => {
  let app: pg.Client;
  let auth: pg.Client;
  let tenantTables: string[];
  const orgs = { a: "", b: "" };

  beforeAll(async () => {
    [app, auth] = await Promise.all([connectAsApp(), connectAsAuth()]);
    tenantTables = [...(await app.query(TENANT_TABLES_SQL)).rows.map((r) => r.relname), "orgs"];
    [orgs.a, orgs.b] = await Promise.all([createOrg(auth), createOrg(auth)]);
    for (const org of [orgs.a, orgs.b]) {
      const manager = await createMember(auth, org, "manager");
      await createMember(auth, org, "rep", manager);
      await auth.query(
        `INSERT INTO invitation (id, org_id, email, role, expires_at, inviter_id) VALUES (gen_random_uuid(), $1, gen_random_uuid() || '@example.com', 'rep', now() + interval '1 day', $2)`,
        [org, manager],
      );
      await queryAs(app, { org_id: org }, `INSERT INTO timeline_events (id, org_id, record_type, record_id, event_type) VALUES (gen_random_uuid(), $1, 'org', $1, 'updated')`, [org]);
      // One row in each metadata table (T1.17), written as an admin would.
      await queryAs(app, { org_id: org, user_id: manager, role: "admin" }, `
        WITH m AS (INSERT INTO modules (id, org_id, created_by, updated_by, api_name, label_key, sort_order) VALUES (gen_random_uuid(), $1, $2, $2, 'Leads', 'l', 1) RETURNING id),
        p AS (INSERT INTO picklists (id, org_id, created_by, updated_by, api_name) VALUES (gen_random_uuid(), $1, $2, $2, 'p') RETURNING id),
        pv AS (INSERT INTO picklist_values (id, org_id, created_by, updated_by, picklist_id, value, label_key, sort_order) SELECT gen_random_uuid(), $1, $2, $2, p.id, 'v', 'v', 1 FROM p),
        f AS (INSERT INTO fields (id, org_id, created_by, updated_by, module_id, api_name, label_key, data_type, is_system) SELECT gen_random_uuid(), $1, $2, $2, m.id, 'f', 'f', 'text', false FROM m RETURNING id),
        fp AS (INSERT INTO field_permissions (org_id, created_by, updated_by, field_id, role, access) SELECT $1, $2, $2, f.id, 'rep', 'hidden' FROM f),
        l AS (INSERT INTO layouts (id, org_id, created_by, updated_by, module_id, name) SELECT gen_random_uuid(), $1, $2, $2, m.id, 'Standard' FROM m RETURNING id),
        s AS (INSERT INTO layout_sections (id, org_id, created_by, updated_by, layout_id, label_key, sort_order) SELECT gen_random_uuid(), $1, $2, $2, l.id, 's', 1 FROM l RETURNING id)
        INSERT INTO layout_fields (id, org_id, created_by, updated_by, section_id, field_id, sort_order) SELECT gen_random_uuid(), $1, $2, $2, s.id, f.id, 1 FROM s, f`, [org, manager]);
      // One row in each record table (slice 2).
      await queryAs(app, { org_id: org, user_id: manager }, `INSERT INTO accounts (id, org_id, owner_id, account_name) VALUES (gen_random_uuid(), $1, $2, 'A')`, [org, manager]);
      await queryAs(app, { org_id: org, user_id: manager }, `INSERT INTO contacts (id, org_id, owner_id, last_name) VALUES (gen_random_uuid(), $1, $2, 'C')`, [org, manager]);
      await queryAs(app, { org_id: org, user_id: manager, see_all: "on" }, `INSERT INTO activities (id, org_id, owner_id, type, subject) VALUES (gen_random_uuid(), $1, $2, 'task', 'T')`, [org, manager]);
      await queryAs(app, { org_id: org, user_id: manager, see_all: "on" }, `INSERT INTO notes (id, org_id, record_type, record_id, body) SELECT gen_random_uuid(), $1, 'activity', id, 'N' FROM activities WHERE org_id = $1`, [org]);
      await queryAs(app, { org_id: org }, `INSERT INTO idempotency_keys (org_id, user_id, key, request_hash, status) VALUES ($1, $2, 'k', decode('00', 'hex'), 'in_progress')`, [org, manager]);
    }
  });
  afterAll(() => Promise.all([app?.end(), auth?.end()]));

  it("AC-14: every table with org_id has RLS, FORCE and a tenant_isolation policy for crm_app", async () => {
    const { rows: tables } = await app.query(TENANT_TABLES_SQL);
    const { rows: policies } = await app.query(
      `SELECT tablename FROM pg_policies WHERE schemaname = 'public' AND policyname = 'tenant_isolation'
         AND permissive = 'PERMISSIVE' AND 'crm_app' = ANY (roles)`,
    );
    const withPolicy = new Set(policies.map((p) => p.tablename));
    expect(tables.length).toBeGreaterThan(0);
    for (const t of tables) expect({ table: t.relname, rls: t.rls, force: t.force, policy: withPolicy.has(t.relname) }).toEqual({ table: t.relname, rls: true, force: true, policy: true });
  });

  it("AC-16: with no context set, crm_app sees zero rows in every tenant table", async () => {
    for (const table of tenantTables) {
      const { rows } = await app.query(`SELECT count(*)::int AS n FROM "${table}"`);
      expect({ table, n: rows[0].n }).toEqual({ table, n: 0 });
    }
  });

  it("AC-16: a finished request leaves no usable context on the connection", async () => {
    await queryAs(app, { org_id: orgs.a }, "SELECT 1"); // set_config(..., true) dies with the transaction
    const { rows } = await app.query("SELECT count(*)::int AS n FROM member");
    expect(rows[0].n).toBe(0);
  });

  it("with org A's context, crm_app sees only org A in every tenant table", async () => {
    for (const table of tenantTables) {
      const column = table === "orgs" ? "id" : "org_id";
      const rows = await queryAs(app, { org_id: orgs.a, see_all: "on" }, `SELECT DISTINCT ${column} AS org FROM "${table}"`);
      expect({ table, orgs: rows.map((r) => r.org) }).toEqual({ table, orgs: [orgs.a] });
    }
  });

  it("an id that is not a uuid fails the query instead of matching anything", async () => {
    await expect(queryAs(app, { org_id: "not-a-uuid" }, "SELECT * FROM member")).rejects.toThrow(/uuid/);
  });
});

describe("app.visible_owner_ids() (ADR-0005)", () => {
  let app: pg.Client;
  beforeAll(async () => {
    app = await connectAsApp();
  });
  afterAll(() => app?.end());

  it("parses the comma-separated setting into uuid[]", async () => {
    const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
    const rows = await queryAs(app, { visible_owner_ids: `${a},${b}` }, "SELECT app.visible_owner_ids() AS ids");
    expect(rows[0].ids).toEqual([a, b]);
  });

  it("is NULL when unset, so `owner_id = ANY(...)` matches nothing", async () => {
    const { rows } = await app.query("SELECT app.visible_owner_ids() AS ids, gen_random_uuid() = ANY (app.visible_owner_ids()) AS hit");
    expect(rows[0]).toEqual({ ids: null, hit: null });
  });
});
