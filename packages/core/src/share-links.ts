import { createHash, randomBytes } from "node:crypto";
import { newId } from "@crm/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { currentPdf, DOCS, isDocModule } from "./documents-pdf.ts";
import { ApiError, NotFound } from "./http/errors.ts";
import { getAppDb, type Tx } from "./tenant.ts";
import { recordEvent } from "./timeline.ts";

// T9.05 (US-14, ADR-0009): a link is 32 random bytes (base64url, 43 chars) to ONE immutable PDF file. Only sha256(token) is stored; the plaintext
// is in the create response and nowhere else. Revoking or expiring takes effect on the next request because no response is cached.

export const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;
export const hashShareToken = (token: string) => createHash("sha256").update(token).digest();
export const newShareToken = () => randomBytes(32).toString("base64url");

export const CreateShareLinkInput = z.object({ to_contact_id: z.uuid(), message: z.string().trim().max(1000).optional() });

type Stamp = string | Date; // the driver hands timestamptz back as text
type Link = { id: string; file_id: string; expires_at: Stamp; revoked_at: Stamp | null; last_accessed_at: Stamp | null; access_count: number; created_by: string; creator: string | null; created_at: Stamp };
const iso = (t: Stamp | null) => (t ? new Date(t).toISOString() : null);
const shape = (l: Link) => ({
  id: l.id, file_id: l.file_id, expires_at: iso(l.expires_at), revoked_at: iso(l.revoked_at), last_accessed_at: iso(l.last_accessed_at),
  access_count: l.access_count, created_by: { id: l.created_by, name: l.creator?.trim() ?? null }, created_at: iso(l.created_at),
});

/** The document's entry, 404 for an unsupported module or a document the caller cannot see (RLS). No side effects, unlike currentPdf. */
async function requireDoc(tx: Tx, module: string, id: string) {
  if (!isDocModule(module)) throw new NotFound();
  const d = DOCS[module];
  if ((await tx.execute(sql`SELECT 1 FROM ${sql.identifier(d.table)} WHERE id = ${id} AND deleted_at IS NULL`)).rows.length === 0) throw new NotFound();
  return d;
}

/** POST /{module}/{id}/share_links. 404 for a document or contact the caller cannot see; 202 with Retry-After until the PDF is stored; 422 NO_MOBILE for a contact without a mobile number. */
export async function createShareLink(tx: Tx, module: string, id: string, input: z.infer<typeof CreateShareLinkInput>, baseUrl: string) {
  const d = await requireDoc(tx, module, id);
  const contact = (await tx.execute<{ name: string | null; mobile: string | null }>(sql`
    SELECT nullif(concat_ws(' ', first_name, last_name), '') AS name, mobile FROM contacts WHERE id = ${input.to_contact_id} AND deleted_at IS NULL`)).rows[0];
  if (!contact) throw new NotFound();
  if (!contact.mobile) throw new ApiError(422, "NO_MOBILE", "This contact has no mobile number.", { api_name: "to_contact_id" });
  const { file } = await currentPdf(tx, module, id); // a draft invoice is a 404 here; a quote with no render yet queues one
  // Not an error: throwing would roll back the render that currentPdf just queued. 202 commits it and tells the client to retry.
  if (file?.status !== "ready") return Response.json({ code: "RENDER_QUEUED", message: "The PDF is being prepared; retry shortly." }, { status: 202, headers: { "Retry-After": "5" } });

  const token = newShareToken();
  const linkId = newId();
  const ttl = (await tx.execute<{ days: number }>(sql`SELECT share_link_ttl_days AS days FROM org_settings WHERE org_id = app.org_id()`)).rows[0]?.days ?? 7;
  const created = (await tx.execute<Link>(sql`
    INSERT INTO share_links (id, org_id, file_id, record_type, record_id, token_hash, expires_at, created_by)
    VALUES (${linkId}, app.org_id(), ${file.id}, ${d.recordType}, ${id}, ${hashShareToken(token)}, now() + make_interval(days => ${ttl}), NULLIF(current_setting('app.user_id', true), '')::uuid)
    RETURNING id, file_id, expires_at, revoked_at, last_accessed_at, access_count, created_by, NULL::text AS creator, created_at`)).rows[0]!;
  // Records that the link was shared, not that the message arrived (wa.me cannot confirm delivery).
  await recordEvent(tx, { recordType: d.recordType, recordId: id, eventType: "whatsapp_shared", meta: { share_link_id: linkId, to: contact.name ?? contact.mobile } });

  const url = `${baseUrl}/s/${token}`;
  const text = [input.message, url].filter(Boolean).join("\n");
  return { data: [{ ...shape(created), url, whatsapp_url: `https://wa.me/${contact.mobile.replace(/\D/g, "")}?text=${encodeURIComponent(text)}` }] };
}

/** Keeps the plaintext link out of what the idempotency layer stores: a replay returns the link's metadata only (ADR-0015). */
export const redactShareLinks = (body: { data?: Record<string, unknown>[] }) => ({ ...body, data: body.data?.map(({ url: _u, whatsapp_url: _w, ...rest }) => rest) });

/** GET /{module}/{id}/share_links: the document's links, newest first, never a token. 404 for a document the caller cannot see. */
export async function listShareLinks(tx: Tx, module: string, id: string) {
  const d = await requireDoc(tx, module, id);
  const { rows } = await tx.execute<Link>(sql`
    SELECT s.id, s.file_id, s.expires_at, s.revoked_at, s.last_accessed_at, s.access_count, s.created_by, u.name AS creator, s.created_at
    FROM share_links s LEFT JOIN org_users u ON u.id = s.created_by WHERE s.record_type = ${d.recordType} AND s.record_id = ${id} ORDER BY s.created_at DESC, s.id DESC`);
  return { data: rows.map(shape) };
}

/** DELETE /{module}/{id}/share_links/{link_id}: sets revoked_at (a second call is a no-op). 404 if the link is not this document's or not visible; works on a deleted document's link too. */
export async function revokeShareLink(tx: Tx, module: string, id: string, linkId: string) {
  if (!z.uuid().safeParse(linkId).success || !isDocModule(module)) throw new NotFound();
  const d = DOCS[module]; // no requireDoc: the link's own row-level security decides, and a deleted document's link must stay revocable
  const link = (await tx.execute<{ revoked_at: Date | null }>(sql`SELECT revoked_at FROM share_links WHERE id = ${linkId} AND record_type = ${d.recordType} AND record_id = ${id} FOR UPDATE`)).rows[0];
  if (!link) throw new NotFound();
  if (!link.revoked_at) {
    await tx.execute(sql`UPDATE share_links SET revoked_at = now(), revoked_by = NULLIF(current_setting('app.user_id', true), '')::uuid WHERE id = ${linkId}`);
    await recordEvent(tx, { recordType: d.recordType, recordId: id, eventType: "share_link_revoked", meta: { share_link_id: linkId } });
  }
  return { data: [{ code: "SUCCESS", status: "success", details: { id: linkId } }] };
}

/**
 * The public side (GET /s/{token}): the live link's file, or null for a token that is malformed, unknown, expired or revoked: the caller cannot
 * tell which. One call to the SECURITY DEFINER function, with no tenant context, because the token is the only credential (ADR-0009).
 */
export async function resolveShareLink(token: string): Promise<{ share_link_id: string; storage_key: string; filename: string; content_type: string } | null> {
  if (!TOKEN_FORMAT.test(token)) return null;
  const { rows } = await getAppDb().execute<{ share_link_id: string; storage_key: string; filename: string; content_type: string }>(sql`SELECT * FROM public.resolve_share_link(${hashShareToken(token)})`);
  return rows[0] ?? null;
}
