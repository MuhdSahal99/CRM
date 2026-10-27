import { sql } from "drizzle-orm";
import { boolean, check, customType, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

// Better Auth 1.7 tables (ADR-0004), from `npx auth generate` then aligned with docs/SCHEMA.md:
// timestamptz, citext emails, RESTRICT on org FKs, our three roles, and no DB id default (the app sets UUID v7).
// Property names are the ones Better Auth reads; the auth config must map organization → orgs and
// organizationId → orgId, or the adapter will not find these columns.
// The composite manager FK (ON DELETE SET NULL (manager_id)) and all grants and RLS are hand-written SQL.

export const citext = customType<{ data: string }>({ dataType: () => "citext" });
const tstz = (name: string) => timestamp(name, { withTimezone: true });

export const user = pgTable("user", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: citext("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: tstz("created_at").notNull().defaultNow(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
  role: text("role"), // admin plugin's global role; CRM roles live on member.role
  banned: boolean("banned").default(false), // true = deactivated (US-01, US-03)
  banReason: text("ban_reason"),
  banExpires: tstz("ban_expires"),
});

export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey(),
    expiresAt: tstz("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: tstz("created_at").notNull().defaultNow(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: uuid("impersonated_by"), // admin plugin
    activeOrganizationId: uuid("active_organization_id"),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: tstz("access_token_expires_at"),
    refreshTokenExpiresAt: tstz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"), // Better Auth hash
    createdAt: tstz("created_at").notNull().defaultNow(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: uuid("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: tstz("expires_at").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: tstz("created_at").notNull(),
});

export const member = pgTable(
  "member",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    managerId: uuid("manager_id"), // composite FK (org_id, manager_id) → member(org_id, user_id), in SQL
    status: text("status").notNull().default("active"),
    createdAt: tstz("created_at").notNull(),
  },
  (t) => [
    unique("member_org_id_user_id_key").on(t.orgId, t.userId),
    index("member_org_id_manager_id_idx").on(t.orgId, t.managerId),
    index("member_user_id_idx").on(t.userId),
    check("member_role_check", sql`${t.role} IN ('admin', 'manager', 'rep')`),
    check("member_status_check", sql`${t.status} IN ('active', 'deactivated')`),
    check("member_manager_not_self", sql`${t.managerId} <> ${t.userId}`),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "restrict" }),
    email: citext("email").notNull(),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    expiresAt: tstz("expires_at").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    // Ours, not Better Auth's: what the Admin chose at invite time, applied to the membership on accept (US-03).
    name: text("name"),
    managerId: uuid("manager_id"), // composite FK (org_id, manager_id) → member(org_id, user_id), in SQL
  },
  (t) => [
    index("invitation_org_id_email_idx").on(t.orgId, t.email),
    check("invitation_role_check", sql`${t.role} IN ('admin', 'manager', 'rep')`),
    check("invitation_status_check", sql`${t.status} IN ('pending', 'accepted', 'rejected', 'canceled')`),
  ],
);
