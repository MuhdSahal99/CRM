# ADR-0017: User administration in CRM services, not Better Auth's plugin endpoints

## Status
Accepted. Amends ADR-0004 (which said deactivation uses `banUser` and invitations use the `organization` plugin).

## Date
2026-10-27

## Context
ADR-0004 planned to run invitations through Better Auth's `organization` plugin and deactivation through the `admin` plugin's `banUser`. Building T1.09, T1.20 and T1.21 showed three problems:

- **`banUser` needs a global admin.** The `admin` plugin authorizes on `user.role`. CRM roles live on `member.role` (ADR-0005), and nobody holds a global role, so that endpoint must stay closed to everyone. Giving Admins a global role would let one tenant's Admin ban users in another tenant.
- **Plugin endpoints skip our pipeline.** They don't go through `apiRoute`: no shared Zod schema, no `withTenant`, no `timeline_events` row, and no `manager_id` on the invitation. US-03 needs the timeline, and the invite carries the reporting manager.
- **Public sign-up must not exist.** Users join by Admin invitation only (US-03). Tenants are provisioned, not self-served (PRD non-goals).

## Decision
- **Invite-only sign-in.** `emailAndPassword.disableSignUp: true` and `organization.allowUserToCreateOrganization: false`.
- **Invite** (`POST /users`): the users service inserts `invitation` rows as `crm_app` inside `withTenant`, under the restrictive admin-only RLS policy (migration 0008), with `name` and `manager_id`. It returns `accept_url` for the Admin to copy until email lands (T9.04).
- **Role and manager changes** (`PUT /users/{id}`): the service updates `member` as `crm_app` and writes `role_changed`. An Admin cannot change their own role, so the last Admin cannot lock the org out (409).
- **Deactivate** (`POST /users/{id}/actions/deactivate`): the tenant transaction sets `member.status = 'deactivated'` and writes `user_deactivated`. Then, through the `crm_auth` pool, one transaction sets `user.banned = true` and deletes the user's sessions. If that fails, the request errors and the tenant transaction rolls back. Every request also re-checks `member.status` in `resolveContext`, so an old cookie gets 401 (AC-32).
- **Sign-in throttling (AC-31).** Better Auth's limiter is on in every environment, backed by a Redis fixed-window counter (atomic `MULTI`): 10 attempts per IP per 15 minutes. A `before` hook adds 20 attempts per email per 15 minutes from any IP.
- Better Auth's own `organization` endpoints stay Admin-only through the access-control statements (`packages/core/src/access.ts`).

## Alternatives considered
- **Give Admins a global `user.role = admin` and call `banUser`.** Rejected: it is cross-tenant power held by tenant users.
- **Call the plugin APIs from our service.** They write through `crm_auth` outside the tenant transaction, so the timeline row and the membership change could diverge. Rejected.
- **Per-IP limit only.** A distributed guess against one account would never trigger it. Rejected.

## Consequences
- The ban is global to the user. That is fine while each user belongs to one org (MVP). With several memberships, ban only on the last one (`shortcut:` comment in `packages/core/src/users.ts`).
- The ban runs in a second transaction after the tenant work. A crash between the two leaves the member deactivated but not banned. `resolveContext` still refuses that user, so access stays closed.
- **Accepted trade-off:** someone who knows an email can lock that user out of sign-in for up to 15 minutes.
- The per-IP key trusts `X-Forwarded-For`. The deploy must meet the launch checklist in `docs/PRODUCTION_READINESS.md` (proxy-only access, `trustedProxies`).
- Accepting an invitation needs an `/accept-invite/{id}` page. It is not built yet: the link is generated, but nothing serves it.
