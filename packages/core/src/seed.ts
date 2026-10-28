import { createDb, type Db } from "@crm/db";
import { SEED_ORGS, seed } from "@crm/db/seed";
import { sql } from "drizzle-orm";
import { provisionOrg } from "./metadata/seed-org.ts";
import { convertSalesOrder } from "./conversions.ts";
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

/** Activities for Saqient's first rep: a task that is always overdue (its due date is long past) for My Activities, and one of each kind for the visibility matrix. */
const SAMPLE_ACTIVITIES: Record<string, [module: string, record: Record<string, unknown>][]> = {
  "rep.a@saqient.test": [
    ["Tasks", { Subject: "Follow up with Al Noor", Due_Date: "2020-01-01", Priority: "High", Status: "Not Started" }],
    ["Calls", { Subject: "Intro call", Call_Type: "Outbound", Call_Start_Time: "2026-01-05T09:00:00+04:00", Call_Duration_Seconds: 300, Status: "Held" }],
    ["Meetings", { Subject: "Kick-off", Start_DateTime: "2026-01-06T10:00:00+04:00", End_DateTime: "2026-01-06T11:00:00+04:00", Venue: "Muscat" }],
  ],
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
    const admin = { orgId: org_id, userId: user_id, role: "admin" as const, visibleOwnerIds: [user_id], seeAll: true };
    await withTenant(admin, provisionOrg, appDb);
    await withTenant(admin, async (tx) => {
      if ((await tx.execute(sql`SELECT 1 FROM products LIMIT 1`)).rows.length === 0) {
        await createRecords(tx, admin, "Products", { data: [{ Product_Name: "Consulting day", Product_Code: "CONS-DAY", VAT_Category: "standard", Unit_Price: "250.000", Usage_Unit: "day" }] });
      }
    }, appDb);
  }
  const reps = await authDb.execute<{ org_id: string; user_id: string; email: string }>(sql`
    SELECT m.org_id, m.user_id, u.email FROM member m JOIN "user" u ON u.id = m.user_id WHERE u.email IN ${Object.keys(SAMPLE_ACCOUNTS)}`);
  for (const rep of reps.rows) {
    const ctx = { orgId: rep.org_id, userId: rep.user_id, role: "rep" as const, visibleOwnerIds: [rep.user_id], seeAll: false };
    await withTenant(ctx, async (tx) => {
      if ((await tx.execute(sql`SELECT 1 FROM accounts LIMIT 1`)).rows.length === 0) {
        const [first] = await createRecords(tx, ctx, "Accounts", { data: SAMPLE_ACCOUNTS[rep.email]! });
        const contact = { First_Name: "Ahmed", Last_Name: "Al Balushi", Mobile: "9123 4567", Mailing_Country: "OM", Account_Name: { id: first!.details.id } };
        await createRecords(tx, ctx, "Contacts", { data: [contact] });
      }
      if ((await tx.execute(sql`SELECT 1 FROM leads LIMIT 1`)).rows.length === 0) {
        await createRecords(tx, ctx, "Leads", { data: [{ First_Name: "Salim", Last_Name: "Al Rawahi", Company: "Rawahi Contracting", Lead_Status: "Not Contacted", Lead_Source: "Trade Show" }] });
      }
      if (SAMPLE_ACCOUNTS[rep.email]!.length > 1 && (await tx.execute(sql`SELECT 1 FROM deals LIMIT 1`)).rows.length === 0) {
        const stage = (await tx.execute<{ id: string }>(sql`SELECT id FROM stages WHERE api_value = 'Qualification'`)).rows[0];
        const account = (await tx.execute<{ id: string }>(sql`SELECT id FROM accounts WHERE account_name = 'Al Noor Trading LLC'`)).rows[0];
        if (stage && account) {
          await createRecords(tx, ctx, "Deals", { data: [{ Deal_Name: "Al Noor fit-out", Account_Name: { id: account.id }, Amount: "10000.000", Closing_Date: "2026-12-31", Stage: { id: stage.id } }] });
        }
      }
      if (SAMPLE_ACCOUNTS[rep.email]!.length > 1 && (await tx.execute(sql`SELECT 1 FROM quotes LIMIT 1`)).rows.length === 0) {
        const account = (await tx.execute<{ id: string }>(sql`SELECT id FROM accounts WHERE account_name = 'Al Noor Trading LLC'`)).rows[0];
        const product = (await tx.execute<{ id: string }>(sql`SELECT id FROM products LIMIT 1`)).rows[0];
        if (account && product) {
          await createRecords(tx, ctx, "Quotes", { data: [{ Subject: "Al Noor fit-out quote", Account_Name: { id: account.id }, Line_Items: [{ Product: { id: product.id }, Quantity: "2" }] }] });
        }
      }
      if (SAMPLE_ACCOUNTS[rep.email]!.length > 1 && (await tx.execute(sql`SELECT 1 FROM sales_orders LIMIT 1`)).rows.length === 0) {
        const account = (await tx.execute<{ id: string }>(sql`SELECT id FROM accounts WHERE account_name = 'Al Noor Trading LLC'`)).rows[0];
        const product = (await tx.execute<{ id: string }>(sql`SELECT id FROM products LIMIT 1`)).rows[0];
        if (account && product) {
          await createRecords(tx, ctx, "Sales_Orders", { data: [{ Subject: "Al Noor fit-out order", Account_Name: { id: account.id }, Line_Items: [{ Product: { id: product.id }, Quantity: "2" }] }] });
        }
      }
      if ((await tx.execute(sql`SELECT 1 FROM invoices LIMIT 1`)).rows.length === 0) {
        const so = (await tx.execute<{ id: string }>(sql`SELECT id FROM sales_orders WHERE subject = 'Al Noor fit-out order'`)).rows[0];
        if (so) await convertSalesOrder(tx, so.id);
      }
      if (SAMPLE_ACTIVITIES[rep.email] && (await tx.execute(sql`SELECT 1 FROM activities LIMIT 1`)).rows.length === 0) {
        for (const [module, record] of SAMPLE_ACTIVITIES[rep.email]!) await createRecords(tx, ctx, module, { data: [record] });
      }
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
