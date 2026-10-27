import { createDb, type Db } from "@crm/db";
import { sql } from "drizzle-orm";
import { parseConfig } from "./config";

export type Role = "admin" | "manager" | "rep";

/** Who is asking, resolved on the server from the session (T1.11). Never built from client input. */
export type TenantContext = {
  orgId: string;
  userId: string;
  role: Role;
  visibleOwnerIds: readonly string[]; // self + all reports (ADR-0005)
  seeAll: boolean; // admin
};

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

let appDb: Db | undefined;

/**
 * The only way @crm/core touches the database (ADR-0003). Runs `fn` in one transaction whose app.* settings are
 * transaction-local, so RLS sees this tenant and a pooled connection carries nothing into the next request.
 * `db` is for tests; the app uses its crm_app pool.
 */
export function withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>, db: Db = (appDb ??= createDb(parseConfig(process.env).DATABASE_URL))): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT
      set_config('app.org_id', ${ctx.orgId}, true),
      set_config('app.user_id', ${ctx.userId}, true),
      set_config('app.role', ${ctx.role}, true),
      set_config('app.visible_owner_ids', ${ctx.visibleOwnerIds.join(",")}, true),
      set_config('app.see_all', ${ctx.seeAll ? "on" : "off"}, true)`);
    return fn(tx);
  });
}
