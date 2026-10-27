# Production Readiness

## Seeded test users

Created by `pnpm db:seed` (`packages/db/src/seed.ts`) in **dev and test only**: the seed refuses to run when `NODE_ENV=production`, and prod never runs it. It connects as `crm_auth` (`DATABASE_AUTH_URL`) and is idempotent: it only inserts what is missing.

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

- [ ] **Reverse proxy overwrites `X-Forwarded-For`** with the real client address (nginx: `proxy_set_header X-Forwarded-For $remote_addr;`, not `$proxy_add_x_forwarded_for`). The sign-in rate limit (AC-31) keys on that header; if the proxy appends, a client can fake a new IP per request and the limit never triggers. The app must not be reachable except through the proxy.
- [ ] `BETTER_AUTH_URL` is the public `https://` origin (Better Auth trusts only this origin for cookie-bearing requests).
- [ ] No seed has run against the prod database (`member` has no `*.test` emails).
