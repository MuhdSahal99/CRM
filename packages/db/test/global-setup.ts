import pg from "pg";
import { runMigrations } from "../src/migrate";
import { requireEnv } from "./db";

// Fresh schema per run: drop everything the migrations created, then migrate as crm_owner.
export default async function setup() {
  try {
    await resetAndMigrate(requireEnv("TEST_DATABASE_OWNER_URL"));
  } catch (error) {
    // Vitest 5 crashes while printing global-setup errors (code.charCodeAt), hiding the cause; print it first.
    console.error("Test database setup failed:", error instanceof Error ? error.message : error);
    throw error;
  }
}

async function resetAndMigrate(ownerUrl: string) {
  const owner = new pg.Client(ownerUrl);
  await owner.connect();
  try {
    const { rows } = await owner.query<{ db: string }>("SELECT current_database() AS db");
    // This wipes the database, so refuse anything that is not a test database.
    if (!rows[0]?.db.endsWith("_test")) throw new Error(`Refusing to reset non-test database "${rows[0]?.db}"`);
    // Everything crm_owner owns in this database (every schema the migrations created, including public).
    await owner.query("DROP OWNED BY CURRENT_USER; CREATE SCHEMA public;");
  } finally {
    await owner.end();
  }
  await runMigrations(ownerUrl);
}
