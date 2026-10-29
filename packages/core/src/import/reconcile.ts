import { sql } from "drizzle-orm";
import { NotFound } from "../http/errors.ts";
import { loadFields, moduleDef } from "../modules/registry.ts";
import type { Tx } from "../tenant.ts";
import { IMPORT_MODULE_NAMES, IMPORT_MODULES } from "./modules.ts";
import { ZOHO_ID } from "./mapping.ts";
import { coerce } from "./row.ts";

// T11.10 (PRD M2, US-17): the evidence that an import lost nothing. For one finished job: every CSV row is accounted for exactly once
// (imported + duplicate + error), and a sample of imported records is compared field by field with the CSV row it came from.

export type JobCounts = { total_rows: number; imported_rows: number; duplicate_rows: number; error_rows: number; valid_rows: number; flagged_rows: number };

/** Every row is imported, already there (updated), or an error: none is left over and none is counted twice. */
export function countsAdd(job: JobCounts): { ok: boolean; accounted: number; total: number } {
  const accounted = job.imported_rows + job.duplicate_rows + job.error_rows;
  return { ok: accounted === job.total_rows && job.valid_rows === 0, accounted, total: job.total_rows };
}

/** Two stored values count as the same when they print the same, or are the same number (`1000.500` vs `1000.5`), or the same phone digits. */
export function sameValue(expected: unknown, stored: unknown): boolean {
  if (expected === null || expected === undefined || expected === "") return stored === null || stored === undefined || stored === "";
  if (typeof expected === "boolean" || typeof stored === "boolean") return expected === stored;
  const [a, b] = [String(expected), String(stored ?? "")];
  if (a === b) return true;
  if (/^-?\d+(\.\d+)?$/.test(a) && /^-?\d+(\.\d+)?$/.test(b)) return Number(a) === Number(b);
  const digits = (v: string) => v.replace(/\D/g, "");
  return /^[+\d][\d\s().+-]{5,}$/.test(a) && digits(a).length > 5 && digits(a) === digits(b);
}

export type Mismatch = { row_no: number; zoho_id: string | null; field: string; csv: unknown; stored: unknown };

/** Reconciles one finished job. `sample` imported rows are chosen evenly across the file, not just the first ones. */
export async function reconcileJob(tx: Tx, jobId: string, sample = 20) {
  const job = (await tx.execute<JobCounts & { module: string; mapping: Record<string, string>; status: string }>(sql`
    SELECT module, mapping, status, total_rows, imported_rows, duplicate_rows, error_rows, valid_rows, flagged_rows FROM import_jobs WHERE id = ${jobId}`)).rows[0];
  if (!job) throw new NotFound();
  const name = IMPORT_MODULE_NAMES.find((m) => IMPORT_MODULES[m].key === job.module)!;
  const def = moduleDef(name);
  const fields = new Map((await loadFields(tx, name)).map((f) => [f.apiName, f]));
  const rows = (await tx.execute<{ row_no: number; raw: Record<string, string>; zoho_id: string | null; record_id: string }>(sql`
    SELECT row_no, raw, zoho_id, record_id FROM (
      SELECT *, row_number() OVER (ORDER BY row_no) AS n, count(*) OVER () AS c FROM import_rows WHERE job_id = ${jobId} AND record_id IS NOT NULL
    ) r WHERE (r.n - 1) % GREATEST(1, ceil(r.c::numeric / ${sample})::int) = 0 ORDER BY row_no LIMIT ${sample}`)).rows;

  const mismatches: Mismatch[] = [];
  for (const r of rows) {
    const stored = (await tx.execute<Record<string, unknown>>(sql`SELECT to_jsonb(t) AS j FROM ${def.table} t WHERE t.id = ${r.record_id}`)).rows[0] as { j: Record<string, unknown> } | undefined;
    if (!stored) { mismatches.push({ row_no: r.row_no, zoho_id: r.zoho_id, field: "(record)", csv: r.zoho_id, stored: null }); continue; }
    if (stored.j.zoho_id !== r.zoho_id) mismatches.push({ row_no: r.row_no, zoho_id: r.zoho_id, field: ZOHO_ID, csv: r.zoho_id, stored: stored.j.zoho_id });
    for (const [heading, target] of Object.entries(job.mapping)) {
      const f = fields.get(target);
      const cell = (r.raw[heading] ?? "").trim();
      if (!f || !cell || !f.columnName || ["lookup", "user_lookup", "polymorphic"].includes(f.dataType)) continue; // links and owners are checked by their own tests
      const c = coerce(f, cell);
      if ("error" in c) continue;
      if (!sameValue(c.value, stored.j[f.columnName])) mismatches.push({ row_no: r.row_no, zoho_id: r.zoho_id, field: target, csv: c.value, stored: stored.j[f.columnName] });
    }
  }
  const counts = countsAdd(job);
  return { module: name, status: job.status, counts, sampled: rows.length, mismatches, ok: job.status === "done" && counts.ok && mismatches.length === 0 };
}
