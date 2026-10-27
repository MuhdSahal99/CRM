import pg from "pg";
import { runMigrations } from "../src/migrate";
import { requireEnv } from "./db";

// Fresh schema per run: drop everything the migrations created, then migrate as crm_owner.
export default async function setup() {
  const ownerUrl = requireEnv("TEST_DATABASE_OWNER_URL");
  const owner = new pg.Client(ownerUrl);
  await owner.connect();
  try {
    const { rows } = await owner.query<{ db: string }>("SELECT current_database() AS db");
    // This wipes the database, so refuse anything that is not a test database.
    if (!rows[0]?.db.endsWith("_test")) throw new Error(`Refusing to reset non-test database "${rows[0]?.db}"`);
    await owner.query("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  } finally {
    await owner.end();
  }
  await runMigrations(ownerUrl);
}
