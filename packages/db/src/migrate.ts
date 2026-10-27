import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import pg from "pg";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

/** Applies pending migrations. `ownerUrl` must connect as crm_owner; the app roles have no DDL rights. */
export async function runMigrations(ownerUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: ownerUrl, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  const url = process.env.DATABASE_OWNER_URL;
  if (!url) throw new Error("DATABASE_OWNER_URL is not set (see .env.example)");
  await runMigrations(url);
  console.log("migrations applied");
}
