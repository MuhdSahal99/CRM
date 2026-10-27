import { createHash } from "node:crypto";
import type { Db } from "@crm/db";
import { sql } from "drizzle-orm";
import { getAppDb, type TenantContext, type Tx, withTenant } from "../tenant.ts";
import { ApiError, Conflict } from "./errors.ts";

/** What makes two requests "the same intent": method, path and parsed body. */
export const requestHash = (method: string, path: string, body: unknown): Buffer =>
  createHash("sha256").update(`${method} ${path}\n${JSON.stringify(body)}`).digest();

/**
 * Idempotency-Key (ADR-0015, AC-28). The key is claimed in its own committed transaction, so a concurrent retry sees
 * it in flight (409). The handler's change and the stored response commit together; a failed handler frees the key.
 * shortcut: a process crash mid-request leaves the key in_progress until it expires (7 days); the purge job is a
 * worker task (slice 8) and expired keys are replaced on reuse until then.
 */
export async function idempotent<T>(ctx: TenantContext, key: string, hash: Buffer, status: number, run: (tx: Tx) => Promise<T>, db: Db = getAppDb()) {
  const where = sql`user_id = ${ctx.userId} AND key = ${key}`;
  const existing = await withTenant(ctx, async (tx) => {
    await tx.execute(sql`DELETE FROM idempotency_keys WHERE ${where} AND expires_at <= now()`);
    const claimed = await tx.execute(sql`
      INSERT INTO idempotency_keys (org_id, user_id, key, request_hash, status)
      VALUES (app.org_id(), ${ctx.userId}, ${key}, ${hash}, 'in_progress') ON CONFLICT DO NOTHING RETURNING 1`);
    if (claimed.rows.length > 0) return undefined;
    const { rows } = await tx.execute<{ request_hash: Buffer; status: string; response_status: number; response_body: T }>(
      sql`SELECT request_hash, status, response_status, response_body FROM idempotency_keys WHERE ${where}`,
    );
    return rows[0]!;
  }, db);

  if (existing) {
    if (!existing.request_hash.equals(hash)) {
      throw new ApiError(422, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used for a different request.");
    }
    if (existing.status === "in_progress") throw new Conflict("IN_PROGRESS", "A request with this Idempotency-Key is still in progress.");
    return { status: existing.response_status, body: existing.response_body };
  }

  try {
    return await withTenant(ctx, async (tx) => {
      const body = await run(tx);
      await tx.execute(sql`UPDATE idempotency_keys SET status = 'completed', response_status = ${status}, response_body = ${JSON.stringify(body)}::jsonb WHERE ${where}`);
      return { status, body };
    }, db);
  } catch (error) {
    await withTenant(ctx, (tx) => tx.execute(sql`DELETE FROM idempotency_keys WHERE ${where}`), db);
    throw error;
  }
}
