# ADR-0011: Background jobs with Redis and BullMQ

## Status
Accepted

## Date
2026-10-27

## Context
PDF rendering (ADR-0010), SMTP sends (US-13) and Zoho CSV imports (US-17) are slow or call external systems, so they must run outside the request. US-13 says no "sent" activity is logged when SMTP fails.

## Decision
- We run **BullMQ 6.4.x on Redis**, using ElastiCache in prod and `redis:7` in dev.
- Queues and their retry settings:

  | Queue | Attempts | Backoff | Concurrency |
  |---|---|---|---|
  | `pdf` | 3 | exponential | 2 per worker |
  | `email` | 5 | exponential | 5 |
  | `import` | 1 | — | 1 per org |

  A job is moved to a failed set (the dead-letter queue) once its attempts run out. An alert fires on DLQ growth (ADR-0014).
- Each job payload is `{org_id, user_id, …ids}`, validated with Zod in the worker. The worker opens `withTenant` (ADR-0003). Payloads never carry record data or secrets, only ids.
- **Enqueue after commit.**
  - Jobs are enqueued only after the DB transaction commits, so a job never points at a rolled-back row.
  - If enqueueing fails after commit, the row stays `pending`.
  - A periodic sweeper re-enqueues rows that have been `pending` for more than 5 min. This is a transactional outbox, kept light: the source row is the outbox.
- **Idempotency.**
  - The BullMQ `jobId` is derived from the intent, e.g. `email-<email_sends.id>` and `pdf-<file_id>` (BullMQ rejects a colon in a custom job id).
  - The worker updates `email_sends.status` with a compare-and-set from `queued` to `sending`. A redelivered job finds the row in `sending` or `sent` and exits.
  - The "Email sent to X" activity is written in the same transaction that marks the send as `sent`.
- Redis holds **no durable business data**. Losing it delays work, and the sweeper recovers it from Postgres.
- Redis also backs the rate limiters (ADR-0004, ADR-0009).

## Alternatives considered
- **pg-boss** (a Postgres-backed queue). It is simpler (no Redis), but the stack already needs Redis for shared rate limiting. Either would work. We chose BullMQ because it is in the agreed stack.
- **SQS.** Ties the dev environment to AWS. Rejected.

## Consequences
- One more stateful service to run. It is managed (ElastiCache), and nothing durable lives in it.
- An SMTP send can still be duplicated: if the SMTP server accepts the mail but the ack is lost, the retry sends it again. The window is small, and the Message-ID header is derived from `email_sends.id` so receiving servers can dedupe.
