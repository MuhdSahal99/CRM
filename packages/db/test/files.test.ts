import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsApp, connectAsAuth, createMember, createOrg, queryAs } from "./db";

// T8.08 (ADR-0012, AC-43): the files table guards itself, called as crm_app.
describe("files table (T8.08)", () => {
  let app: pg.Client;
  const admin = {} as Record<string, string>;
  const other = {} as Record<string, string>;
  const insert = (ctx: Record<string, string>, extra = "") => queryAs(app, ctx, `INSERT INTO files (id, org_id, kind, storage_key, filename, content_type, created_by)
    VALUES (gen_random_uuid(), app.org_id(), 'import_csv', 'org/' || app.org_id()::text || '/import_csv/' || gen_random_uuid()::text${extra}, 'a.csv', 'text/csv', $1) RETURNING id`, [ctx.user_id]);

  beforeAll(async () => {
    app = await connectAsApp();
    const auth = await connectAsAuth();
    const org = await createOrg(auth);
    const [a, b] = [await createMember(auth, org, "admin"), await createMember(auth, org, "admin")];
    await auth.end();
    Object.assign(admin, { org_id: org, user_id: a, role: "admin", see_all: "on" });
    Object.assign(other, { org_id: org, user_id: b, role: "admin", see_all: "on" });
  });
  afterAll(() => app?.end());

  it("a pending file can be finished once; a ready file cannot be updated or deleted", async () => {
    const [{ id }] = await insert(admin);
    await expect(queryAs(app, admin, `UPDATE files SET status = 'ready' WHERE id = $1`, [id])).rejects.toThrow(/files_ready/);
    await queryAs(app, admin, `UPDATE files SET status = 'ready', size_bytes = 3, sha256 = decode('00', 'hex') WHERE id = $1`, [id]);
    await expect(queryAs(app, admin, `UPDATE files SET filename = 'b.csv' WHERE id = $1`, [id])).rejects.toThrow(/ready file/);
    await expect(queryAs(app, admin, `DELETE FROM files WHERE id = $1`, [id])).rejects.toThrow(/permission denied/); // crm_app has no DELETE grant at all
  });

  it("a storage key must sit under the file's own org, and a file with no record is visible only to its creator", async () => {
    await expect(queryAs(app, admin, `INSERT INTO files (id, org_id, kind, storage_key, filename, content_type, created_by)
      VALUES (gen_random_uuid(), app.org_id(), 'import_csv', 'org/' || gen_random_uuid()::text || '/import_csv/x', 'a.csv', 'text/csv', $1)`, [admin.user_id])).rejects.toThrow(/files_key_org/);
    const [{ id }] = await insert(admin);
    expect(await queryAs(app, admin, `SELECT 1 FROM files WHERE id = $1`, [id])).toHaveLength(1);
    expect(await queryAs(app, other, `SELECT 1 FROM files WHERE id = $1`, [id])).toHaveLength(0);
  });
});
