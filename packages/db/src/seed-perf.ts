import pg from "pg";

// T11.11 (PRD E11 / M6): a 100k-record tenant for the list and detail load test (scripts/load). Set-based SQL through crm_app with the org's admin
// context, so RLS and the audit triggers apply as in production. Idempotent: records carry a `perf-` Zoho id and a re-run adds only what is missing.
// Dev, test and staging only: it refuses to run with NODE_ENV=production.

export type PerfCounts = { accounts: number; contacts: number; leads: number; deals: number };
export const PERF_DEFAULT: PerfCounts = { accounts: 40_000, contacts: 40_000, leads: 10_000, deals: 10_000 };

/** Adds the records inside one transaction. `client` connects as crm_app (DATABASE_URL); the org needs its default pipeline (the dev seed makes it). */
export async function seedPerf(client: pg.Client, ctx: { orgId: string; userId: string }, counts: PerfCounts = PERF_DEFAULT): Promise<PerfCounts> {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed performance data in production.");
  await client.query("BEGIN");
  try {
    await client.query(
      "SELECT set_config('app.org_id', $1, true), set_config('app.user_id', $2, true), set_config('app.role', 'admin', true), set_config('app.see_all', 'on', true), set_config('app.visible_owner_ids', $2, true)",
      [ctx.orgId, ctx.userId],
    );
    const added = (r: pg.QueryResult) => r.rowCount ?? 0;
    const accounts = added(await client.query(
      `INSERT INTO accounts (id, org_id, owner_id, account_name, zoho_id, phone, billing_country)
       SELECT gen_random_uuid(), app.org_id(), $1, 'Perf Account ' || g, 'perf-a-' || g, '+9689' || lpad(g::text, 7, '0'), 'OM' FROM generate_series(1, $2::int) g
       ON CONFLICT (org_id, zoho_id) WHERE zoho_id IS NOT NULL DO NOTHING`, [ctx.userId, counts.accounts]));
    // Contacts and deals hang off the perf accounts in rotation, so every detail page has related lists to load.
    const spread = `JOIN (SELECT id, row_number() OVER (ORDER BY zoho_id) AS rn, count(*) OVER () AS total FROM accounts WHERE zoho_id LIKE 'perf-a-%') a ON a.rn = 1 + g % a.total`;
    const contacts = added(await client.query(
      `INSERT INTO contacts (id, org_id, owner_id, last_name, first_name, email, account_id, zoho_id)
       SELECT gen_random_uuid(), app.org_id(), $1, 'Contact ' || g, 'Perf', 'perf' || g || '@example.test', a.id, 'perf-c-' || g FROM generate_series(1, $2::int) g ${spread}
       ON CONFLICT (org_id, zoho_id) WHERE zoho_id IS NOT NULL DO NOTHING`, [ctx.userId, counts.contacts]));
    const leads = added(await client.query(
      `INSERT INTO leads (id, org_id, owner_id, last_name, company, zoho_id)
       SELECT gen_random_uuid(), app.org_id(), $1, 'Lead ' || g, 'Perf Co ' || g, 'perf-l-' || g FROM generate_series(1, $2::int) g
       ON CONFLICT (org_id, zoho_id) WHERE zoho_id IS NOT NULL DO NOTHING`, [ctx.userId, counts.leads]));
    const deals = added(await client.query(
      `INSERT INTO deals (id, org_id, owner_id, deal_name, account_id, amount, currency, currency_scale, exchange_rate, closing_date, stage_id, zoho_id)
       SELECT gen_random_uuid(), app.org_id(), $1, 'Perf Deal ' || g, a.id, (g % 1000) * 10, 'OMR', 3, 1, date '2027-01-01' + (g % 365),
         (SELECT s.id FROM stages s JOIN pipelines p ON p.id = s.pipeline_id AND p.org_id = s.org_id WHERE p.is_default ORDER BY s.sort_order LIMIT 1), 'perf-d-' || g
       FROM generate_series(1, $2::int) g ${spread}
       ON CONFLICT (org_id, zoho_id) WHERE zoho_id IS NOT NULL DO NOTHING`, [ctx.userId, counts.deals]));
    await client.query("COMMIT");
    await client.query("ANALYZE accounts, contacts, leads, deals");
    return { accounts, contacts, leads, deals };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

if (import.meta.main) {
  const { DATABASE_URL, ORG_ID, USER_ID } = process.env;
  if (!DATABASE_URL || !ORG_ID || !USER_ID) throw new Error("Set DATABASE_URL (crm_app), ORG_ID and USER_ID (an admin of that org).");
  const client = new pg.Client(DATABASE_URL);
  await client.connect();
  try {
    console.log("added", await seedPerf(client, { orgId: ORG_ID, userId: USER_ID }));
  } finally {
    await client.end();
  }
}
