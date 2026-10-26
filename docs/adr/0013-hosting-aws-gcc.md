# ADR-0013: Hosting on AWS in a GCC region

## Status
Proposed. Becomes Accepted once OQ-03 (Oman PDPL residency) confirms that a GCC region outside Oman is acceptable.

## Date
2026-10-27

## Context
PRD G5 targets:
- **Availability:** 99.5% uptime in business hours (Sun–Thu).
- **Recovery:** RPO 1 h and RTO 4 h.
- **Speed:** p95 < 1 s.
- **Region:** hosting in the GCC (AWS Bahrain or UAE, or an Oman provider).

The team is small, so managed services beat self-run ones.

## Decision
- **Primary region:** `me-central-1` (UAE). **DR region:** `me-south-1` (Bahrain).
- Services:

  | Component | Service |
  |---|---|
  | web, worker | ECS Fargate. web runs ≥ 2 tasks across 2 AZs behind an ALB. worker runs ≥ 1 task. |
  | Postgres 16 | RDS Multi-AZ with automated backups and PITR (5-minute granularity) |
  | Redis | ElastiCache, single-shard with a replica |
  | Files | S3 (SSE-KMS) with cross-region replication to `me-south-1` |
  | Secrets | AWS Secrets Manager. Tasks read secrets at start; none are baked into images. |
  | Edge | ALB with TLS 1.2+ (ACM certificate). WAF managed rules plus a rate rule on `/s/*` and the auth routes. |
  | Email | SMTP provider per OQ-09 |

- **Backups.**
  - PITR gives an RPO well under 1 h.
  - **Hourly** RDS snapshots are also copied to `me-south-1`. This covers losing the whole region and meets the PRD's "hourly backups" wording literally.
  - Snapshots are encrypted with a KMS key that is replicated to the DR region.
- **Restore drill.** A runbook in `docs/RUNBOOK.md` restores from the DR snapshot plus the S3 replica into `me-south-1` within 4 h. It is run before go-live and then quarterly (PRD M5).
- **Infrastructure as code.** Terraform or CDK, with the choice made in slice 1. Each environment is a separate AWS account.
- **If OQ-03 requires data to stay in Oman,** this ADR is superseded. The containers, Postgres, Redis and S3-compatible storage all move as-is to an Oman provider. Nothing in the application depends on AWS-only services (ADR-0011, ADR-0012).

## Alternatives considered
- **`me-south-1` as primary.** Equally valid; the choice can be swapped by changing config.
- **An Oman cloud provider.** Kept as the fallback if OQ-03 requires Oman residency.
- **Vercel.** Its compute and logs are not guaranteed to stay in the GCC. Rejected.

## Consequences
- RPO and RTO are covered with margin. The restore drill is the go-live gate.
- AWS service availability in `me-central-1` must be checked when the infrastructure is written. This applies especially to SES (if used) and to replicating the KMS key.
