import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { newId, schema } from "@crm/db";
import { sql } from "drizzle-orm";
import { parseConfig } from "./config.ts";
import { ApiError, NotFound } from "./http/errors.ts";
import type { Tx } from "./tenant.ts";

// T8.08 (ADR-0012): one private bucket. A key is org/<org_id>/<kind>/<file_id>; no user-supplied name is ever part of it, and
// nothing hands out a presigned URL: bytes stream through the app after the files row (and so its record) is visible.

type Kind = (typeof schema.fileKind.enumValues)[number];
type RecordType = (typeof schema.recordType.enumValues)[number];

let cached: { s3: S3Client; bucket: string } | undefined;
function client() {
  if (cached) return cached;
  const c = parseConfig(process.env);
  if (!c.S3_BUCKET || !c.S3_ACCESS_KEY_ID || !c.S3_SECRET_ACCESS_KEY) throw new Error("Object storage is not configured: set S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.");
  const s3 = new S3Client({ region: c.S3_REGION, endpoint: c.S3_ENDPOINT, forcePathStyle: !!c.S3_ENDPOINT, credentials: { accessKeyId: c.S3_ACCESS_KEY_ID, secretAccessKey: c.S3_SECRET_ACCESS_KEY } });
  return (cached = { s3, bucket: c.S3_BUCKET });
}

export const objectKey = (orgId: string, kind: Kind, fileId: string) => `org/${orgId}/${kind}/${fileId}`;

/** A display name only (Content-Disposition, the files row): the base name, plain characters, at most 200. Never used in a key. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\.{2,}/g, ".").replace(/^[. ]+/, "").slice(0, 200);
  return clean || "file";
}

/** Inserts a `pending` row and returns its id and storage key; the bytes are written by putFile. */
export async function createFile(tx: Tx, input: { kind: Kind; filename: string; contentType: string; record?: { type: RecordType; id: string } }) {
  const id = newId();
  const orgId = (await tx.execute<{ o: string }>(sql`SELECT app.org_id() AS o`)).rows[0]!.o;
  const storageKey = objectKey(orgId, input.kind, id);
  await tx.execute(sql`
    INSERT INTO files (id, org_id, kind, record_type, record_id, status, storage_key, filename, content_type, created_by)
    VALUES (${id}, ${orgId}, ${input.kind}, ${input.record?.type ?? null}, ${input.record?.id ?? null}, 'pending', ${storageKey}, ${sanitizeFilename(input.filename)}, ${input.contentType}, NULLIF(current_setting('app.user_id', true), '')::uuid)`);
  return { id, storageKey };
}

/** Uploads the bytes, then marks the row `ready` with its size and sha256. A ready file never changes again (trigger). */
export async function putFile(tx: Tx, id: string, body: Buffer) {
  const row = (await tx.execute<{ storage_key: string; content_type: string; status: string }>(sql`SELECT storage_key, content_type, status FROM files WHERE id = ${id} FOR UPDATE`)).rows[0];
  if (!row) throw new NotFound();
  if (row.status !== "pending") throw new ApiError(409, "INVALID_STATE", "This file is already stored.");
  const { s3, bucket } = client();
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: row.storage_key, Body: body, ContentType: row.content_type }));
  const sha = createHash("sha256").update(body).digest();
  await tx.execute(sql`UPDATE files SET status = 'ready', size_bytes = ${body.byteLength}, sha256 = ${sha} WHERE id = ${id}`);
}

/** The stored bytes as a stream, plus what a download response needs. 404 for a file the caller cannot see (RLS) or one not ready. */
export async function openFile(tx: Tx, id: string) {
  const row = (await tx.execute<{ storage_key: string; filename: string; content_type: string; size_bytes: string }>(sql`
    SELECT storage_key, filename, content_type, size_bytes FROM files WHERE id = ${id} AND status = 'ready'`)).rows[0];
  if (!row) throw new NotFound();
  const { s3, bucket } = client();
  const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: row.storage_key }));
  if (!out.Body) throw new NotFound();
  return { stream: out.Body.transformToWebStream(), filename: row.filename, contentType: row.content_type, size: Number(row.size_bytes) };
}
