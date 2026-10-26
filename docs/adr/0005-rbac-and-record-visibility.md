# ADR-0005: RBAC (Admin, Sales Manager, Sales Rep) and server-enforced record visibility

## Status
Accepted

## Date
2026-10-27

## Context
- PRD G3 and US-02 make Deals, Quotes, Sales Orders and Invoices private to their owner and the owner's managers, and make Accounts and Contacts public to the whole org.
- The same filter must apply to every list, search, report, forecast, export and PDF endpoint.
- Zoho models this with a role tree, profiles and sharing rules (reference §5). The PRD needs less than that: three fixed roles and one reporting manager per user.

## Decision
**Permissions (what you can do)** are a static matrix defined with Better Auth `createAccessControl`:

| Resource | Admin | Manager | Rep |
|---|---|---|---|
| Records (CRUD on visible rows) | ✔ | ✔ | ✔ |
| Users, roles, transfer | ✔ | — | — |
| Products, VAT rates, currencies, exchange rates, org settings | ✔ | read | read |
| Forecast targets | ✔ | ✔ (own team) | read own |
| Zoho import | ✔ | — | — |

**Visibility (which rows you see)** works in two layers:

1. **Hierarchy.** `member.manager_id` forms a tree. At the start of each request, one recursive CTE computes `visible_owner_ids`: the user plus every direct and indirect report. Admin sets `app.see_all = on`.
2. **Sharing per module:**

   | Module | Rule |
   |---|---|
   | Accounts, Contacts, Products | Public in org (tenant policy only) |
   | Leads, Deals, Quotes, Sales Orders, Invoices, Activities | Private: `owner_id = ANY(app.visible_owner_ids)` or `app.see_all` |

**Enforcement:**
- **In the DB.** A second RLS policy on each private table:
  ```sql
  CREATE POLICY owner_visibility ON deals USING (
    current_setting('app.see_all', true) = 'on'
    OR owner_id = ANY (string_to_array(current_setting('app.visible_owner_ids', true), ',')::uuid[])
  );
  ```
  Policies of the same command type are OR'd together, so this policy is created `AS RESTRICTIVE`. That ANDs it with tenant isolation.
- **In the app.** The service layer applies the same predicate (for clear query plans and errors). The DB policy is the backstop, so a missing filter fails closed.
- **Not found.** A record hidden by visibility returns **404, never 403**, so existence doesn't leak (US-01, US-02).
- **Activities.** An activity linked to a public Account is still private to its owner.
- **Related lists.** Related lists on public records (e.g. an Account's Deals) are filtered by the child's rule (US-06).
- **Ownership.** Transfer of ownership (US-03) is an Admin action that runs in one transaction and writes a timeline event per record.

## Alternatives considered
- **Full Zoho role tree + profiles + sharing rules.** Too much for 3 roles. The data model leaves room to add it in Phase 2 without migrating records.
- **Visibility in the app only.** Rejected as the only control (see ADR-0003).

## Consequences
- **Hierarchy changes.** When a manager is reassigned, the next request picks up the new tree automatically, because nothing is cached across requests.
- **Size of the id list.** `visible_owner_ids` is at most team-sized (≤ 50 users per tenant), so passing it as a setting is cheap.
- **Tests.** Every endpoint gets an automated visibility test (PRD M4): rep A vs rep B, manager over A, cross-org.
