# Production Readiness

## Seeded test users

Created by `pnpm db:seed` (`packages/core/src/seed.ts`) in **dev and test only**: the seed refuses to run when `NODE_ENV=production`, and prod never runs it. It writes users and orgs as `crm_auth` (`DATABASE_AUTH_URL`), then provisions each org's metadata with `provisionOrg()` as `crm_app` (`DATABASE_URL`) under the org's admin. It is idempotent: it only inserts what is missing.

All users share one password, read from `SEED_PASSWORD` (never in the code or the repo). The `.test` domain is reserved and cannot receive mail.

| Email | Org | Role | Reports to | State |
|---|---|---|---|---|
| admin@saqient.test | Saqient | admin | — | active |
| manager@saqient.test | Saqient | manager | — | active |
| rep.a@saqient.test | Saqient | rep | manager@saqient.test | active |
| rep.b@saqient.test | Saqient | rep | manager@saqient.test | active |
| deactivated@saqient.test | Saqient | rep | manager@saqient.test | **deactivated** (banned; US-01 sign-in refusal) |
| admin@demo.test | Demo | admin | — | active |
| rep@demo.test | Demo | rep | — | active |

Use these for manual testing, E2E and the visibility matrix: rep A vs rep B (private records), the manager over both, and Demo vs Saqient (cross-org).

## TEMP-DEV flags

| ID | Flag | Why | Remove by |
|----|------|-----|-----------|

## Launch checklist

- [ ] **Client IP for the sign-in rate limit (AC-31) is trustworthy.** Better Auth 1.7.7 reads `X-Forwarded-For` and, unless `trustedProxies` is set, trusts it only when it holds exactly one address. So:
  - The app port is reachable **only through the reverse proxy** (firewall / bind to localhost). Otherwise a client sends its own single fake IP per request and the per-IP limit never triggers (the per-account limit still holds).
  - Set `advanced.ipAddress.trustedProxies` in `packages/core/src/auth.ts` to the proxy's address once hosting is decided. Better Auth then takes the right-most address that is not the proxy, which is correct whether the proxy overwrites or appends the header.
  - Without `trustedProxies`, the proxy must **overwrite** the header (nginx: `proxy_set_header X-Forwarded-For $remote_addr;`). If it appends (`$proxy_add_x_forwarded_for`), every request lands in one shared bucket and the whole org is locked out after 10 attempts in 15 minutes.
- [ ] `BETTER_AUTH_URL` is the public `https://` origin (Better Auth trusts only this origin for cookie-bearing requests).
- [ ] No seed has run against the prod database (`member` has no `*.test` emails).
- [ ] **Object storage is a real, private, encrypted bucket (ADR-0012).** Set S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (and S3_REGION, no S3_ENDPOINT) in the prod environment. Dev uses an archived Bitnami MinIO image (the upstream `minio/minio` image is no longer published); do not ship it. Block Public Access, SSE-KMS and versioning on.
