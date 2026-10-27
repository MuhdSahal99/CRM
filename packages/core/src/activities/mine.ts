import { sql } from "drizzle-orm";
import { limitOffset, pageOf } from "../modules/list.ts";
import { loadFields, toApi } from "../modules/registry.ts";
import type { TenantContext, Tx } from "../tenant.ts";

type Page = Parameters<typeof limitOffset>[0];

/**
 * US-15, GET /Tasks?cvid=my_open|overdue: my open tasks, oldest due date first (undated last), each with `Is_Overdue`.
 * Open is `completed_at IS NULL`, which also leaves out system tasks (completed on creation). A due date is a business
 * date, so overdue means before today in Asia/Muscat. Matches the partial index (org_id, owner_id, due_date).
 */
export async function listMyTasks(tx: Tx, ctx: TenantContext, view: "my_open" | "overdue", page: Page) {
  const today = sql`(now() AT TIME ZONE 'Asia/Muscat')::date`;
  const { rows } = await tx.execute(sql`
    SELECT *, (due_date < ${today}) AS is_overdue FROM activities
    WHERE org_id = app.org_id() AND owner_id = ${ctx.userId} AND type = 'task' AND completed_at IS NULL AND deleted_at IS NULL
      ${view === "overdue" ? sql`AND due_date < ${today}` : sql``}
    ORDER BY due_date NULLS LAST, id ${limitOffset(page)}`);
  const { data, info } = pageOf(rows as Record<string, unknown>[], page);
  const records = await toApi(tx, await loadFields(tx, "Tasks"), data as Parameters<typeof toApi>[2]);
  return { data: records.map((r, i) => ({ ...r, Is_Overdue: data[i]!.is_overdue === true })), info };
}

