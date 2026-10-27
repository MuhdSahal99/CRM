import pg from "pg";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

/** A client on the test database as crm_app, the role the app uses (ADR-0003: never test as a superuser). */
export async function connectAsApp(): Promise<pg.Client> {
  const client = new pg.Client(requireEnv("TEST_DATABASE_URL"));
  await client.connect();
  return client;
}
