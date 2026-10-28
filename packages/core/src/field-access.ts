import { sql } from "drizzle-orm";
import { Forbidden } from "./http/errors.ts";
import type { Tx } from "./tenant.ts";

/**
 * Status is read-only for PUT (system flag), so a transition action checks the role's own grant on the field: only read_write
 * may move it. A missing field or a hidden/read grant is a 403.
 */
export async function requireFieldWrite(tx: Tx, module: string, field: string) {
  const access = (await tx.execute<{ access: string }>(sql`
    SELECT COALESCE(fp.access, 'read_write') AS access FROM fields f JOIN modules m ON m.id = f.module_id
    LEFT JOIN field_permissions fp ON fp.field_id = f.id AND fp.role = current_setting('app.role', true)
    WHERE m.api_name = ${module} AND f.api_name = ${field}`)).rows[0]?.access;
  if (access !== "read_write") throw new Forbidden();
}
