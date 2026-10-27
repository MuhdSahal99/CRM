import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, foreignKey, integer, jsonb, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { member, orgs } from "./auth.ts";

// Column groups from SCHEMA § Conventions, shared by every tenant table.

export const tstz = (name: string) => timestamp(name, { withTimezone: true });

// The trigger app.set_audit_columns() (migration 0007) sets these from the context anyway; this only spares callers.
const currentUser = sql`NULLIF(current_setting('app.user_id', true), '')::uuid`;

type Cols = Record<string, AnyPgColumn>;
const memberFk = (table: string, column: string, t: Cols, key: string) =>
  foreignKey({ name: `${table}_${column}_fk`, columns: [t.orgId!, t[key]!], foreignColumns: [member.orgId, member.userId] }).onDelete("restrict");

/** org_id plus the AUDIT columns. */
export const AUDIT = () => ({
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "restrict" }),
  createdAt: tstz("created_at").notNull().defaultNow(),
  createdBy: uuid("created_by").notNull().$defaultFn(() => currentUser),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
  updatedBy: uuid("updated_by").notNull().$defaultFn(() => currentUser),
  version: integer("version").notNull().default(1),
});

/** created_by and updated_by are members of the same org: composite FKs, so they cannot name another org's user. */
export const auditFks = (table: string, t: Cols) => [memberFk(table, "created_by", t, "createdBy"), memberFk(table, "updated_by", t, "updatedBy")];

export const SOFT = () => ({ deletedAt: tstz("deleted_at"), deletedBy: uuid("deleted_by") });

/** AUDIT + SOFT + owner + custom fields (ADR-0006). */
export const REC = () => ({
  ...AUDIT(),
  ...SOFT(),
  ownerId: uuid("owner_id").notNull(),
  custom: jsonb("custom").notNull().default({}),
});

export const recFks = (table: string, t: Cols) => [...auditFks(table, t), memberFk(table, "owner_id", t, "ownerId"), memberFk(table, "deleted_by", t, "deletedBy")];

/** Rows that can come from the Zoho import (US-17). */
export const ZOHO = () => ({ zohoId: text("zoho_id"), needsReview: boolean("needs_review").notNull().default(false) });

export const zohoIdx = (table: string, t: Cols) => uniqueIndex(`${table}_zoho_id_key`).on(t.orgId!, t.zohoId!).where(sql`${t.zohoId} IS NOT NULL`);
