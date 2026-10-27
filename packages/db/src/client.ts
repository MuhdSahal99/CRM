import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

/** A Drizzle handle over a node-postgres pool. Each role (crm_app, crm_auth) gets its own URL and pool. */
export function createDb(url: string, options: { max?: number } = {}) {
  return drizzle({ client: new pg.Pool({ connectionString: url, max: options.max }), schema });
}

export type Db = ReturnType<typeof createDb>;
