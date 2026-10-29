// T11.10 (PRD M2): evidence that a Zoho import lost nothing. Prints, for each finished import job of an org, whether its counts add up
// (imported + duplicate + error = CSV rows) and whether 20 sampled records match the CSV field by field. Exits 1 on any difference.
//
//   ORG_ID=<uuid> USER_ID=<an active admin's user id> pnpm reconcile:import [job-id ...]
//
// With no job ids it takes the org's latest finished job per module. Reads only; it needs the same DATABASE_* settings as the app.
import { contextForMember, getAuthDb, withTenant } from "../packages/core/src/index.ts";
import { reconcileJob } from "../packages/core/src/import/reconcile.ts";

const { ORG_ID, USER_ID } = process.env;
if (!ORG_ID || !USER_ID) {
  console.error("Set ORG_ID and USER_ID (an active admin of that org).");
  process.exit(2);
}
const ctx = await contextForMember(getAuthDb(), USER_ID, ORG_ID);
if (!ctx || ctx.role !== "admin") {
  console.error("USER_ID is not an active admin of ORG_ID.");
  process.exit(2);
}

const given = process.argv.slice(2);
const ids = given.length
  ? given
  : await withTenant(ctx, async (tx) =>
      (await tx.execute<{ id: string }>(`SELECT DISTINCT ON (module) id FROM import_jobs WHERE status = 'done' ORDER BY module, finished_at DESC` as never)).rows.map((r) => r.id),
    );

let failed = false;
for (const id of ids) {
  const result = await withTenant(ctx, (tx) => reconcileJob(tx, id, 20));
  failed ||= !result.ok;
  console.log(`${result.ok ? "OK  " : "FAIL"} ${result.module} job ${id}: ${result.counts.accounted}/${result.counts.total} rows accounted for, ${result.sampled} sampled, ${result.mismatches.length} mismatches`);
  for (const m of result.mismatches) console.log(`       row ${m.row_no} (${m.zoho_id}) ${m.field}: CSV ${JSON.stringify(m.csv)} but stored ${JSON.stringify(m.stored)}`);
}
if (ids.length === 0) console.log("No finished imports.");
process.exit(failed ? 1 : 0);
