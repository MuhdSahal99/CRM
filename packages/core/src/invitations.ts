import { type Db, newId, schema } from "@crm/db";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";

// US-03: an invited person opens /accept-invite/{id}, sets their name and password, then signs in. Sign-up is closed
// in Better Auth (auth.ts), so this is the only way a user and membership come to exist. `db` connects as crm_auth.
// The invitation id (a UUID v7) is the secret in the emailed link; it expires after 7 days and works once.

export const AcceptInvitationInput = z.object({ name: z.string().trim().min(1).max(100), password: z.string().min(8).max(128) });

type Pending = { id: string; org_id: string; email: string; role: string; name: string | null; manager_id: string | null };
const pending = (id: string) => sql`SELECT id, org_id, email, role, name, manager_id FROM invitation WHERE id = ${id} AND status = 'pending' AND expires_at > now()`;

/** The invitation behind a link, or null when it is unknown, used, cancelled or expired (all look the same). */
export async function getInvitation(db: Db, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const { rows } = await db.execute<Pending & { org_name: string }>(sql`SELECT i.*, o.name AS org_name FROM (${pending(id)}) i JOIN orgs o ON o.id = i.org_id`);
  return rows[0] ? { email: rows[0].email, name: rows[0].name, orgName: rows[0].org_name } : null;
}

/** Creates the user, their password login and their membership as invited, and closes the invitation, all or nothing. */
export async function acceptInvitation(db: Db, id: string, input: z.infer<typeof AcceptInvitationInput>): Promise<{ ok: true; email: string } | { ok: false; reason: "gone" | "taken" }> {
  const hash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const invitation = (await tx.execute<Pending>(sql`${pending(id)} FOR UPDATE`)).rows[0];
    if (!invitation) return { ok: false, reason: "gone" } as const;
    // An email that already has a login (here or in another org) cannot be claimed by a second invitation.
    if ((await tx.execute(sql`SELECT 1 FROM "user" WHERE email = ${invitation.email}`)).rows.length > 0) return { ok: false, reason: "taken" } as const;

    const userId = newId();
    await tx.insert(schema.user).values({ id: userId, email: invitation.email, name: input.name, emailVerified: true });
    await tx.insert(schema.account).values({ id: newId(), userId, accountId: userId, providerId: "credential", password: hash });
    await tx.insert(schema.member).values({ id: newId(), orgId: invitation.org_id, userId, role: invitation.role, managerId: invitation.manager_id, status: "active", createdAt: new Date() });
    await tx.execute(sql`UPDATE invitation SET status = 'accepted' WHERE id = ${id}`);
    return { ok: true, email: invitation.email } as const;
  });
}
