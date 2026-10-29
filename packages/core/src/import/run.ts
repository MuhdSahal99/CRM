import { Readable } from "node:stream";
import type { ReadableStream as WebStream } from "node:stream/web";
import { newId } from "@crm/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { ApiError, Conflict, NotFound } from "../http/errors.ts";
import { enqueueAfterCommit } from "../jobs/enqueue.ts";
import { createFile, putFile, readObject } from "../storage.ts";
import { type TenantContext, type Tx, withTenant } from "../tenant.ts";
import { errorsCsv } from "./errors-csv.ts";
import { validateMapping } from "./mapping.ts";
import { IMPORT_MODULE_NAMES, IMPORT_MODULES, type ImportModuleName } from "./modules.ts";
import { ImportError, LIMITS, readCsv, scanCsv, sniffCsv } from "./parse.ts";
import { applyRow, type Applied, prepareRow, type RowError } from "./row.ts";

// T11.01 to T11.05 (US-17): upload → dry run → confirm → write, with every state in import_jobs and import_rows. The dry run writes nothing to a CRM
// table (AC-53); the write phase is the only one that does, and only after an Admin confirmed. Rows are processed in batches of 200, one
// transaction per batch, one savepoint per row, so a bad row never loses the rest. shortcut: metadata is reloaded per row; cache it per batch if a
// 100k-row import proves slow.

export const ImportModule = z.enum(IMPORT_MODULE_NAMES);
export const MappingInput = z.record(z.string().min(1).max(200), z.string().min(1).max(100)).refine((m) => Object.keys(m).length <= LIMITS.columns, "Too many columns.");
const BATCH = 200;

const JOB = sql`id, module, status, total_rows, valid_rows, error_rows, duplicate_rows, flagged_rows, imported_rows, failure_message, created_at, confirmed_at, finished_at`;
type Job = { id: string; module: string; status: string; total_rows: number; valid_rows: number; error_rows: number; duplicate_rows: number; flagged_rows: number; imported_rows: number; failure_message: string | null; created_at: string; confirmed_at: string | null; finished_at: string | null };
const iso = (t: string | null) => (t ? new Date(t).toISOString() : null);
const shape = (j: Job, row_errors?: { row_no: number; column: string; message: string }[]) => ({
  id: j.id, module: IMPORT_MODULE_NAMES.find((m) => IMPORT_MODULES[m].key === j.module)!, status: j.status, total_rows: j.total_rows, valid_rows: j.valid_rows, error_rows: j.error_rows,
  duplicate_rows: j.duplicate_rows, flagged_rows: j.flagged_rows, imported_rows: j.imported_rows, failure_message: j.failure_message, row_errors,
  created_at: iso(j.created_at), confirmed_at: iso(j.confirmed_at), finished_at: iso(j.finished_at),
});

const requireIdle = async (tx: Tx) => {
  if ((await tx.execute(sql`SELECT 1 FROM import_jobs WHERE status IN ('uploaded', 'validating', 'importing') LIMIT 1`)).rows.length > 0) {
    throw new Conflict("IN_PROGRESS", "Another import is still running. Wait for it to finish.");
  }
};

/** POST /imports: checks the file and the mapping, stores the CSV, creates the job and queues its dry run. Nothing here touches a CRM table. */
export async function createImport(tx: Tx, input: { module: ImportModuleName; bytes: Uint8Array; filename: string; mapping: Record<string, string> }) {
  sniffCsv(input.bytes);
  const { headers } = await scanCsv(input.bytes);
  const def = IMPORT_MODULES[input.module];
  await validateMapping(tx, input.module, input.mapping, headers, def.fill);
  await requireIdle(tx);
  const file = await createFile(tx, { kind: "import_csv", filename: input.filename, contentType: "text/csv" });
  await putFile(tx, file.id, Buffer.from(input.bytes));
  const jobId = newId();
  const job = (await tx.execute<Job>(sql`
    INSERT INTO import_jobs (id, org_id, module, source_file_id, mapping, status, created_by, updated_by)
    VALUES (${jobId}, app.org_id(), ${def.key}, ${file.id}, ${JSON.stringify(input.mapping)}::jsonb, 'uploaded', NULLIF(current_setting('app.user_id', true), '')::uuid, NULLIF(current_setting('app.user_id', true), '')::uuid)
    RETURNING ${JOB}`)).rows[0]!;
  const { o, u } = (await tx.execute<{ o: string; u: string }>(sql`SELECT app.org_id() AS o, current_setting('app.user_id', true) AS u`)).rows[0]!;
  enqueueAfterCommit(tx, "import", { org_id: o, user_id: u, job_id: jobId, phase: "validate" }, `${jobId}-validate`);
  return { data: [shape(job)] };
}

export async function listImports(tx: Tx) {
  return { data: (await tx.execute<Job>(sql`SELECT ${JOB} FROM import_jobs ORDER BY created_at DESC LIMIT 100`)).rows.map((j) => shape(j)) };
}

/** GET /imports/{id}: the job with its first 100 row errors. */
export async function getImport(tx: Tx, id: string) {
  const job = (await tx.execute<Job>(sql`SELECT ${JOB} FROM import_jobs WHERE id = ${id}`)).rows[0];
  if (!job) throw new NotFound();
  const rows = (await tx.execute<{ row_no: number; errors: RowError[] }>(sql`SELECT row_no, errors FROM import_rows WHERE job_id = ${id} AND status = 'error' ORDER BY row_no LIMIT 100`)).rows;
  return { data: [shape(job, rows.flatMap((r) => r.errors.map((e) => ({ row_no: r.row_no, ...e }))).slice(0, 100))] };
}

/** POST /imports/{id}/actions/confirm: only a validated dry run, only one import at a time; queues the write phase. */
export async function confirmImport(tx: Tx, id: string) {
  const job = (await tx.execute<Job>(sql`SELECT ${JOB} FROM import_jobs WHERE id = ${id} FOR UPDATE`)).rows[0];
  if (!job) throw new NotFound();
  if (job.status !== "validated") throw new Conflict("INVALID_STATE", `A ${job.status} import cannot be confirmed: only a validated dry run can.`);
  if ((await tx.execute(sql`SELECT 1 FROM import_jobs WHERE status = 'importing' LIMIT 1`)).rows.length > 0) throw new Conflict("IN_PROGRESS", "Another import is still running. Wait for it to finish.");
  const updated = (await tx.execute<Job>(sql`UPDATE import_jobs SET status = 'importing', confirmed_at = now(), confirmed_by = NULLIF(current_setting('app.user_id', true), '')::uuid, version = version + 1 WHERE id = ${id} RETURNING ${JOB}`)).rows[0]!;
  const { o, u } = (await tx.execute<{ o: string; u: string }>(sql`SELECT app.org_id() AS o, current_setting('app.user_id', true) AS u`)).rows[0]!;
  enqueueAfterCommit(tx, "import", { org_id: o, user_id: u, job_id: id, phase: "write" }, `${id}-write`);
  return { data: [shape(updated)] };
}

/** GET /imports/{id}/errors: the failed rows with their messages, cells escaped against formula injection (AC-55). */
export async function importErrorsCsv(tx: Tx, id: string): Promise<string> {
  const job = (await tx.execute<{ mapping: Record<string, string> }>(sql`SELECT mapping FROM import_jobs WHERE id = ${id}`)).rows[0];
  if (!job) throw new NotFound();
  const rows = (await tx.execute<{ row_no: number; raw: Record<string, string>; errors: RowError[] }>(sql`SELECT row_no, raw, errors FROM import_rows WHERE job_id = ${id} AND status = 'error' ORDER BY row_no`)).rows;
  return errorsCsv(Object.keys(rows[0]?.raw ?? job.mapping), rows);
}

// ---------------------------------------------------------------- the worker's two phases

type Loaded = { module: ImportModuleName; mapping: Record<string, string>; sourceKey: string };
async function load(tx: Tx, id: string): Promise<Loaded & { status: string }> {
  const job = (await tx.execute<{ module: string; mapping: Record<string, string>; status: string; storage_key: string }>(sql`
    SELECT j.module, j.mapping, j.status, f.storage_key FROM import_jobs j JOIN files f ON f.org_id = j.org_id AND f.id = j.source_file_id WHERE j.id = ${id}`)).rows[0];
  if (!job) throw new NotFound();
  return { module: IMPORT_MODULE_NAMES.find((m) => IMPORT_MODULES[m].key === job.module)!, mapping: job.mapping, status: job.status, sourceKey: job.storage_key };
}

/** Recomputes the job's counters from its rows, so they are always exactly what the rows say. */
async function recount(tx: Tx, id: string, extra: ReturnType<typeof sql> = sql``) {
  await tx.execute(sql`
    UPDATE import_jobs j SET total_rows = c.total, valid_rows = c.valid, error_rows = c.err, duplicate_rows = c.dup, flagged_rows = c.flagged,
      imported_rows = c.imported ${extra}
    FROM (SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'valid')::int AS valid, count(*) FILTER (WHERE status = 'error')::int AS err,
        count(*) FILTER (WHERE status = 'duplicate')::int AS dup, count(*) FILTER (WHERE status = 'flagged_owner')::int AS flagged,
        count(*) FILTER (WHERE status = 'imported' OR (status = 'flagged_owner' AND record_id IS NOT NULL))::int AS imported
      FROM import_rows WHERE job_id = ${id}) c WHERE j.id = ${id}`);
}

const fail = async (ctx: TenantContext, id: string, error: unknown) =>
  withTenant(ctx, (tx) => tx.execute(sql`UPDATE import_jobs SET status = 'failed', failure_message = ${error instanceof ApiError ? error.message : "The import stopped because of an unexpected error. Nothing was lost; try again or contact support."}, finished_at = now(), version = version + 1 WHERE id = ${id}`));

/** The dry run: parses the CSV as a stream, runs every row through the real services inside a rolled-back savepoint, and records the verdicts. Writes nothing to CRM tables. */
export async function validateImport(ctx: TenantContext, id: string) {
  try {
    const job = await withTenant(ctx, async (tx) => {
      const j = await load(tx, id);
      if (j.status !== "uploaded") return null; // a redelivered job
      await tx.execute(sql`UPDATE import_jobs SET status = 'validating', version = version + 1 WHERE id = ${id}`);
      return j;
    });
    if (!job) return { skipped: "not uploaded" };
    const def = IMPORT_MODULES[job.module];
    const stream = Readable.fromWeb((await readObject(job.sourceKey)) as unknown as WebStream);
    let headings: string[] | undefined;
    let rowNo = 0;
    const seen = new Set<string>();
    let batch: { row_no: number; raw: Record<string, string> }[] = [];

    const flush = async () => {
      const rows = batch;
      batch = [];
      if (rows.length === 0) return;
      await withTenant(ctx, async (tx) => {
        const mappable = await validateMapping(tx, job.module, job.mapping, headings!, def.fill);
        const headingOf = (api: string) => Object.keys(job.mapping).find((h) => job.mapping[h] === api) ?? api;
        for (const row of rows) {
          let status: "valid" | "error" | "duplicate" | "flagged_owner" = "error";
          let errors: RowError[] = [];
          const prepared = await prepareRow(tx, mappable, job.mapping, def.fill ?? {}, row.raw);
          if (prepared.errors.length === 0) {
            const applied: Applied = await applyRow(tx, ctx, job.module, prepared, "dry", id, headingOf);
            errors = applied.errors ?? [];
            // A row that matches an existing record is a duplicate (an update, no new record) even if its owner is unknown.
            status = applied.status === "error" ? "error" : applied.status === "duplicate" || seen.has(prepared.zohoId!) ? "duplicate" : prepared.flaggedOwner ? "flagged_owner" : "valid";
            if (status !== "error") seen.add(prepared.zohoId!);
          } else errors = prepared.errors;
          await tx.execute(sql`INSERT INTO import_rows (id, org_id, job_id, row_no, raw, zoho_id, status, errors) VALUES (${newId()}, app.org_id(), ${id}, ${row.row_no}, ${JSON.stringify(row.raw)}::jsonb, ${prepared.zohoId}, ${status}, ${errors.length ? JSON.stringify(errors) : null}::jsonb)`);
        }
      });
    };

    for await (const record of readCsv(stream)) {
      if (!headings) { headings = record.map((h) => h.trim()); continue; }
      rowNo++;
      const raw: Record<string, string> = {};
      headings.forEach((h, i) => (raw[h] = record[i] ?? ""));
      if (record.length > headings.length) { // more cells than headings: report it instead of silently dropping data
        await flush();
        await withTenant(ctx, (tx) => tx.execute(sql`INSERT INTO import_rows (id, org_id, job_id, row_no, raw, status, errors) VALUES (${newId()}, app.org_id(), ${id}, ${rowNo}, ${JSON.stringify(raw)}::jsonb, 'error', ${JSON.stringify([{ column: "(row)", message: `The row has ${record.length} cells but the file has ${headings!.length} columns.` }])}::jsonb)`));
        continue;
      }
      batch.push({ row_no: rowNo, raw });
      if (batch.length >= BATCH) await flush();
    }
    await flush();
    await withTenant(ctx, async (tx) => {
      await recount(tx, id, sql`, status = 'validated'`);
      await tx.execute(sql`UPDATE import_jobs SET version = version + 1 WHERE id = ${id}`);
    });
    return { status: "validated" };
  } catch (error) {
    await fail(ctx, id, error);
    return { status: "failed" };
  }
}

/** The write phase: re-reads each stored row, applies it for real (create or update by Zoho id), and records what happened. Resumable: finished rows are skipped. */
export async function writeImport(ctx: TenantContext, id: string) {
  try {
    const job = await withTenant(ctx, async (tx) => {
      const j = await load(tx, id);
      return j.status === "importing" ? j : null;
    });
    if (!job) return { skipped: "not confirmed" };
    const def = IMPORT_MODULES[job.module];
    const headingOf = (api: string) => Object.keys(job.mapping).find((h) => job.mapping[h] === api) ?? api;
    for (;;) {
      const done = await withTenant(ctx, async (tx) => {
        const mappable = await validateMapping(tx, job.module, job.mapping, Object.keys(job.mapping), def.fill);
        const rows = (await tx.execute<{ id: string; raw: Record<string, string>; status: string }>(sql`
          SELECT id, raw, status FROM import_rows WHERE job_id = ${id} AND status IN ('valid', 'duplicate', 'flagged_owner') AND record_id IS NULL ORDER BY row_no LIMIT ${BATCH}`)).rows;
        for (const row of rows) {
          const prepared = await prepareRow(tx, mappable, job.mapping, def.fill ?? {}, row.raw);
          const applied: Applied = prepared.errors.length ? { status: "error", errors: prepared.errors } : await applyRow(tx, ctx, job.module, prepared, "write", id, headingOf);
          if (applied.status === "error") await tx.execute(sql`UPDATE import_rows SET status = 'error', errors = ${JSON.stringify(applied.errors)}::jsonb WHERE id = ${row.id}`);
          else await tx.execute(sql`UPDATE import_rows SET record_id = ${applied.recordId}, status = ${row.status === "valid" ? "imported" : row.status} WHERE id = ${row.id}`);
        }
        return rows.length < BATCH;
      });
      if (done) break;
    }
    await withTenant(ctx, async (tx) => {
      await recount(tx, id, sql`, status = 'done', finished_at = now()`);
      await tx.execute(sql`UPDATE import_jobs SET version = version + 1 WHERE id = ${id}`);
    });
    return { status: "done" };
  } catch (error) {
    await fail(ctx, id, error);
    return { status: "failed" };
  }
}

export { ImportError };

/**
 * Deletes the stored CSV rows (PII) of jobs finished more than 90 days ago; the table's guard trigger allows nothing sooner. Returns how many.
 * shortcut: the source CSV object stays in the bucket, since files rows are immutable and cannot be deleted; expire the import_csv objects with a bucket lifecycle rule (ADR-0012).
 */
export async function purgeFinishedImports(tx: Tx): Promise<number> {
  const { rows } = await tx.execute<{ id: string }>(sql`
    DELETE FROM import_rows WHERE job_id IN (SELECT id FROM import_jobs WHERE finished_at < now() - interval '90 days') RETURNING id`);
  return rows.length;
}
