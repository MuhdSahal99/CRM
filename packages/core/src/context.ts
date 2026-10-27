import type { Db } from "@crm/db";
import { sql } from "drizzle-orm";
import { type createAuth, getAuth, getAuthDb } from "./auth.ts";
import type { Role, TenantContext } from "./tenant.ts";

type Deps = { auth: ReturnType<typeof createAuth>; db: Db }; // db connects as crm_auth (ADR-0004)

/**
 * Who is asking, from the session cookie alone: session → active membership → role → visible owners.
 * Recomputed on every request with no cache (ADR-0005), so a deactivation or a reporting-line change applies to the
 * very next request (AC-32). Returns null when there is no usable session; callers answer 401.
 */
export async function resolveContext(headers: Headers, deps: Deps = { auth: getAuth(), db: getAuthDb() }): Promise<TenantContext | null> {
  const session = await deps.auth.api.getSession({ headers });
  if (!session || session.user.banned) return null;

  // Self plus every report, at any depth. UNION (not UNION ALL) stops even if a cycle slipped in (T1.12 forbids them).
  // shortcut: one org per user in the MVP; without an active org a user with several memberships gets no context.
  const { rows } = await deps.db.execute<{ org_id: string; role: Role; visible: string[] }>(sql`
    WITH RECURSIVE me AS (
      SELECT org_id, user_id, role FROM member
      WHERE user_id = ${session.user.id} AND status = 'active'
        AND (${session.session.activeOrganizationId ?? null}::uuid IS NULL OR org_id = ${session.session.activeOrganizationId ?? null}::uuid)
    ), tree AS (
      SELECT org_id, user_id FROM me
      UNION
      SELECT m.org_id, m.user_id FROM member m JOIN tree t ON m.org_id = t.org_id AND m.manager_id = t.user_id
    )
    SELECT me.org_id, me.role, array(SELECT user_id FROM tree WHERE tree.org_id = me.org_id) AS visible FROM me`);
  if (rows.length !== 1) return null;

  const { org_id, role, visible } = rows[0]!;
  return { orgId: org_id, userId: session.user.id, role, visibleOwnerIds: visible, seeAll: role === "admin" };
}
