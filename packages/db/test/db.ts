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
