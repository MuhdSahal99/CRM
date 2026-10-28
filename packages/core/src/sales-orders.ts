import { sql } from "drizzle-orm";
import { z } from "zod";
import { Conflict, Forbidden, NotFound } from "./http/errors.ts";
import type { Tx } from "./tenant.ts";
import { recordEvent } from "./timeline.ts";

// The sales order lifecycle (SCHEMA § sales_orders): created -> approved -> delivered, and cancelled from created or approved.
// Moves are forward only and only through this action; PUT cannot touch Status, nor edit an order that left `created`.
const NEXT: Record<string, string[]> = { created: ["approved", "cancelled"], approved: ["delivered", "cancelled"], delivered: [], cancelled: [] };

export const TransitionSalesOrderInput = z.object({ to: z.enum(["approved", "delivered", "cancelled"]) });

/** POST /Sales_Orders/{id}/actions/transition. 404 for an order the caller cannot see; 409 INVALID_STATE for a move the lifecycle does not allow. */
export async function transitionSalesOrder(tx: Tx, id: string, input: z.infer<typeof TransitionSalesOrderInput>) {
  // Status is read-only for PUT (system flag), so the role's own grant is checked directly: only read_write may move it.
  const access = (await tx.execute<{ access: string }>(sql`
    SELECT COALESCE(fp.access, 'read_write') AS access FROM fields f JOIN modules m ON m.id = f.module_id
    LEFT JOIN field_permissions fp ON fp.field_id = f.id AND fp.role = current_setting('app.role', true)
    WHERE m.api_name = 'Sales_Orders' AND f.api_name = 'Status'`)).rows[0]?.access;
  if (access !== "read_write") throw new Forbidden();
  const row = (await tx.execute<{ status: string }>(sql`SELECT status FROM sales_orders WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`)).rows[0];
  if (!row) throw new NotFound();
  if (!NEXT[row.status]?.includes(input.to)) throw new Conflict("INVALID_STATE", `A ${row.status} sales order cannot become ${input.to}.`);
  const { rows } = await tx.execute<{ version: number }>(sql`UPDATE sales_orders SET status = ${input.to}, version = version + 1 WHERE id = ${id} RETURNING version`);
  await recordEvent(tx, { recordType: "sales_order", recordId: id, eventType: "updated", changes: { Status: [row.status, input.to] } });
  return { data: [{ code: "SUCCESS", status: "success", details: { id, version: rows[0]!.version } }] };
}
