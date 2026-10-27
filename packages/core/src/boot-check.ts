import type { Db } from "@crm/db";
import { sql } from "drizzle-orm";
import { parseConfig } from "./config.ts";
import { getAppDb } from "./tenant.ts";

/** Throws unless the connection's role is subject to RLS and cannot change the schema (ADR-0003, AC-19). */
export async function assertSafeDbRole(db: Db): Promise<void> {
  const { rows } = await db.execute<{ role: string; unsafe: boolean }>(sql`
    SELECT current_user AS role, rolsuper OR rolbypassrls OR has_schema_privilege('public', 'CREATE') AS unsafe
    FROM pg_roles WHERE rolname = current_user`);
  const row = rows[0];
  if (!row || row.unsafe) {
    throw new Error(`Refusing to start: database role "${row?.role}" can bypass RLS or change the schema; connect as crm_app (ADR-0003).`);
  }
}

/** Run once at server start: a bad environment or an unsafe DB role stops the process before it serves requests. */
export async function bootCheck(): Promise<void> {
  parseConfig(process.env);
  await assertSafeDbRole(getAppDb());
}
