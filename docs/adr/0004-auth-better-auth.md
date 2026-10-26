# ADR-0004: Authentication with Better Auth

## Status
Accepted

## Date
2026-10-27

## Context
The MVP needs:
- Email and password sign-in (US-01).
- Invitations, and roles inside an org (US-03).
- Deactivation that blocks sign-in without touching the user's records (US-01).
- Sessions held in httpOnly cookies.

Multi-org membership is needed later (Phase 2 tenants). We don't want to hand-roll password hashing or session handling.

## Decision
- **Better Auth 1.7.x.** Its APIs were checked in Context7 against the 1.6.23 docs, so re-check them at implementation time.
- Configuration:
  - **Email and password.** Better Auth's default password hashing.
  - **`organization` plugin.** Covers orgs, members and invitations. A member has `role ∈ {admin, manager, rep}`, defined with `createAccessControl` (ADR-0005). We extend the member row with `manager_id` and `status`.
  - **`admin` plugin.** Deactivation uses `banUser`, which refuses sign-in and revokes every session.
  - **Drizzle adapter.** The auth tables (`user`, `session`, `account`, `verification`) hold global identity and are accessed through the DB role `crm_auth`. `crm_auth` has no grant on any CRM table. `member` and `invitation` carry `org_id`. For `crm_app` they fall under `tenant_isolation` (ADR-0003). `crm_auth` reaches them, and `orgs`, through an explicit `TO crm_auth USING (true)` policy, because Better Auth resolves memberships before any org context exists.
- Session cookies are `httpOnly`, `Secure`, `SameSite=Lax`, with a bounded lifetime. CSRF is handled by Better Auth's origin check plus SameSite.
- Sign-in is rate-limited through Better Auth's limiter, backed by Redis (shared across instances).
- **No auth bypass, magic header, or dev skip** (CLAUDE.md). Dev and test use seeded users from `pnpm db:seed`, listed in `docs/PRODUCTION_READINESS.md`.

## Alternatives considered
- **Auth.js.** Weaker support for email/password and orgs. Rejected.
- **Hosted IdP (Cognito, Auth0).** Adds a vendor and possibly moves PII out of region (OQ-03). It can be added later through Better Auth's SSO plugins. Rejected for the MVP.

## Consequences
- The auth tables live in our DB and are backed up with everything else.
- Plugin schema changes arrive through Better Auth's CLI as migrations, which are reviewed like any other.
