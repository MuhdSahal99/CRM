# ADR-0003: Multi-tenancy with org_id on every table plus Postgres RLS

## Status
Accepted

## Date
2026-10-27

## Context
PRD G4 says a second tenant must need no schema rewrite. US-01 requires that a Saqient user requesting a Demo record gets a 404 that reveals nothing. A single missed `WHERE org_id = ?` in application code would expose another tenant, so we want the database itself to refuse.

## Decision
- **Shared schema, shared tables.** Every tenant-owned table has `org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT`, and every index on it leads with `org_id`.
- **RLS on every tenant table**, with both `ENABLE` and `FORCE ROW LEVEL SECURITY`. Each table gets the policy:
  ```sql
  CREATE POLICY tenant_isolation ON <table>
    USING (org_id = current_setting('app.org_id', true)::uuid)
    WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);
  ```
  When `app.org_id` is not set, `current_setting(..., true)` returns NULL, the comparison is NULL, and **zero rows** come back. The policy fails closed.

  > **Amended 2026-10-27 (T1.05).** That holds only on a connection that has never set the value. After a transaction that used `set_config('app.org_id', …, true)` ends, the same connection reads it back as `''`, and `''::uuid` raises an error instead of matching nothing. Every pooled connection is in that state after its first request. Policies therefore use `app.org_id()`, which is `NULLIF(current_setting('app.org_id', true), '')::uuid`:
  > ```sql
  > CREATE POLICY tenant_isolation ON <table> TO crm_app
  >   USING (org_id = app.org_id()) WITH CHECK (org_id = app.org_id());
  > ```
  > Covered by the test "a finished request leaves no usable context on the connection" (`packages/db/test/rls.test.ts`).
- **DB roles:**
  - `crm_owner` owns the schema and runs migrations. The app never connects as it.
  - `crm_app` is used by web and worker. It has no `BYPASSRLS` and no DDL rights.
  - `crm_auth` is used only by Better Auth, for its global auth tables (ADR-0004).
- **Per-request context.** Every request or job runs inside one transaction that starts with:
  ```sql
  SELECT set_config('app.org_id', $1, true),
         set_config('app.user_id', $2, true),
         set_config('app.visible_owner_ids', $3, true),   -- ADR-0005
         set_config('app.see_all', $4, true),
         set_config('app.role', $5, true);                -- admin | manager | rep
  ```
  Because `is_local = true`, the settings die with the transaction, so a pooled connection cannot carry one tenant's context into the next request. The only DB handle that `packages/core` exposes is `withTenant(ctx, fn)`, and no other path to a connection exists.
- Paths that legitimately have no org (the public share link and the auth tables) go through narrow `SECURITY DEFINER` functions owned by `crm_owner`, with `search_path` pinned (ADR-0009).
- A **CI test** queries `pg_class`/`pg_policies`. It fails if any table with an `org_id` column lacks RLS + FORCE + the `tenant_isolation` policy.

## Alternatives considered
- **Schema per tenant.** Migrations multiply by tenant count (target: 50), and cross-tenant ops tooling gets harder. Rejected.
- **Database per tenant.** Too much operational cost for 50 small SMB tenants. Rejected.
- **App-level filtering only.** One missed filter leaks data. Rejected as the *only* control. It still runs as the first layer (ADR-0005).

## Consequences
- Every query pays for the policy predicate. That is cheap with `org_id`-leading indexes.
- Tests must run as `crm_app`, not as a superuser, or the RLS tests prove nothing.
- Background jobs carry `org_id` and `user_id` in their payload and open a `withTenant` transaction. The worker validates the payload with Zod before use.
