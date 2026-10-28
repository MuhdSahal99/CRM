import { sql } from "drizzle-orm";
import { check, customType, foreignKey, index, integer, pgTable, uuid } from "drizzle-orm/pg-core";
import { tstz } from "./_columns.ts";
import { member, orgs } from "./auth.ts";
import { files } from "./files.ts";
import { recordType } from "./timeline.ts";

// SCHEMA § share_links (ADR-0009): a link to ONE immutable PDF file, found by the sha256 of an unguessable token that is never stored. The one
// cross-org reader is the SECURITY DEFINER function resolve_share_link (migration 0028, hand-written with the grants, RLS and the owner policies).

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    fileId: uuid("file_id").notNull(),
    recordType: recordType("record_type").notNull(),
    recordId: uuid("record_id").notNull(),
    tokenHash: bytea("token_hash").notNull().unique("share_links_token_hash_key"),
    expiresAt: tstz("expires_at").notNull(),
    revokedAt: tstz("revoked_at"),
    revokedBy: uuid("revoked_by"),
    lastAccessedAt: tstz("last_accessed_at"),
    accessCount: integer("access_count").notNull().default(0),
    createdAt: tstz("created_at").notNull().defaultNow(),
    createdBy: uuid("created_by").notNull().$defaultFn(() => sql`NULLIF(current_setting('app.user_id', true), '')::uuid`),
  },
  (t) => [
    check("share_links_ttl", sql`${t.expiresAt} > ${t.createdAt} AND ${t.expiresAt} <= ${t.createdAt} + interval '30 days'`),
    check("share_links_token_hash_len", sql`octet_length(${t.tokenHash}) = 32`),
    index("share_links_record_idx").on(t.orgId, t.recordType, t.recordId, sql`${t.createdAt} DESC`),
    foreignKey({ name: "share_links_file_fk", columns: [t.orgId, t.fileId], foreignColumns: [files.orgId, files.id] }).onDelete("restrict"),
    foreignKey({ name: "share_links_created_by_fk", columns: [t.orgId, t.createdBy], foreignColumns: [member.orgId, member.userId] }).onDelete("restrict"),
    foreignKey({ name: "share_links_revoked_by_fk", columns: [t.orgId, t.revokedBy], foreignColumns: [member.orgId, member.userId] }).onDelete("restrict"),
  ],
);
