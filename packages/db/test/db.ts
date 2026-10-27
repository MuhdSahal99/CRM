import pg from "pg";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client(url);
  await client.connect();
  return client;
}

/** A client on the test database as crm_app, the role the app uses (ADR-0003: never test as a superuser). */
export const connectAsApp = () => connect(requireEnv("TEST_DATABASE_URL"));

/** A client on the test database as crm_auth (Better Auth's role, ADR-0004): same host and db as crm_app. */
export function connectAsAuth(): Promise<pg.Client> {
  const url = new URL(requireEnv("TEST_DATABASE_URL"));
  url.username = "crm_auth";
  url.password = requireEnv("CRM_AUTH_PASSWORD");
  return connect(url.href);
}

/** Fixture: a new org, created as crm_auth (the only role that may write auth tables). Returns its id. */
export async function createOrg(auth: pg.Client): Promise<string> {
  const { rows } = await auth.query(
    `INSERT INTO orgs (id, name, slug, created_at) VALUES (gen_random_uuid(), 'Org', 'org-' || gen_random_uuid(), now()) RETURNING id`,
  );
  return rows[0].id;
}

/** Fixture: a new user who is a member of `orgId`. Returns the user id. */
export async function createMember(auth: pg.Client, orgId: string, role = "rep", managerId: string | null = null): Promise<string> {
  const { rows } = await auth.query(
    `WITH u AS (INSERT INTO "user" (id, name, email, created_at, updated_at)
       VALUES (gen_random_uuid(), 'U', gen_random_uuid() || '@example.com', now(), now()) RETURNING id)
     INSERT INTO member (id, org_id, user_id, role, manager_id, created_at)
     SELECT gen_random_uuid(), $1, u.id, $2, $3, now() FROM u RETURNING user_id`,
    [orgId, role, managerId],
  );
  return rows[0].user_id;
}

/** Runs `sql` in one transaction with `app.*` settings applied transaction-locally, like withTenant (ADR-0003). */
export async function queryAs(client: pg.Client, settings: Record<string, string>, sql: string, params: unknown[] = []) {
  await client.query("BEGIN");
  try {
    for (const [key, value] of Object.entries(settings)) await client.query("SELECT set_config($1, $2, true)", [`app.${key}`, value]);
    return (await client.query(sql, params)).rows;
  } finally {
    await client.query("COMMIT");
  }
}
