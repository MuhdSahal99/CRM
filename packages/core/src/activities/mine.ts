import { sql } from "drizzle-orm";
import { ApiError } from "../http/errors.ts";
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
  const fields = await loadFields(tx, "Tasks");
  // Due_Date may be hidden for the caller's role: then nothing may be derived from it (no flag, filter or ordering).
  const dated = fields.some((f) => f.apiName === "Due_Date");
  if (!dated && view === "overdue") throw new ApiError(422, "INVALID_DATA", "This view is not available for your role.", { api_name: "cvid" });
  const today = sql`(now() AT TIME ZONE 'Asia/Muscat')::date`;
  const { rows } = await tx.execute(sql`
    SELECT *, ${dated ? sql`(due_date < ${today})` : sql`NULL::boolean`} AS is_overdue FROM activities
    WHERE org_id = app.org_id() AND owner_id = ${ctx.userId} AND type = 'task' AND completed_at IS NULL AND deleted_at IS NULL
      ${view === "overdue" ? sql`AND due_date < ${today}` : sql``}
    ORDER BY ${dated ? sql`due_date NULLS LAST` : sql`created_at`}, id ${limitOffset(page)}`);
  const { data, info } = pageOf(rows as Record<string, unknown>[], page);
  const records = await toApi(tx, fields, data as Parameters<typeof toApi>[2]);
  return { data: records.map((r, i): typeof r => ({ ...r, Is_Overdue: dated ? data[i]!.is_overdue === true : null })), info };
}

