import { type Db, newId, schema } from "@crm/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getAuthDb } from "./auth.ts";
import { ApiError, Conflict, NotFound } from "./http/errors.ts";
import { hashInviteToken, newInviteToken } from "./invitations.ts";
import type { TenantContext, Tx } from "./tenant.ts";
import { recordEvent } from "./timeline.ts";

export const RoleName = z.enum(["admin", "manager", "rep"]).meta({ id: "Role" });
const managerId = z.uuid().nullable().optional();

export const ListUsersInput = z.object({
  status: z.enum(["active", "deactivated"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(200).default(20),
});
export const InviteUsersInput = z.object({
  data: z.array(z.object({ email: z.email().max(254), name: z.string().trim().min(1).max(120), role: RoleName, manager_id: managerId })).min(1).max(20),
});
export const UpdateUserInput = z.object({ data: z.array(z.object({ role: RoleName.optional(), manager_id: managerId })).length(1) });

const INVITE_TTL_DAYS = 7;

// Members of the current org (org_users is RLS-scoped) plus, for admins and unless filtered by status, pending invitations.
const USERS = sql`
  SELECT u.id, u.name, u.email, u.role, u.status,
    CASE WHEN mgr.id IS NULL THEN NULL ELSE json_build_object('id', mgr.id, 'name', mgr.name) END AS manager
  FROM (
    SELECT id, name, email, role, manager_id, status FROM org_users
    UNION ALL
    SELECT id, COALESCE(name, email), email, role, manager_id, 'invited' FROM invitation
    WHERE status = 'pending' AND expires_at > now() AND current_setting('app.role', true) = 'admin' -- admins only
  ) u LEFT JOIN org_users mgr ON mgr.id = u.manager_id`;

/** GET /users: every role may read names for owner pickers. */
export async function listUsers(tx: Tx, { status, page, per_page }: z.infer<typeof ListUsersInput>) {
  const { rows } = await tx.execute(sql`
    SELECT * FROM (${USERS}) x WHERE ${status ?? null}::text IS NULL OR x.status = ${status ?? null}
    ORDER BY x.name, x.id LIMIT ${per_page + 1} OFFSET ${(page - 1) * per_page}`);
  return { data: rows.slice(0, per_page), info: { page, per_page, count: Math.min(rows.length, per_page), more_records: rows.length > per_page } };
}

/** GET /users/{id}: a member of the caller's org, or 404. */
export async function getUser(tx: Tx, id: string) {
  const { rows } = await tx.execute(sql`SELECT * FROM (${USERS}) x WHERE x.id = ${id} AND x.status <> 'invited'`);
  if (rows.length === 0) throw new NotFound();
  return rows;
}

/** POST /users (Admin): one pending invitation per person, returned with the link that accepts it. */
export async function inviteUsers(tx: Tx, ctx: TenantContext, input: z.infer<typeof InviteUsersInput>, baseUrl: string) {
  const outcomes = [];
  for (const person of input.data) {
    const taken = await tx.execute(sql`
      SELECT 1 FROM org_users WHERE email = ${person.email}
      UNION ALL SELECT 1 FROM invitation WHERE email = ${person.email} AND status = 'pending' AND expires_at > now()`);
    if (taken.rows.length > 0) {
      const message = "This email already belongs to a member or has a pending invitation.";
      outcomes.push({ code: "DUPLICATE_DATA", status: "error", message, details: { api_name: "email" } });
      continue;
    }
    if (person.manager_id && (await tx.execute(sql`SELECT 1 FROM org_users WHERE id = ${person.manager_id}`)).rows.length === 0) {
      outcomes.push({ code: "INVALID_DATA", status: "error", message: "This manager is not a member.", details: { api_name: "manager_id" } });
      continue;
    }
    const id = newId();
    const token = newInviteToken();
    await tx.insert(schema.invitation).values({
      id,
      orgId: ctx.orgId,
      email: person.email,
      name: person.name,
      role: person.role,
      managerId: person.manager_id ?? null,
      status: "pending",
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
      inviterId: ctx.userId,
      tokenHash: hashInviteToken(token),
    });
    outcomes.push({ code: "SUCCESS", status: "success", details: { id, accept_url: `${baseUrl}/accept-invite/${token}` } });
  }
  return outcomes;
}

/**
 * PUT /users/{id} (Admin): role and/or reporting manager, logged as role_changed. Cycles are refused (T1.12).
 * An admin cannot change their own role: demoting the last admin would lock the org out of user management.
 */
export async function updateUser(tx: Tx, ctx: TenantContext, id: string, input: z.infer<typeof UpdateUserInput>) {
  const change = input.data[0]!;
  const { rows } = await tx.execute<{ role: string; manager_id: string | null }>(sql`SELECT role, manager_id FROM member WHERE user_id = ${id} FOR UPDATE`);
  const before = rows[0];
  if (!before) throw new NotFound();
  if (id === ctx.userId && change.role !== undefined && change.role !== before.role) {
    throw new Conflict("INVALID_STATE", "You cannot change your own role.");
  }

  const after = { role: change.role ?? before.role, manager_id: change.manager_id === undefined ? before.manager_id : change.manager_id };
  try {
    await tx.execute(sql`UPDATE member SET role = ${after.role}, manager_id = ${after.manager_id} WHERE user_id = ${id}`);
  } catch (error) {
    // member_no_cycle / member_manager_not_self (23514) or a manager outside this org (23503, composite FK).
    const code = (error as { cause?: { code?: string } }).cause?.code;
    if (code === "23514" || code === "23503") {
      throw new ApiError(422, "INVALID_DATA", "This manager is not allowed.", { api_name: "manager_id" });
    }
    throw error;
  }

  const changes = Object.fromEntries(
    (["role", "manager_id"] as const).filter((k) => after[k] !== before[k]).map((k) => [k, [before[k], after[k]] as [unknown, unknown]]),
  );
  if (Object.keys(changes).length > 0) await recordEvent(tx, { recordType: "user", recordId: id, eventType: "role_changed", changes });
  return [{ code: "SUCCESS", status: "success", details: { id } }];
}

/**
 * POST /users/{id}/actions/deactivate (Admin, US-01/US-03). The membership change and its timeline event are in the
 * tenant transaction; the ban and session revocation go through crm_auth last, so if they fail the whole call rolls
 * back. Their records keep their owner until an Admin transfers them (T5.10).
 */
export async function deactivateUser(tx: Tx, ctx: TenantContext, id: string, authDb: Db = getAuthDb()) {
  const { rows } = await tx.execute<{ status: string }>(sql`SELECT status FROM member WHERE user_id = ${id} FOR UPDATE`);
  if (rows.length === 0) throw new NotFound();
  if (id === ctx.userId) throw new Conflict("INVALID_STATE", "You cannot deactivate yourself.");
  if (rows[0]!.status === "deactivated") throw new Conflict("INVALID_STATE", "This user is already deactivated.");

  await tx.execute(sql`UPDATE member SET status = 'deactivated' WHERE user_id = ${id}`);
  await recordEvent(tx, { recordType: "user", recordId: id, eventType: "user_deactivated", changes: { status: ["active", "deactivated"] } });
  // shortcut: one org per user in the MVP, so the ban is global; with several memberships, ban only on the last one.
  await authDb.transaction(async (auth) => {
    await auth.execute(sql`UPDATE "user" SET banned = true, ban_reason = 'deactivated' WHERE id = ${id}`);
    await auth.execute(sql`DELETE FROM session WHERE user_id = ${id}`);
  });
  return [{ code: "SUCCESS", status: "success", details: { id } }];
}

/** The signed-in user and their org, for the app shell (both rows are RLS-scoped to the current org). */
export async function getMe(tx: Tx, userId: string) {
  const { rows } = await tx.execute<{ org_name: string; name: string; email: string }>(
    sql`SELECT o.name AS org_name, u.name, u.email FROM orgs o, org_users u WHERE u.id = ${userId}`,
  );
  if (rows.length === 0) throw new NotFound();
  return rows[0]!;
}
