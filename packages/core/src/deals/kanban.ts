import { sql } from "drizzle-orm";
import { z } from "zod";
import { NotFound } from "../http/errors.ts";
import { loadFields, toApi } from "../modules/registry.ts";
import type { Tx } from "../tenant.ts";

export const KanbanInput = z.object({
  pipeline_id: z.uuid(),
  per_column: z.coerce.number().int().min(1).max(100).default(25),
});

type Stage = { id: string; api_value: string; name_key: string; sort_order: number; probability: number; record_category: string; forecast_category: string };

/**
 * GET /Deals/kanban (US-07): per active stage of the pipeline, the deal count, Σ amount_omr and the newest `per_column`
 * deals. Counts and sums are computed here under the caller's RLS (a rep sees their own deals, a manager the team), never
 * by the client (DESIGN_SYSTEM principle 2).
 */
export async function getKanban(tx: Tx, input: z.infer<typeof KanbanInput>) {
  const stages = (await tx.execute<Stage>(sql`
    SELECT id, api_value, name_key, sort_order, probability, record_category, forecast_category FROM stages
    WHERE pipeline_id = ${input.pipeline_id} AND is_active ORDER BY sort_order`)).rows;
  if (stages.length === 0) throw new NotFound();
  const totals = new Map((await tx.execute<{ stage_id: string; n: number; total: string }>(sql`
    SELECT stage_id, count(*)::int AS n, COALESCE(sum(amount_omr), 0)::numeric(18,3)::text AS total FROM deals
    WHERE pipeline_id = ${input.pipeline_id} AND deleted_at IS NULL GROUP BY stage_id`)).rows.map((r) => [r.stage_id, r]));
  const fields = await loadFields(tx, "Deals");
  // A sum of Amount would leak the hidden field, so a role without access gets null.
  const seesAmount = fields.some((f) => f.apiName === "Amount");
  const columns = [];
  for (const stage of stages) {
    const { rows } = await tx.execute(sql`
      SELECT * FROM deals WHERE stage_id = ${stage.id} AND deleted_at IS NULL ORDER BY updated_at DESC, id LIMIT ${input.per_column}`);
    const t = totals.get(stage.id);
    columns.push({ stage, count: t?.n ?? 0, sum_amount_omr: seesAmount ? (t?.total ?? "0.000") : null, deals: await toApi(tx, fields, rows as Parameters<typeof toApi>[2]) });
  }
  return columns;
}
