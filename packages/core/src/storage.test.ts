import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@crm/db";
import { connectAsAuth, createMember, createOrg, requireEnv } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFile, objectKey, openFile, putFile, sanitizeFilename } from "./storage.ts";
import { type TenantContext, withTenant } from "./tenant.ts";

// T8.08 (ADR-0012, AC-43). The object-store half needs S3_* in the environment (MinIO in dev); the pure helpers always run.
describe("sanitizeFilename (AC-43)", () => {
  it("keeps only a plain base name", () => {
    expect(sanitizeFilename("../../etc/passwd.csv")).toBe("passwd.csv");
    expect(sanitizeFilename("..\\..\\win\\x.csv")).toBe("x.csv");
    expect(sanitizeFilename("a<b>|c.pdf")).toBe("a_b__c.pdf");
    expect(sanitizeFilename("...")).toBe("file");
    expect(sanitizeFilename("x".repeat(300)).length).toBe(200);
  });
});

describe.skipIf(!process.env.S3_BUCKET)("file storage (T8.08)", () => {
  let db: Db;
  let ctx: TenantContext;
  let other: TenantContext;
  beforeAll(async () => {
    const auth = await connectAsAuth();
    const org = await createOrg(auth);
    const user = await createMember(auth, org, "admin");
    const user2 = await createMember(auth, org, "admin");
    await auth.end();
    ctx = { orgId: org, userId: user, role: "admin", visibleOwnerIds: [user], seeAll: true };
    other = { orgId: org, userId: user2, role: "admin", visibleOwnerIds: [user2], seeAll: true };
    db = createDb(requireEnv("TEST_DATABASE_URL"), { max: 1 });
  });
  afterAll(() => db?.$client.end());

  it("stores a hostile filename under a UUID key, round-trips the bytes with their sha256, and the ready row cannot change", async () => {
    const bytes = Buffer.from("a,b\n1,2\n");
    const { id, storageKey } = await withTenant(ctx, async (tx) => {
      const f = await createFile(tx, { kind: "import_csv", filename: "../../etc/passwd.csv", contentType: "text/csv" });
      await putFile(tx, f.id, bytes);
      return f;
    }, db);
    expect(storageKey).toBe(objectKey(ctx.orgId, "import_csv", id));
    expect(storageKey).not.toMatch(/passwd|\.\./);
    await withTenant(ctx, async (tx) => {
      const row = (await tx.execute<{ filename: string; sha256: Buffer; size_bytes: string; status: string }>(sql`SELECT filename, sha256, size_bytes, status FROM files WHERE id = ${id}`)).rows[0]!;
      expect(row).toMatchObject({ filename: "passwd.csv", status: "ready", size_bytes: "8" });
      expect(Buffer.from(row.sha256).equals(createHash("sha256").update(bytes).digest())).toBe(true);
      const opened = await openFile(tx, id);
      expect(Buffer.from(await new Response(opened.stream).arrayBuffer()).equals(bytes)).toBe(true);
      expect(opened).toMatchObject({ filename: "passwd.csv", contentType: "text/csv", size: 8 });
    }, db);
    await expect(withTenant(ctx, (tx) => tx.execute(sql`UPDATE files SET filename = 'x' WHERE id = ${id}`), db)).rejects.toThrow();
  });

  it("a file with no record is visible only to its creator (404 for anyone else)", async () => {
    const id = await withTenant(ctx, async (tx) => {
      const f = await createFile(tx, { kind: "import_csv", filename: "mine.csv", contentType: "text/csv" });
      await putFile(tx, f.id, Buffer.from("x"));
      return f.id;
    }, db);
    await expect(withTenant(other, (tx) => openFile(tx, id), db)).rejects.toMatchObject({ httpStatus: 404 });
  });
});
