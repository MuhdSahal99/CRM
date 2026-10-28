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
| smtp-private-hosts | `ALLOW_PRIVATE_SMTP=true` (packages/core/src/config.ts, mail.ts) | Dev and tests send to Mailpit on 127.0.0.1:1025, which the production guard (public addresses only, ports 25/465/587) refuses | Never set in production: `parseConfig` rejects it when `NODE_ENV=production`. Remove when Mailpit is reached some other way |

## Launch checklist

- [ ] **Client IP for the sign-in rate limit (AC-31) is trustworthy.** Better Auth 1.7.7 reads `X-Forwarded-For` and, unless `trustedProxies` is set, trusts it only when it holds exactly one address. So:
  - The app port is reachable **only through the reverse proxy** (firewall / bind to localhost). Otherwise a client sends its own single fake IP per request and the per-IP limit never triggers (the per-account limit still holds).
  - Set `advanced.ipAddress.trustedProxies` in `packages/core/src/auth.ts` to the proxy's address once hosting is decided. Better Auth then takes the right-most address that is not the proxy, which is correct whether the proxy overwrites or appends the header.
  - Without `trustedProxies`, the proxy must **overwrite** the header (nginx: `proxy_set_header X-Forwarded-For $remote_addr;`). If it appends (`$proxy_add_x_forwarded_for`), every request lands in one shared bucket and the whole org is locked out after 10 attempts in 15 minutes.
- [ ] `BETTER_AUTH_URL` is the public `https://` origin (Better Auth trusts only this origin for cookie-bearing requests).
- [ ] No seed has run against the prod database (`member` has no `*.test` emails).
- [ ] **Object storage is a real, private, encrypted bucket (ADR-0012).** Set S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (and S3_REGION, no S3_ENDPOINT) in the prod environment. Dev uses an archived Bitnami MinIO image (the upstream `minio/minio` image is no longer published); do not ship it. Block Public Access, SSE-KMS and versioning on.
- [ ] **The worker image is built and its Chromium is pinned and patched (ADR-0010).** `apps/worker/Dockerfile` has not been built or run yet (written in T8.11 without a Docker build); build it, check a PDF renders in the container, and set a patch schedule for `CHROME_VERSION`. Set `CHROMIUM_PATH` and the S3_* variables for the worker.
- [ ] **Redis is private, authenticated and TLS-protected (ADR-0011).** Job payloads carry `{org_id, user_id}` and the worker acts as that member, so anyone who can write to the queue can run jobs as any user. Keep Redis off every public network, require a password (and TLS on ElastiCache), and give the web app and worker the only credentials.
- [ ] **Each org's SMTP credentials come from its own secret (`smtp_secret_ref`), not from `SMTP_PASSWORD`.** The shared account (`SMTP_USERNAME`, `SMTP_PASSWORD`) is used only for `SMTP_PASSWORD_HOST` and only for senders in `SMTP_FROM_DOMAINS` (an org's own `smtp_username` is just the request to authenticate); until per-org secrets exist, an org must use that host or an unauthenticated relay. Set all four, with the sender domains' SPF/DKIM (OQ-09).
- [ ] **The `/s/*` and accept-invite rate limits see the real client address (T9.07).** `apps/web/lib/rate-limit.ts` keys on the right-most `X-Forwarded-For` entry, so the reverse proxy must append the real client address (same requirement as the sign-in limit above); behind an untrusted hop every client shares one bucket. When tracing is added, redact `/s/{token}` in span attributes as the logger does (ADR-0014): no tracing exists yet, so nothing leaks today.
