import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.ts";

/** A Drizzle handle over a node-postgres pool. Each role (crm_app, crm_auth) gets its own URL and pool. */
export function createDb(url: string, options: { max?: number } = {}) {
  // A `date` column is a business date (SCHEMA § Conventions): hand it over as "YYYY-MM-DD", not as a Date at local midnight.
  const types = { getTypeParser: (oid: number, format?: "text" | "binary") => (oid === 1082 ? (v: string) => v : pg.types.getTypeParser(oid, format as "text")) };
  return drizzle({ client: new pg.Pool({ connectionString: url, max: options.max, types }), schema });
}

export type Db = ReturnType<typeof createDb>;
