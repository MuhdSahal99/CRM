import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsApp } from "./db";

describe("crm_app role (ADR-0003)", () => {
  let app: pg.Client;
  beforeAll(async () => {
    app = await connectAsApp();
  });
  afterAll(() => app?.end());

  it("connects as crm_app, which is not a superuser and cannot bypass RLS", async () => {
    const { rows } = await app.query("SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user");
    expect(rows).toEqual([{ rolname: "crm_app", rolsuper: false, rolbypassrls: false }]);
  });

  it("cannot run DDL", async () => {
    await expect(app.query("CREATE TABLE probe (id int)")).rejects.toThrow(/permission denied/);
  });

  it("sees the extensions installed by migrations", async () => {
    const { rows } = await app.query("SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm', 'citext') ORDER BY 1");
    expect(rows.map((r) => r.extname)).toEqual(["citext", "pg_trgm"]);
  });
});
