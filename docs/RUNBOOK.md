# Runbook

Hosting is AWS in a GCC region (ADR-0013, pending OQ-03): RDS Postgres 16 Multi-AZ, S3 for files, ElastiCache Redis, the web app and the worker as separate services. Steps below name the repo's own commands; cloud console steps are for whoever holds the account. **Nothing here has been run against a real environment yet**: the first restore drill (below) is how it gets verified.

## Deploy

1. Run the checks: `pnpm check && pnpm test`, and `pnpm e2e` against staging.
2. Take a manual RDS snapshot (a deploy that migrates is the riskiest moment).
3. Migrate as `crm_owner`: `pnpm db:migrate`. Migrations are forward-only and additive (expand, then contract in a later release), so the previous app version keeps working against the new schema.
4. Deploy the web app, then the worker (`apps/worker/Dockerfile`; it needs `DATABASE_URL`, `DATABASE_AUTH_URL`, `REDIS_URL`, the `S3_*` settings, `CHROMIUM_PATH` and, for email, the `SMTP_*` settings). The worker runs the PDF, email and import queues; stop it before a deploy that changes a job payload.
5. Smoke test: sign in, open a record, issue a draft invoice on staging and check its PDF, send an email to the catcher.

## Rollback

- **App or worker:** redeploy the previous image. The schema is additive, so no database step is needed.
- **A bad migration:** do not edit an applied migration. Add a corrective migration; if data is damaged, restore (below) to the snapshot from deploy step 2.
- **Invoice numbers:** a rollback must never reset `document_sequences`: the number is gap-free and a trigger refuses lowering it (ADR-0008).

## Incidents

| Signal | First look | Action |
|---|---|---|
| p95 or 5xx alert | request log lines (`status`, `ms`, `request_id`; `/s/*` paths are redacted) | find the slow route; check RDS CPU and connections; roll back if it began with a deploy |
| DLQ growing (`pdf`, `email`, `import` failed sets) | worker log `job failed` lines (error type and code, never the message) | fix the cause, then re-add the job; emails and imports record their own failed state |
| Emails not arriving | the document's Emails list shows each failure and its error; SMTP settings in organisation settings | check the sender domain's SPF/DKIM (OQ-09), the shared account settings and the provider status |
| A customer reports a leaked share link | document → Shared links → Revoke (effective on the next request) | revoke, then send a new link; the access log shows the link id, never the token |
| Redis lost | jobs are enqueued after commit and the source row is the outbox | restart Redis; the worker's sweeper re-queues stale PDFs, emails and files within minutes |
| Suspected cross-org exposure | `pnpm test` visibility matrix, the request log's `org_id` | treat as a security incident: revoke sessions, preserve logs, then follow SECURITY.md |

## Restore drill (go-live gate, PRD M5; every quarter afterwards)

**Targets (TRD § Recovery): RPO ≤ 1 hour of data lost, RTO ≤ 4 hours to restore.** Run it in staging (same IaC as prod, synthetic data, the 100k-record tenant from `packages/db/src/seed-perf.ts`).

1. **Note the start time** and the wall-clock time of the last write you can see (a timeline event or an `updated_at`). This is the baseline for the data-loss figure.
2. **Create write load** for a few minutes: keep issuing invoices and importing a file, so there is something recent to lose.
3. **Simulate the loss.** Stop the app and worker. Delete or damage the database (restore drills use a *new* instance; never touch the live one).
4. **Restore the database** from the latest hourly snapshot copied to the recovery region, then roll forward with point-in-time recovery to the latest restorable time (RDS PITR, about 5-minute granularity). Record which was used.
5. **Restore the files.** Point the app at the S3 replica bucket (cross-region replication). Sample five issued-invoice PDFs and one import CSV: each `files` row must have an object whose sha256 matches.
6. **Bring the stack up** from infrastructure as code in the recovery region; set `DATABASE_URL` and the other settings; run `pnpm db:migrate` (it must report nothing to apply); start the web app and the worker.
7. **Verify integrity:** sign in; run the visibility matrix against it (`pnpm test` with the restored database as the test database is *not* allowed: it resets the schema; instead run `pnpm reconcile:import` for the latest import jobs and check the invoice sequence: the highest issued invoice number equals the invoice sequence's `next_value` minus one, with no gaps).
8. **Record the result** below: restore duration (start to step 7 finished) must be ≤ 4 h; the difference between the last visible write before the loss and the last one after the restore must be ≤ 1 h.

### Drill log

| Date | Environment | Snapshot / PITR used | Restore time (≤ 4 h) | Data lost (≤ 1 h) | Invoice sequence intact | Run by | Result |
|---|---|---|---|---|---|---|---|
| _not yet run_ | | | | | | | **Blocked on OQ-03 (hosting region) and a staging environment** |
