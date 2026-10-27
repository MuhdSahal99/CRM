import { createDb, type Db } from "@crm/db";
import { SEED_ORGS, seed } from "@crm/db/seed";
import { sql } from "drizzle-orm";
import { provisionOrg } from "./metadata/seed-org.ts";
import { createRecords } from "./modules/write.ts";
import { withTenant } from "./tenant.ts";

/** Sample accounts (the first gets a contact) per seeded org, created by its first rep through the record service (skipped once any exist). */
const SAMPLE_ACCOUNTS: Record<string, Record<string, unknown>[]> = {
  "rep.a@saqient.test": [
    { Account_Name: "Al Noor Trading LLC", Industry: "Retail", Billing_City: "Muscat", Billing_Country: "OM" },
    { Account_Name: "Gulf Horizon Logistics", Industry: "Transportation", Billing_City: "Dubai", Billing_Country: "AE" },
  ],
  "rep@demo.test": [{ Account_Name: "Demo Customer", Billing_Country: "OM" }],
};

/**
 * Dev and test data (docs/PRODUCTION_READINESS.md § Seeded test users): users and orgs as crm_auth, then each
 * seeded org's metadata through provisionOrg as crm_app, under that org's admin, exactly like real onboarding.
 */
export async function seedAll(authDb: Db, appDb: Db, password: string): Promise<void> {
  await seed(authDb, password);
  const { rows } = await authDb.execute<{ org_id: string; user_id: string }>(sql`
    SELECT DISTINCT ON (m.org_id) m.org_id, m.user_id FROM member m JOIN orgs o ON o.id = m.org_id
    WHERE o.slug IN ${SEED_ORGS.map((o) => o.slug)} AND m.role = 'admin' AND m.status = 'active'
    ORDER BY m.org_id, m.created_at`);
  for (const { org_id, user_id } of rows) {
    await withTenant({ orgId: org_id, userId: user_id, role: "admin", visibleOwnerIds: [user_id], seeAll: true }, provisionOrg, appDb);
  }
  const reps = await authDb.execute<{ org_id: string; user_id: string; email: string }>(sql`
    SELECT m.org_id, m.user_id, u.email FROM member m JOIN "user" u ON u.id = m.user_id WHERE u.email IN ${Object.keys(SAMPLE_ACCOUNTS)}`);
  for (const rep of reps.rows) {
    const ctx = { orgId: rep.org_id, userId: rep.user_id, role: "rep" as const, visibleOwnerIds: [rep.user_id], seeAll: false };
    await withTenant(ctx, async (tx) => {
      if ((await tx.execute(sql`SELECT 1 FROM accounts LIMIT 1`)).rows.length > 0) return;
      const [first] = await createRecords(tx, ctx, "Accounts", { data: SAMPLE_ACCOUNTS[rep.email]! });
      const contact = { First_Name: "Ahmed", Last_Name: "Al Balushi", Mobile: "9123 4567", Mailing_Country: "OM", Account_Name: { id: first!.details.id } };
      await createRecords(tx, ctx, "Contacts", { data: [contact] });
    }, appDb);
  }
}

if (import.meta.main) {
  const { DATABASE_URL, DATABASE_AUTH_URL, SEED_PASSWORD } = process.env;
  if (!DATABASE_URL || !DATABASE_AUTH_URL || !SEED_PASSWORD) throw new Error("DATABASE_URL, DATABASE_AUTH_URL and SEED_PASSWORD must be set (see .env.example)");
  const [authDb, appDb] = [createDb(DATABASE_AUTH_URL, { max: 1 }), createDb(DATABASE_URL, { max: 1 })];
  try {
    await seedAll(authDb, appDb, SEED_PASSWORD);
    console.log(`seeded and provisioned ${SEED_ORGS.length} orgs`);
  } finally {
    await Promise.all([authDb.$client.end(), appDb.$client.end()]);
  }
}
