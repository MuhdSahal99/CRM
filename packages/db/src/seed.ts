import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { createDb, type Db } from "./client.ts";
import { newId } from "./id.ts";
import { account, member, orgs, user } from "./schema/index.ts";

// Dev and test data only (TRD § Environments). Documented in docs/PRODUCTION_READINESS.md § Seeded test users.
// Every user shares one password from SEED_PASSWORD; nothing secret is in the code.
export const SEED_ORGS = [
  { slug: "saqient", name: "Saqient" },
  { slug: "demo", name: "Demo" },
] as const;

type SeedUser = { email: string; name: string; org: "saqient" | "demo"; role: "admin" | "manager" | "rep"; manager?: string; deactivated?: true };

export const SEED_USERS: readonly SeedUser[] = [
  { email: "admin@saqient.test", name: "Saqient Admin", org: "saqient", role: "admin" },
  { email: "manager@saqient.test", name: "Sales Manager", org: "saqient", role: "manager" },
  { email: "rep.a@saqient.test", name: "Rep A", org: "saqient", role: "rep", manager: "manager@saqient.test" },
  { email: "rep.b@saqient.test", name: "Rep B", org: "saqient", role: "rep", manager: "manager@saqient.test" },
  { email: "deactivated@saqient.test", name: "Deactivated Rep", org: "saqient", role: "rep", manager: "manager@saqient.test", deactivated: true },
  { email: "admin@demo.test", name: "Demo Admin", org: "demo", role: "admin" },
  { email: "rep@demo.test", name: "Demo Rep", org: "demo", role: "rep" },
];

/** Inserts what is missing and never changes existing rows, so it is safe to re-run. `db` must connect as crm_auth. */
export async function seed(db: Db, password: string): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production: seeded users are for dev and test only.");
  const hash = await hashPassword(password);

  await db.transaction(async (tx) => {
    const now = new Date();
    await tx.insert(orgs).values(SEED_ORGS.map((o) => ({ id: newId(), ...o, createdAt: now }))).onConflictDoNothing({ target: orgs.slug });
    await tx
      .insert(user)
      .values(SEED_USERS.map((u) => ({ id: newId(), email: u.email, name: u.name, banned: Boolean(u.deactivated) })))
      .onConflictDoNothing({ target: user.email });

    const orgId = new Map((await tx.select({ id: orgs.id, slug: orgs.slug }).from(orgs)).map((o) => [o.slug, o.id]));
    const userId = new Map((await tx.select({ id: user.id, email: user.email }).from(user)).map((u) => [u.email, u.id]));
    const idOf = (email: string) => userId.get(email)!;

    for (const u of SEED_USERS) {
      const existing = await tx.select({ id: account.id }).from(account).where(and(eq(account.userId, idOf(u.email)), eq(account.providerId, "credential")));
      if (existing.length === 0) {
        await tx.insert(account).values({ id: newId(), userId: idOf(u.email), accountId: idOf(u.email), providerId: "credential", password: hash });
      }
    }

    // Managers before their reports: the composite FK needs the manager's membership to exist.
    const ordered = [...SEED_USERS].sort((a, b) => Number(Boolean(a.manager)) - Number(Boolean(b.manager)));
    for (const u of ordered) {
      await tx
        .insert(member)
        .values({
          id: newId(),
          orgId: orgId.get(u.org)!,
          userId: idOf(u.email),
          role: u.role,
          managerId: u.manager ? idOf(u.manager) : null,
          status: u.deactivated ? "deactivated" : "active",
          createdAt: now,
        })
        .onConflictDoNothing({ target: [member.orgId, member.userId] });
    }
  });
}

if (import.meta.main) {
  const url = process.env.DATABASE_AUTH_URL;
  const password = process.env.SEED_PASSWORD;
  if (!url || !password) throw new Error("DATABASE_AUTH_URL and SEED_PASSWORD must be set (see .env.example)");
  const db = createDb(url, { max: 1 });
  try {
    await seed(db, password);
    console.log(`seeded ${SEED_ORGS.length} orgs and ${SEED_USERS.length} users`);
  } finally {
    await db.$client.end();
  }
}
