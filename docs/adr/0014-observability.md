# ADR-0014: Observability with OpenTelemetry and pino, kept in-region

## Status
Accepted

## Date
2026-10-27

## Context
- **Targets.** We must prove p95 < 1 s (M6) and 99.5% uptime in business hours (M5), and diagnose failed sends and imports.
- **Data residency.** Telemetry must not carry customer PII out of the GCC (OQ-03).

## Decision
- **Logs.** We use pino structured JSON to stdout, collected by CloudWatch Logs in the same region.
  - Each log line carries `request_id`, `org_id`, `user_id`, `trace_id`, `route` and `status`.
  - pino `redact` removes `authorization`, `cookie`, `password`, `token`, `email`, `mobile` and `phone`.
  - The path `/s/*` is logged as `/s/[redacted]`.
- **Traces and metrics.** We use the OpenTelemetry Node SDK with HTTP, pg, ioredis and BullMQ instrumentation, exported via the AWS Distro for OpenTelemetry (ADOT) collector sidecar to X-Ray and CloudWatch metrics in the same region.
  - Span attributes never include record field values.
- **SLOs and alerts:**

  | Signal | Alert |
  |---|---|
  | API p95 latency per route (list and detail) | > 1 s for 10 min during business hours (Sun–Thu; hours per OQ-08) |
  | Synthetic check of `/api/health` and the sign-in page every minute | 3 consecutive failures |
  | Error rate | 5xx > 1% for 5 min |
  | BullMQ DLQ size, queue age | DLQ > 0 for `email`; queue age > 5 min |
  | RDS CPU, storage, replication lag; backup or snapshot-copy failure | Any backup failure |

- **Audit vs logs.** Security events live in `timeline_events`, which is durable and queryable per record. Examples: sign-in failures, role changes, transfers, share-link creation and revocation, invoice issue and cancel. Logs are operational only, with 30-day retention.
- **Errors.** No third-party error SaaS (such as Sentry Cloud) in the MVP, because it would ship stack context and PII out of region. A self-hosted or in-region option can be added later through an ADR.

## Consequences
- Dashboards are CloudWatch-native, which is basic but in-region and cheap.
- PII redaction is enforced in one logger config and tested with a unit test that logs a fake request.
