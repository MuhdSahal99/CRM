# Implementation Plan: Saqient Sales CRM MVP

Status: **In progress** (2026-10-27). Slice 1 tasks T1.01–T1.27 are done; the slice 1 human checkpoint is still open.
**Tasks:** 112 in the MVP across slices 1–9 and 11, plus 3 in slice 10, deferred to Phase 2 (2026-10-27 scope change, PRD changelog).
Inputs: `docs/PRD.md` §5 (slice order), `docs/TRD.md`, `docs/SCHEMA.md`, `docs/openapi.yaml`, `docs/adr/`, `docs/THREAT_MODEL.md` (abuse cases `AC-xx`), `docs/DESIGN_SYSTEM.md`.

## How to read this plan

- **Task ID** `T<slice>.<nn>`. Tasks run in order inside a slice. Each one leaves `pnpm check && pnpm test` green.
- **Size** counts hand-written diff lines. Lockfile, `messages/en.json` keys and drizzle-kit snapshot files don't count. **XS** < 30 · **S** 30–70 · **M** 70–100. Anything bigger is already split.
- **Tests first.** Write these before the code and watch them fail. **U** = Vitest unit. **I** = Vitest integration against real Postgres, connected as `crm_app`, never as a superuser (ADR-0003). **E** = Playwright run in the existing `w360-*` and `w1440-*` projects (`apps/web/playwright.config.ts`). Every E test asserts `scrollWidth <= viewport` (ADR-0016).
- **🛑 HUMAN CHECK**: stop after this task. Wait for a human review before the next one.
- **✅** after a task heading: done, with its tests green and its commit on `main`.
- **⛔ OQ-xx**: blocked by an open question; the task can't be finished, or can't go to prod, until it's answered. **⚠ OQ-xx**: built on the PRD's MVP default; revisit when the question is answered.

### Definition of done (every task)

1. The tests listed under **Tests first** exist and pass. `pnpm check && pnpm test` passes, and so does `pnpm e2e` when a UI file changed.
2. A new or changed endpoint is in `docs/openapi.yaml` and validated with shared Zod schemas from `packages/core`. Unknown keys are stripped (ADR-0015). If a path or param this plan needs is missing from the spec, add it in the same task.
3. A schema change ships a migration, an update to `docs/SCHEMA.md`, and a row in its migration log.
4. A new tenant table gets RLS + FORCE + `tenant_isolation`. The catalog test (T1.05) enforces this.
5. A new endpoint with `{id}` is covered by the generated cross-org/visibility matrix (T1.15). It needs no hand-written test.
6. A change to a record writes `timeline_events` in the same transaction.
7. The UI uses next-intl strings, logical CSS, and existing `components/ui` and `components/patterns`.
8. Library APIs are checked in Context7 at implementation time. Versions come from the TRD stack table (`npm view` before adding a dependency).

## Dependency graph

```
T1 Foundation ─┬─► T2 Accounts/Contacts ─┬─► T3 Activities/Timeline ─► T4 Leads/Convert ─┐
               │                         ├─► T5 Deals/Pipeline ◄───────(Create-Deal option)┘
               │                         │        │
               └─► T6 Products/VAT/FX ───┴────────┴─► T7 Quotes + pricing ─► T8 SO/Invoice/PDF ─► T9 Email/WhatsApp
                                                  T5 ─► T10 Forecasts (Deferred to Phase 2)
                                    T2, T4, T5, T6 ─► T11 Zoho import + cutover
```

**Ordering issues found while planning:**
- **Lead conversion and deals.** Slice 4 (lead convert) comes before slice 5 (deals), so convert ships first without the "Create Deal" option. T5.07 adds it. US-05 is only complete after T5.07.
- **Deal currency.** Deals carry a currency (SCHEMA), but exchange rates arrive in slice 6. So T5.02 creates `currencies` seeded with OMR/AED/INR, and the deals service accepts OMR only. Without an effective rate, creating a non-OMR deal is blocked, which is already the correct US-09 behaviour. T6.04 enables AED/INR.
- **Ownership transfer.** Transfer (US-03) needs records to move, so it lands in slice 5 (leads, deals, activities). T7.07 adds quotes and T8.03 adds sales orders.
- **Worker.** `apps/worker` isn't needed until PDFs exist, so it's created in slice 8 (T8.07), not slice 1.
- **Invitations.** `POST /users` invitations can't email anyone until SMTP lands in slice 9. Until then, the Admin copies the accept link from the UI. T9.04 adds the email. **Gap found after slice 1:** no task builds the `/accept-invite/{id}` page that the link points to (ADR-0017), so an invited user can't join yet. It needs a task before slice 2 ends.

---

## Slice 1: Foundation (US-01, US-03 part, E11)

#### T1.01 Workspace packages · S · ✅
- **Files:** `packages/core/{package.json,tsconfig.json,vitest.config.ts,src/index.ts}`, `packages/db/{package.json,tsconfig.json,vitest.config.ts}`, `pnpm-workspace.yaml` (if needed), root `package.json` (`db:migrate`, `db:seed`).
- **Tests first:** U: one trivial test per package, to prove `pnpm -r test` and `pnpm -r check` reach both packages.
- **Done when:** `pnpm check && pnpm test` runs in web, core and db. Packages use TS 5.9.3 strict (ADR-0001).

#### T1.02 Local infra and typed config · S · ✅
- **Files:** `docker-compose.yml` (postgres:16, redis:7), `.env.example`, `packages/core/src/config.ts` (Zod env schema).
- **Tests first:** U: an invalid or missing env var throws with the variable's name. A `TEMP-DEV`-style flag can't be enabled when `NODE_ENV=production` (the schema refuses it).
- **Done when:** the app refuses to boot on bad config (TRD Environments). `.env.local` is in `.gitignore`.

#### T1.03 DB roles, drizzle-kit and the integration-test harness · M · ✅
- **Files:** `packages/db/drizzle.config.ts`, `packages/db/migrations/0000_roles_extensions.sql` (`crm_owner`/`crm_app`/`crm_auth`, `pg_trgm`, `citext`), `packages/db/src/client.ts` (node-postgres `Pool` as `crm_app`), `packages/db/test/global-setup.ts` (fresh DB, migrations run as owner).
- **Tests first:** I: connected as `crm_app`, `rolsuper` and `rolbypassrls` are false. `crm_app` can't `CREATE TABLE`.
- **Done when:** `pnpm db:migrate` runs as `crm_owner`, and integration tests run as `crm_app` (ADR-0002, ADR-0003).

#### T1.04 Better Auth tables (orgs, user, member…) · M · ✅
- **Files:** `packages/db/src/schema/auth.ts`, migration `0001_auth.sql`: `orgs`, `user`, `session`, `account`, `verification`, `member` (+`manager_id`, `status`), `invitation`; `crm_auth` grants; `auth_access` policies; `org_users` view.
- **Tests first:** I: `crm_auth` can't select from any CRM table. `crm_app` has no grant on `session`/`account`/`verification`. The `member` composite FK rejects a manager from another org.
- **Done when:** the tables match SCHEMA §Tenancy and auth. Generate them with Better Auth's CLI, then review the output (ADR-0004).

#### T1.05 RLS helpers and catalog guard · 🛑 HUMAN CHECK · S · ✅
- **Files:** migration `0002_rls_helpers.sql`: `app.visible_owner_ids()`, and `tenant_isolation` on `member`/`invitation`/`orgs` (read only for `crm_app`); `packages/db/test/rls-catalog.test.ts`.
- **Tests first:** I: **AC-14**: every table with `org_id` has RLS + FORCE + `tenant_isolation`. **AC-16**: with no context set, `crm_app` sees zero rows in every tenant table.
- **Done when:** the guard fails if a later migration adds a table without the policy. *Human check: these policies are the security backstop for every later slice.*

#### T1.06 `withTenant(ctx, fn)` · M · ✅
- **Files:** `packages/core/src/tenant.ts`, `packages/core/src/tenant.test.ts`.
- **Tests first:** I: **AC-15**: in context A, raw `SELECT` returns only org A rows. **AC-12**: two concurrent orgs share a pool of size 1, and `current_setting('app.org_id', true)` is empty after commit. A thrown `fn` rolls back.
- **Done when:** this is the only DB handle `packages/core` exports. All five `set_config(..., true)` values are set (ADR-0003).

#### T1.07 Boot guard · XS · ✅
- **Files:** `packages/core/src/boot-check.ts`, called from web startup (`instrumentation.ts`).
- **Tests first:** I: **AC-19**: the check throws when connected as a superuser or a BYPASSRLS role.
- **Done when:** the web app refuses to start with an unsafe DB role.

#### T1.08 Seed: two orgs, users per role · S · ✅
- **Files:** `packages/db/src/seed.ts`, `docs/PRODUCTION_READINESS.md` (§Seeded test users).
- **Tests first:** I: the seed is idempotent (running it twice is a no-op). It refuses to run when `NODE_ENV=production`.
- **Done when:** *Saqient* has admin, manager, rep A and rep B, with A and B reporting to the manager. *Demo* has an admin and a rep. A deactivated Saqient rep exists for US-01. Credentials are documented and come from env, never hard-coded in app code.

#### T1.09 Better Auth server and route · M · ✅
- **Files:** `apps/web/lib/auth.ts` (email/password, `organization` + `admin` plugins, drizzle adapter on the `crm_auth` pool, Redis-backed rate limit), `apps/web/app/api/auth/[...all]/route.ts`, `packages/core/src/access.ts` (`createAccessControl` roles admin/manager/rep per ADR-0005).
- **Tests first:** I: a seeded user signs in and gets an httpOnly, Secure, SameSite=Lax cookie. A deactivated (banned) user gets 403 (**US-01**). **AC-31**: 20 bad passwords in 15 min are throttled, and an unknown email gets the same generic error.
- **Done when:** sign-in works against the real DB. There is no bypass path of any kind (CLAUDE.md).

#### T1.10 Switch the login screen to the auth client · XS · ✅
- **Files:** `apps/web/lib/auth-client.ts` (replace the `shortcut:` fetch with `createAuthClient().signIn.email`), `apps/web/e2e/login.spec.ts`.
- **Tests first:** E (w360, w1440): a seeded rep signs in and lands on `/app`. A wrong password shows the inline error. A deactivated user sees the "deactivated" message.
- **Done when:** the `shortcut:` comment is gone, and the login E2E is green on both widths.

#### T1.11 Request context: session, membership, visibility · M · ✅
- **Files:** `packages/core/src/context.ts` (`resolveContext(headers)`: session → member → role/status → recursive CTE for `visible_owner_ids`, `see_all` for admin), `apps/web/proxy.ts` (cookie present → continue, otherwise redirect to `/login`; sets locale; makes no auth decisions).
- **Tests first:** I: the manager's ids include rep A, rep B and the manager. Rep A's ids are only A. An admin gets `see_all`. **AC-32**: after deactivation, the old cookie gets 401 immediately.
- **Done when:** the hierarchy is recomputed per request with no cache (ADR-0005).

#### T1.12 Hierarchy cycle guard · XS · ✅
- **Files:** migration `0003_member_no_cycle.sql`.
- **Tests first:** I: **AC-37**: setting A→B and then B→A is rejected. A self-manager is rejected by the CHECK.
- **Done when:** the trigger rejects cycles of any length.

#### T1.13 API route wrapper and error envelope · M · ✅
- **Files:** `packages/core/src/http/{errors.ts,envelope.ts}`, `apps/web/lib/api.ts` (`apiRoute({input, permission}, handler)`: context → 401/403 → Zod parse → 422 per field → `withTenant` → `{data, info}`; maps `NotFound` → 404, `Conflict` → 409; body cap → 413).
- **Tests first:** U: a Zod error becomes `{code, message, details:{api_name}, status:422}`. A `NotFound` body is byte-identical whether the record is missing or invisible. **AC-34** part: a 10 MB body → 413.
- **Done when:** every `/api/v1` handler uses this wrapper (ADR-0015).

#### T1.14 Logger with redaction · S · ✅
- **Files:** `packages/core/src/log.ts` (pino, redact `password`, `token`, `authorization`, `cookie`, and `/s/<token>` paths), and the wrapper logs one line per request.
- **Tests first:** U: logging a request to `/s/abc…` with a cookie emits neither the cookie nor the token.
- **Done when:** this logger is used by the web app (and later the worker) (ADR-0014).

#### T1.15 Generated visibility matrix and OpenAPI drift test · M · ✅
- **Files:** `apps/web/test/visibility-matrix.test.ts` (reads `docs/openapi.yaml`, runs each path that has a route file under `app/api/v1`), `packages/core/test/openapi-drift.test.ts` (`z.toJSONSchema()` vs components).
- **Tests first:** I: **AC-10** harness: a Demo user calls each implemented `{id}` route with a Saqient id and gets a 404 identical to a random UUID's. U: the drift test fails on a deliberately mismatched schema.
- **Done when:** both tests grow automatically as routes are added (PRD M4).

#### T1.16 Timeline write path · S · ✅
- **Files:** migration `0005_timeline.sql` (`timeline_events`, insert/select-only grants, `record_visibility` policy with an `app.can_see()` stub covering `user`/`org`), `packages/core/src/timeline.ts` (`recordEvent(tx, …)`).
- **Tests first:** I: **AC-25** part: `crm_app` can't UPDATE or DELETE `timeline_events`. An event is written in the caller's transaction and disappears on rollback.
- **Done when:** later slices extend `app.can_see()` for each new record type.

#### T1.17 Metadata tables · M · ✅
- **Files:** migration `0006_metadata.sql` (`modules`, `fields`, `picklists`, `picklist_values`, `layouts`, `layout_sections`, `layout_fields`, `field_permissions`; `api_name` immutable triggers; `admin_only` write policy), `packages/db/src/schema/metadata.ts`.
- **Tests first:** I: updating `fields.api_name` raises. A rep can read the metadata but not insert it. The picklist CHECK holds.
- **Done when:** the tables match SCHEMA §Metadata (ADR-0006).

#### T1.18 Metadata → Zod builder and per-org seeding · M · ✅
- **Files:** `packages/core/src/metadata/{seed-org.ts,record-schema.ts}`, called from the seed.
- **Tests first:** U: `buildRecordSchema(fields)` rejects unknown custom keys, enforces `required`/`max_length`, validates picklist values, and maps `api_name` → column.
- **Done when:** each org gets system `modules` rows. Fields are seeded per module by the later slices.

#### T1.19 Settings metadata endpoints · S · ✅
- **Files:** `apps/web/app/api/v1/settings/{modules,fields}/route.ts`.
- **Tests first:** I: a rep gets only their own org's modules and fields. A cross-org module id returns 404.
- **Done when:** responses match `openapi.yaml`.

#### T1.20 Users API: list, invite, read/update role and manager · M · ✅
- **Files:** `apps/web/app/api/v1/users/route.ts`, `users/[id]/route.ts`, `packages/core/src/users.ts`, migration for the `org_users` view (moved here from T1.04: this is its first consumer).
- **Tests first:** I: **AC-35** part: a rep `POST /users` gets 403. An admin invite creates an `invitation` and returns the accept link. Changing a role or manager writes `role_changed` to the timeline. A cross-org id returns 404.
- **Done when:** these satisfy **US-03** (invite, role, manager). Email delivery comes in T9.04.

#### T1.21 Deactivate a user · S · ✅
- **Files:** `apps/web/app/api/v1/users/[id]/actions/deactivate/route.ts`, `packages/core/src/users.ts`.
- **Tests first:** I: deactivation bans the user, revokes their sessions, sets `member.status = deactivated` and writes `user_deactivated`. Their records are unchanged (**US-01**).
- **Done when:** deactivated users can't sign in, and their records stay intact.

#### T1.22 App shell: layout and auth guard · S · ✅
- **Files:** `apps/web/app/(app)/layout.tsx` (server: `resolveContext` → redirect to `/login`), `apps/web/app/(app)/page.tsx` (empty home).
- **Tests first:** E: `/app` without a session redirects to `/login`. With a session it renders.
- **Done when:** every CRM page lives under `(app)`.

#### T1.23 App shell: sidebar and mobile drawer · M · ✅
- **Files:** `apps/web/components/shell/{sidebar.tsx,nav-items.ts}`, shadcn `sheet` (added via the CLI, then checked for literals and physical classes).
- **Tests first:** E (w360): the menu button opens a drawer, nav links are reachable, and focus returns to the trigger. E (w1440): the sidebar is visible. There's no horizontal scroll at either width.
- **Done when:** nav items come from `modules`. Only routes that exist are shown (DESIGN_SYSTEM §Patterns, §Keyboard).

#### T1.24 App shell: top bar · S · ✅
- **Files:** `apps/web/components/shell/top-bar.tsx` (org name, user menu, sign out, `ThemeToggle`).
- **Tests first:** E: sign out returns to `/login`, and `/app` then redirects.
- **Done when:** sticky headers reserve `scroll-padding` (WCAG 2.4.11).

#### T1.25 Admin Users screen: list and invite · M · ✅
- **Files:** `apps/web/app/(app)/settings/users/page.tsx`, `invite-dialog.tsx`.
- **Tests first:** E (w360, w1440): the admin sees users and their roles and invites a rep. A rep gets 404 on the page.
- **Done when:** this is the **US-03** UI for listing and inviting.

#### T1.26 Admin Users screen: edit and deactivate · S · ✅
- **Files:** `apps/web/app/(app)/settings/users/[id]/page.tsx`.
- **Tests first:** E: change the manager, then deactivate with a confirm dialog. The deactivated user's sign-in then fails.
- **Done when:** this is the **US-03** UI for editing roles and managers and deactivating. The transfer UI comes in T5.10.

#### T1.27 CI pipeline · S · ✅
- **Files:** `.github/workflows/ci.yml` (postgres/redis services; `pnpm check`, `pnpm test`, `pnpm e2e`), `scripts/check-temp-dev.ts` (every `TEMP-DEV:` id must be in PRODUCTION_READINESS).
- **Tests first:** U: the TEMP-DEV script fails on an unlisted id.
- **Done when:** CI is green on a branch (GitHub Actions, confirmed 2026-10-27).

### 🛑 Checkpoint: end of slice 1 (HUMAN CHECK)
- [ ] Sign in as each seeded role at 360 px and on desktop. A deactivated user is refused.
- [ ] AC-10/12/14/15/16/19/31/32/34(part)/35(part)/37 are green.
- [ ] Review: migrations 0000–0005, `withTenant`, `resolveContext`, `apiRoute`.
- [ ] Re-review `THREAT_MODEL.md` (it asks for a review at the end of each slice).

---

## Slice 2: Accounts and Contacts (US-06, US-02 public rule)

#### T2.01 Shared record columns and the accounts table · M · ✅
- **Files:** `packages/db/src/schema/_columns.ts` (`AUDIT`, `SOFT`, `REC`, `ZOHO` helpers), `schema/accounts.ts`, migration, metadata seed for Accounts fields and the default layout.
- **Tests first:** I: the catalog guard passes. The trigram index exists. `parent_account_id = id` is rejected.
- **Done when:** the table matches SCHEMA §accounts.

#### T2.02 Idempotency-Key support · M · ✅
- **Files:** migration `idempotency_keys`, `packages/core/src/http/idempotency.ts`, wired into `apiRoute` as an option.
- **Tests first:** I: a replay returns the stored response. **AC-28**: the same key with a different body → 422 `IDEMPOTENCY_KEY_REUSED`. A request still in flight → 409.
- **Done when:** create, convert, issue, cancel, mark_paid, send_email and share-link create can opt in (ADR-0015).

#### T2.03 Module registry and create/read for Accounts · M · ✅
- **Files:** `packages/core/src/modules/{registry.ts,accounts.ts}`, `apps/web/app/api/v1/[module]/route.ts` (POST), `[module]/[id]/route.ts` (GET).
- **Tests first:** I: a missing `Account_Name` → 422 on that field. **AC-22**: an `Owner.id` from another org → 422. A `created` timeline event is written. GET returns `data:[record]`.
- **Done when:** the generic routes dispatch through the registry. Later modules only add a registry entry.

#### T2.04 Account list with pagination and sorting · S · ✅
- **Files:** `packages/core/src/modules/list.ts`, `[module]/route.ts` (GET).
- **Tests first:** I: **AC-34**: `per_page=100000` → 422. **AC-36** part: `sort_by=amount;drop table` → 422 with no SQL text. **US-02**: rep B lists the account rep A created.
- **Done when:** `info.more_records` is correct, and sorting is allowlisted.

#### T2.05 Account update and soft delete · S · ✅
- **Files:** `[module]/[id]/route.ts` (PUT, DELETE), `packages/core/src/modules/write.ts`.
- **Tests first:** I: a stale `version` → 409. The `updated` event carries `{api_name:[old,new]}`. Soft delete hides the record from lists, and its GET returns 404.
- **Done when:** PUT works as a partial update (ADR-0015).

#### T2.06 Criteria parser · M
- **Files:** `packages/core/src/search/criteria.ts` (+ test).
- **Tests first:** U: Zoho syntax → AST. Unknown fields and operators are rejected. **AC-36**: `((Email:equals:x') or 1=1--))` → error. **AC-34**: 50 levels of nesting → error. Values become bind parameters only.
- **Done when:** the parser has no path that concatenates strings into SQL.

#### T2.07 Search endpoint · S
- **Files:** `apps/web/app/api/v1/[module]/search/route.ts`, `packages/core/src/search/run.ts`.
- **Tests first:** I: `word`, `email`, `phone` and `criteria` all work on Accounts. Rep B finds rep A's account (**US-02**). Results go through the same visibility path as lists.
- **Done when:** private modules reuse this unchanged (AC-11 is completed in T5.04).

#### T2.08 Phone normalisation · XS
- **Files:** `packages/core/src/phone.ts` (libphonenumber-js, a new dependency; check with Context7).
- **Tests first:** U: `"9xxx xxxx"` with OM → `+968…`. A UAE number with AE → `+971…`. Garbage → a validation error.
- **Done when:** the output matches the SCHEMA E.164 CHECK (**US-06**).

#### T2.09 Contacts table and API · M
- **Files:** `schema/contacts.ts`, migration, metadata seed, `packages/core/src/modules/contacts.ts`.
- **Tests first:** I: a mobile saved as `9xxx xxxx` with OM is stored as `+968…` (**US-06**). **AC-13**: an `Account_Name.id` from another org → 422 or 404, and the SQL composite FK rejects it as well.
- **Done when:** Contacts CRUD and search work through the registry.

#### T2.10 Related lists and layouts settings · S
- **Files:** `apps/web/app/api/v1/[module]/[id]/[related_list]/route.ts`, `settings/related_lists/route.ts`, `settings/layouts/route.ts`.
- **Tests first:** I: Account → Contacts lists that account's contacts. A Demo user gets 404 (the matrix covers this).
- **Done when:** later slices add Deals, Quotes and similar related lists as registry entries.

#### T2.11 UI: metadata-driven list page · M
- **Files:** `apps/web/app/(app)/[module]/page.tsx`, `components/records/record-list.tsx` (uses `patterns/data-table`).
- **Tests first:** E (w360: card list; w1440: table): Accounts list, Load more / pagination, and the empty state.
- **Done when:** columns come from the layout metadata, with no per-module code.

#### T2.12 UI: metadata-driven record form · M
- **Files:** `components/records/record-form.tsx`, `app/(app)/[module]/new/page.tsx`, `[id]/edit/page.tsx`.
- **Tests first:** E: submitting with an empty required field shows the server's 422 error under that field, linked with `aria-describedby`. Phone inputs are `type=tel`, `dir=ltr`.
- **Done when:** the form renders from the layout (DESIGN_SYSTEM §Forms).

#### T2.13 UI: Account and Contact detail · M
- **Files:** `app/(app)/[module]/[id]/page.tsx`, `components/records/{record-detail.tsx,related-tabs.tsx}`.
- **Tests first:** E (w360, w1440): create an Account, add a Contact with an Omani mobile, see the Contact on the Account's tab, and see the mobile shown as +968.
- **Done when:** **US-06** passes end to end.

### Checkpoint: slice 2
- [ ] US-06 and US-02 (public) acceptance criteria pass. AC-11(part)/13/22/28/34/36 are green.

---

## Slice 3: Activities and timeline (US-15)

#### T3.01 Activities table, record references and visibility · M
- **Files:** `schema/activities.ts`, migration (type CHECKs, `owner_visibility` restrictive policy, generic `check_record_ref` trigger, `app.can_see()` extended to account/contact/activity).
- **Tests first:** I: a meeting without `start_at` is rejected. A `what_id` pointing at another org's account is rejected by `check_record_ref`. Rep B gets 0 rows for rep A's task on a public account (ADR-0005).
- **Done when:** the table matches SCHEMA §activities.

#### T3.02 Tasks, Calls and Meetings API · M
- **Files:** `packages/core/src/modules/activities.ts` (three registry entries over one table, with per-type Zod schemas).
- **Tests first:** I: CRUD works for each type. A call needs `call_type`, `call_start_at` and duration. The visibility matrix covers all three.
- **Done when:** activities link to Lead, Contact, Account, Deal, Quote, SO or Invoice through `who`/`what`. Types that don't exist yet are added to the enum by their own slice.

#### T3.03 My Activities: open and overdue · S
- **Files:** `packages/core/src/activities/mine.ts`, `GET /Tasks?view=my_open` (add the param to `openapi.yaml` if it's missing).
- **Tests first:** I: an open task due yesterday (Asia/Muscat) is flagged overdue. Completed and system tasks are excluded (**US-15**).
- **Done when:** the query uses the `(org_id, owner_id, due_date)` partial index.

#### T3.04 Timeline read API · S
- **Files:** `apps/web/app/api/v1/[module]/[id]/timeline/route.ts`, `packages/core/src/timeline.ts` (read).
- **Tests first:** I: events come newest first and include linked activities. **AC-18** (timeline part): rep B reading rep A's record timeline gets 404.
- **Done when:** this is the **US-15** timeline API.

#### T3.05 Notes · S
- **Files:** migration `notes`, related list `Notes` (GET/POST) via T2.10. **Add it to `openapi.yaml`**: the spec has no notes path, and US-05 needs notes to exist.
- **Tests first:** I: a note on an Account shows on its timeline as `note_added`. `record_visibility` hides notes on records the user can't see.
- **Done when:** notes can be created from the UI and by import.

#### T3.06 UI: timeline and quick-add activity · M
- **Files:** `components/records/timeline.tsx`, `activity-dialog.tsx`, added to the record detail.
- **Tests first:** E (w360, w1440): log a call on a Contact, and it appears at the top of the timeline.
- **Done when:** the timeline shows field changes, activities and notes.

#### T3.07 UI: My Activities page · S
- **Files:** `app/(app)/activities/page.tsx`.
- **Tests first:** E: a seeded overdue task shows a warning badge with text (not color alone). Completing it removes it.
- **Done when:** **US-15** passes end to end.

### Checkpoint: slice 3
- [ ] US-15 passes. AC-18 (timeline) is green.

---

## Slice 4: Leads and conversion (US-04, US-05 without deal)

#### T4.01 Leads table and create · M
- **Files:** `schema/leads.ts`, migration (`leads_converted_readonly` trigger, `owner_visibility`), metadata seed, `packages/core/src/modules/leads.ts`.
- **Tests first:** I + U: missing `Last_Name` **and** `Company` → 422 with an error on each field (**US-04**). Rep B gets 404 on rep A's lead.
- **Done when:** Leads CRUD works through the registry. Lists exclude converted leads by default.

#### T4.02 Converted Leads view · XS
- **Files:** `packages/core/src/modules/leads.ts` (`view=converted`).
- **Tests first:** I: a converted lead appears only in this view.
- **Done when:** **US-05** (converted view) is met.

#### T4.03 Conversion options · S
- **Files:** `apps/web/app/api/v1/Leads/[id]/__conversion_options/route.ts`.
- **Tests first:** I: a lead whose email matches an existing Contact gets the "attach to existing" offer. A company matching an Account by `lower(name)` gets that account offered.
- **Done when:** the response matches `openapi.yaml`.

#### T4.04 Convert: Account and Contact in one transaction · M
- **Files:** `apps/web/app/api/v1/Leads/[id]/actions/convert/route.ts`, `packages/core/src/leads/convert.ts`.
- **Tests first:** I: exactly 1 Account and 1 Contact are created. Attach-existing creates no new Contact. The lead is flagged with `converted_*`. A `converted` event is written. A failure injected after the Account insert leaves **no** Account, Contact or flag behind (rollback).
- **Done when:** convert is idempotent with `Idempotency-Key`.

#### T4.05 Convert: move notes and activities, block edits · S
- **Files:** `packages/core/src/leads/convert.ts`.
- **Tests first:** I: the lead's notes and activities now point at the Contact. **AC-24**: PUT on, or a second convert of, a converted lead → 409 `INVALID_STATE`. Direct SQL UPDATE raises in the trigger.
- **Done when:** **US-05** is met except for the deal option.

#### T4.06 UI: lead convert dialog · M
- **Files:** `app/(app)/Leads/[id]/convert-dialog.tsx`.
- **Tests first:** E (w360, w1440): convert a lead and land on the new Contact. The attach-existing path works.
- **Done when:** this is the PRD E11 US-05 phone flow, minus the deal checkbox, which comes in T5.07.

### Checkpoint: slice 4
- [ ] US-04 passes, and US-05 passes except "Create Deal". AC-24 is green.

---

## Slice 5: Deals, pipeline, Kanban (US-07, US-02 private rule, US-03 transfer)

#### T5.01 Pipelines, stages and the settings endpoint · S
- **Files:** schema and migration for `pipelines` and `stages`, seeded from reference §2.7 (read that section only), `apps/web/app/api/v1/settings/pipeline/route.ts`.
- **Tests first:** I: one default pipeline per org. Proposal/Price Quote has probability 75. Stage names are i18n keys.
- **Done when:** **US-07** has the single seeded pipeline it needs (⚠ the stage editor is Phase 2).

#### T5.02 Currencies, deals and stage history tables · M
- **Files:** migration and schema for `currencies` (seeded OMR 3 base, AED 2, INR 2), `deals` (generated `amount_omr` and `expected_revenue`), `deal_stage_history`; `app.can_see()` extended to deal.
- **Tests first:** I: `amount_omr` for OMR equals `amount`. `expected_revenue` rounds half-up to the currency scale. The catalog guard passes.
- **Done when:** the tables match SCHEMA. Only OMR deals can be created until T6.04.

#### T5.03 Stage rules trigger · M
- **Files:** migration `deals_stage_rules`.
- **Tests first:** I: moving Qualification → Proposal sets probability 75 and Expected Revenue 7,500.000, and writes a history row. Closed Lost without a reason raises. Closed Won sets 100 and forecast category `closed`, and sets `closed_at` (**US-07**).
- **Done when:** the service and the trigger agree. The service checks first so the user gets a field-level 422.

#### T5.04 Deals API and private visibility · M
- **Files:** `packages/core/src/modules/deals.ts`.
- **Tests first:** I: rep B's list excludes deal D, and GET D → 404. The manager's GET D → 200. **AC-11**: rep B's search by deal name returns nothing, while Accounts are still found. **AC-13**: an account from another org → 422/404. A `stage_changed` event is written.
- **Done when:** **US-02** (private rule) is met for Deals.

#### T5.05 Kanban endpoint · S
- **Files:** `apps/web/app/api/v1/Deals/kanban/route.ts`.
- **Tests first:** I: per stage, count and Σ `amount_omr`, filtered by visibility (the manager sees the team, a rep sees their own).
- **Done when:** totals come only from the server (DESIGN_SYSTEM principle 2).

#### T5.06 Related deals lists · XS
- **Files:** registry entries Account → Deals and Contact → Deals.
- **Tests first:** I: **AC-17**: rep B listing `/Accounts/{X}/Deals`, where the deals are rep A's, gets an empty list.
- **Done when:** **US-06** related lists are filtered by visibility.

#### T5.07 Lead convert: Create Deal option · S
- **Files:** `packages/core/src/leads/convert.ts`, `convert-dialog.tsx`, `e2e/lead-convert.spec.ts`.
- **Tests first:** I: with "Create Deal" ticked → exactly 1 Account, 1 Contact and 1 Deal, and Deal Name defaults to "Acme". Unticked → no deal. The rollback test covers the deal insert too. E (w360, w1440): convert with a deal.
- **Done when:** **US-05** is fully met.

#### T5.08 UI: Kanban board · M
- **Files:** `app/(app)/Deals/board/page.tsx` (uses `patterns/kanban`), `lost-reason-dialog.tsx`.
- **Tests first:** E (w360, w1440): move a deal with the "Move to stage" menu, and the column counts and Σ OMR refresh. Closed Lost opens the reason dialog, and Cancel leaves the deal where it was.
- **Done when:** this is the PRD E11 US-07 flow, with no page-level horizontal scroll (the board scrolls inside itself).

#### T5.09 UI: Deal detail and stage history · S
- **Files:** `app/(app)/Deals/[id]/page.tsx` (reuses the record detail and adds a stage control).
- **Tests first:** E: change the stage on the detail page and see the probability update and a timeline entry.
- **Done when:** **US-07** passes end to end.

#### T5.10 Transfer ownership · M
- **Files:** `apps/web/app/api/v1/users/[id]/actions/transfer/route.ts`, `packages/core/src/users/transfer.ts` (a list of transferable tables: leads, deals, activities), and a transfer step in the deactivate UI.
- **Tests first:** I: every **open** lead, deal and activity owned by rep A now belongs to rep C, with one `owner_transferred` event per record, in one transaction. Closed records don't move. A rep calling it → 403.
- **Done when:** **US-03** is met for the existing modules. T7.07 and T8.03 add quotes and SOs.

### Checkpoint: slice 5
- [ ] US-07, US-02 (private), US-05 (full) and US-03 (transfer) pass. AC-11/13/17 are green.

---

## Slice 6: Products, VAT and exchange rates (US-08, US-09)

#### T6.01 Org settings · S
- **Files:** migration `org_settings`, `apps/web/app/api/v1/settings/org/route.ts`.
- **Tests first:** I: **AC-35**: a rep `PUT /settings/org` → 403. **AC-46**: GET returns no password, only `smtp_secret_ref` presence. The seller VAT number round-trips.
- **Done when:** the fields T8 snapshots onto invoices exist.

#### T6.02 VAT rates · S
- **Files:** migration `vat_rates` (append-only, seeded standard 5.0000 / zero_rated 0.0000), `settings/vat_rates/route.ts`, `packages/core/src/money/vat-rate.ts`.
- **Tests first:** U/I: `effectiveVatRate('standard', date)` picks the latest row with `effective_from ≤ date`. A new rate dated tomorrow doesn't affect today. `crm_app` can't UPDATE a rate.
- **Done when:** **US-08** (rate stored as config) is met.

#### T6.03 Currencies and exchange rates · M
- **Files:** migration `exchange_rates`, `settings/{currencies,exchange_rates}/route.ts`, `packages/core/src/money/fx.ts`.
- **Tests first:** U: the rate lookup uses today in Asia/Muscat. I: with 1 AED = 0.105, the lookup returns `0.10500000`. With no rate → `NoEffectiveRate`. **AC-35**: a rep `POST /settings/exchange_rates` → 403.
- **Done when:** **US-09** rate entry works.

#### T6.04 Deals in AED and INR · S
- **Files:** `packages/core/src/modules/deals.ts`.
- **Tests first:** I: an AED deal stores the rate 0.105. A later rate change leaves its `amount_omr` unchanged. A currency change re-captures the rate. INR with no rate is blocked with a clear message (**US-09**).
- **Done when:** the OMR-only limit from T5.02 is removed.

#### T6.05 Products · M
- **Files:** schema and migration for `products`, metadata seed, `packages/core/src/modules/products.ts` (admin writes, everyone reads).
- **Tests first:** I: a product without a VAT category → 422 (**US-08**). A duplicate `product_code` (case-insensitive) → 422. A rep POST → 403.
- **Done when:** Products are public in the org.

#### T6.06 UI: Products · S
- **Files:** reuses the record list and form. The VAT category is rendered as a `RadioGroup`.
- **Tests first:** E (w360, w1440): the admin creates a product with Zero-rated VAT, and a rep sees it read-only.
- **Done when:** **US-08** passes end to end.

#### T6.07 UI: admin settings for org, VAT and exchange rates · M
- **Files:** `app/(app)/settings/{org,vat,exchange-rates}/page.tsx`.
- **Tests first:** E: the admin adds an AED rate, and the rate list shows it with its effective date.
- **Done when:** **US-09** passes end to end.

### Checkpoint: slice 6
- [ ] US-08 and US-09 pass. AC-35/46 are green.

---

## Slice 7: Quotes and the pricing engine (US-10)

#### T7.01 Pricing engine · 🛑 HUMAN CHECK · M
- **Files:** `packages/core/src/money/pricing.ts` (pure `priceDocument(input, ctx)` on decimal.js `ROUND_HALF_UP`), `pricing.test.ts`.
- **Tests first:** U: **the US-10 worked example exactly**: lines 270.000/13.500, 50.000/0.000, 24.690/exempt; Sub Total 358.190; adjustment −0.190 → 358.000. The VAT summary per category. An AED document rounds to 2 dp, and its OMR equivalents round to 3 dp at the stored rate. Flat discount vs percent. Half-up at .5 boundaries. Exempt lines get `vat_rate` null.
- **Done when:** every function takes and returns strings, never `number`. ⚠ **OQ-04**: the Adjustment carries no VAT. *Human check: confirm the fixture and rounding before anything stores money.*

#### T7.02 Money input validation and property tests · S
- **Files:** `packages/core/src/money/schemas.ts`, `pricing.property.test.ts`.
- **Tests first:** U: **AC-29**: quantity `0`, `-1`, `"1.0001"`, 4-dp money and `NaN` → rejected, while `1e3` is rejected as a format. Properties: Σ lines = header totals, and pricing twice gives the same result.
- **Done when:** these schemas are the only way money enters the system (ADR-0007).

#### T7.03 Document numbering table · S
- **Files:** migration `document_sequences` (`sequence_monotonic` trigger), `packages/core/src/numbering.ts` (`takeNext(tx, docType)` via `UPDATE … RETURNING`).
- **Tests first:** I: lowering `next_value` raises. Format is `prefix || lpad(n, padding)`. A rolled-back transaction doesn't consume a number.
- **Done when:** quotes use it on create. ⚠ **OQ-06**: the prefix and start value are config.

#### T7.04 Quote tables · M
- **Files:** schema and migration for `quotes` and `quote_lines` (`scale_ok`, line CHECKs, `parent_visibility`), `app.can_see()` extended to quote, metadata seed.
- **Tests first:** I: a header with 3 dp in AED violates `scale_ok`. `net_amount ≠ amount − discount` violates the CHECK. Rep B sees 0 of rep A's quote lines (**AC-18** lines).
- **Done when:** the tables match SCHEMA §Sales documents.

#### T7.05 Create a quote · M
- **Files:** `packages/core/src/quotes/service.ts`, registry entry `Quotes`.
- **Tests first:** I: the US-10 fixture via the API stores 358.000. **AC-20**: client-sent `Grand_Total` and `VAT_Amount` are ignored. **AC-21**: `Exchange_Rate` and `Invoice_Number` are ignored. An OMR product on an AED quote defaults to `price ÷ rate` at 2 dp. Missing product or qty ≤ 0 → 422.
- **Done when:** only `priceDocument` writes amount columns.

#### T7.06 Update a quote · M
- **Files:** `packages/core/src/quotes/service.ts` (replace lines, re-price, re-capture the rate on a currency change while in draft), GET with lines and a VAT summary (`GROUP BY vat_category`).
- **Tests first:** I: editing qty re-prices everything. A currency change re-captures the rate. A stale version → 409.
- **Done when:** **US-10** API criteria are all met.

#### T7.07 Quote related lists and transfer · S
- **Files:** registry entries Deal → Quotes and Account → Quotes, `transfer.ts` (adds quotes).
- **Tests first:** I: **AC-17** pattern for quotes. Transfer moves open quotes.
- **Done when:** visibility and transfer cover quotes.

#### T7.08 UI: quote editor · M
- **Files:** `app/(app)/Quotes/[id]/edit/page.tsx` (uses `patterns/line-item-grid`), `product-picker.tsx`.
- **Tests first:** E (w360, w1440): build the 3 fixture lines, save, and see the server totals of 358.190 and 358.000 after the adjustment. Qty 0 shows a field error on that line.
- **Done when:** the UI never computes totals. They refresh from the save response.

#### T7.09 UI: create a quote from a deal · S
- **Files:** a Deal detail action, `app/(app)/Quotes/[id]/page.tsx`.
- **Tests first:** E (w360): open a deal, create a quote, add a line and save. This is the first half of PRD M7.
- **Done when:** **US-10** passes end to end.

### 🛑 Checkpoint: pricing (HUMAN CHECK)
- [ ] The US-10 fixture is green in U, I and E. AC-18(lines)/20/21/29 are green.
- [ ] Review `pricing.ts` and the money schemas. Ask the accountant about OQ-04 if it's still open.

---

## Slice 8: Sales Orders, Invoices, PDF (US-11, US-12)

#### T8.01 Sales order tables · S
- **Files:** schema and migration for `sales_orders` and `sales_order_lines`; `can_see` and the metadata seed extended.
- **Tests first:** I: catalog guard and `parent_visibility` on the lines.
- **Done when:** the tables match SCHEMA.

#### T8.02 Convert Quote → Sales Order · M
- **Files:** `apps/web/app/api/v1/Quotes/[id]/actions/convert/route.ts`, `packages/core/src/conversions.ts`.
- **Tests first:** I: lines, addresses, the account/contact/deal, the currency and the **stored rate** are copied, even after the org rate has changed. `SO.quote_id = Q.id`. Idempotent with a key (**US-11**).
- **Done when:** the SO is priced with the copied rate and VAT snapshot.

#### T8.03 Sales Orders API, related lists, transfer · S
- **Files:** registry entry `Sales_Orders`, `transfer.ts` (adds SOs).
- **Tests first:** I: the visibility matrix covers SOs. Transfer moves open SOs.
- **Done when:** SO CRUD works.

#### T8.04 Invoice tables and lock triggers · M
- **Files:** migration for `invoices` and `invoice_lines` (CHECK number when not draft, `invoices_lock`, `invoice_lines_lock`, `invoices_no_delete`).
- **Tests first:** I: **AC-23** (SQL): as `crm_app`, updating an issued invoice's totals or lines raises. Deleting an issued invoice raises. The allowed transitions work.
- **Done when:** the DB backstop is in place before any API can issue.

#### T8.05 Convert Sales Order → Invoice · S
- **Files:** `apps/web/app/api/v1/Sales_Orders/[id]/actions/convert/route.ts`.
- **Tests first:** I: a draft invoice with no number. `sales_order_id` is set. The rate is copied (**US-11**).
- **Done when:** registry entry `Invoices` exists, and PUT is allowed only on drafts (**AC-23** API → 409).

#### T8.06 Issue an invoice · 🛑 HUMAN CHECK · M
- **Files:** `apps/web/app/api/v1/Invoices/[id]/actions/issue/route.ts`, `packages/core/src/invoices/issue.ts` (`FOR UPDATE` → re-price and compare → `takeNext` → seller and buyer snapshots → `invoice_issued` event).
- **Tests first:** I: **AC-26**: 20 concurrent issues with random injected rollbacks give contiguous numbers with no duplicates. **AC-27**: two calls with the same key give one number, and the second returns the stored response. A non-draft → 409.
- **Done when:** **US-12** numbering is met. ⛔ **OQ-06** (format and start number) must be set before go-live. The mechanism doesn't wait for it. ⚠ **OQ-01** may add e-invoicing fields. *Human check: review the issuing transaction and the concurrency test.*

#### T8.07 Cancel and mark paid · S
- **Files:** `Invoices/[id]/actions/{cancel,mark_paid}/route.ts`.
- **Tests first:** I: **AC-25**: cancel writes its timeline row in the same transaction, and the number is kept. Mark paid writes `invoice_paid`. paid → cancelled is allowed only for an admin.
- **Done when:** **US-12** status flow is met. ⚠ **OQ-05**: credit notes may replace or extend cancel.

#### T8.08 Files and object storage · M
- **Files:** `docker-compose.yml` (adds MinIO), migration `files` (immutable once ready), `packages/core/src/storage.ts` (S3 v3 client, key `org/<org>/<kind>/<uuid>`, streaming read).
- **Tests first:** I: **AC-43**: a filename of `../../etc/passwd.csv` is stored under a UUID key, and the filename is sanitised. A ready file can't be updated.
- **Done when:** nothing ever issues a presigned URL (ADR-0012).

#### T8.09 Worker skeleton · M
- **Files:** `apps/worker/{package.json,src/index.ts,src/jobs.ts}` (BullMQ, Zod payloads, `withTenant`), `packages/core/src/jobs/enqueue.ts` (enqueue after commit, intent-based job ids), sweeper.
- **Tests first:** I: **AC-41**: a job with org A and an id from org B finds no row and does nothing. A job enqueued inside a rolled-back transaction never runs.
- **Done when:** a failed job lands in the DLQ (ADR-0011).

#### T8.10 PDF template · M
- **Files:** `apps/web/app/(pdf)/[doc]/[id]/template.tsx` (server HTML, next-intl), invoice, quote and SO variants.
- **Tests first:** U: an issued invoice's HTML contains "Tax Invoice", the seller name, address and VATIN, the buyer VATIN, the date and number, per-line VAT, the VAT summary, and the VAT in OMR. **AC-33** (PDF part): `<img onerror>` in a description renders as text.
- **Done when:** the template is English-only. ⛔ **OQ-01** and **OQ-02** gate the go-live template (QR code, Arabic).

#### T8.11 PDF rendering job · M
- **Files:** `apps/worker/src/pdf.ts` (puppeteer-core, network blocked), worker Dockerfile with a pinned Chromium.
- **Tests first:** I: rendering writes a `ready` file with its sha256. An issued invoice renders exactly once. Cancel renders a new "CANCELLED" file version.
- **Done when:** Chromium makes no outbound requests (ADR-0010).

#### T8.12 PDF download · S
- **Files:** `apps/web/app/api/v1/[doc_module]/[id]/pdf/route.ts`.
- **Tests first:** I: the visibility matrix returns 404 for another rep or org. The response streams from storage without exposing the S3 host.
- **Done when:** the PDF is served through the app.

#### T8.13 UI: Sales Order and Invoice screens · M
- **Files:** `app/(app)/{Sales_Orders,Invoices}/[id]/page.tsx`, action menu (Convert, Issue, Cancel with reason, Mark paid, Download PDF).
- **Tests first:** E (w360, w1440): convert quote → SO → invoice, issue it, see the number and a locked editor, and download the PDF.
- **Done when:** **US-11** and **US-12** pass end to end.

### 🛑 Checkpoint: invoice numbering (HUMAN CHECK)
- [ ] AC-23/25/26/27/33(PDF)/41/43 are green. A human reviews a rendered tax-invoice PDF.
- [ ] Get OQ-05 and OQ-06 answered by Finance before go-live.

---

## Slice 9: Email and WhatsApp sending (US-13, US-14)

#### T9.01 SMTP transport · S
- **Files:** `docker-compose.yml` (adds Mailpit), `packages/core/src/mail.ts` (nodemailer, a new dependency; check with Context7; credentials from the secret ref, or `.env.local` in dev).
- **Tests first:** I: sends to Mailpit. `Message-ID` is derived from `email_sends.id`.
- **Done when:** dev works. ⛔ **OQ-09** (provider, domain, SPF/DKIM) blocks the prod config.

#### T9.02 Send email: request · M
- **Files:** migration `email_sends`, `apps/web/app/api/v1/[doc_module]/[id]/actions/send_email/route.ts`.
- **Tests first:** U: **AC-44**: `\r\nBcc:` in a subject or name → 422. I: **AC-45**: a contact the caller can't see → 404, and a raw email address → 422. A `queued` row is created and enqueued after commit, idempotent with a key.
- **Done when:** the job id is `email:<id>`.

#### T9.03 Send email: worker · M
- **Files:** `apps/worker/src/email.ts`.
- **Tests first:** I: success → `sent` plus the activity "Email sent to X" in one transaction. An SMTP failure → `failed` and **no** sent activity (**US-13**). **AC-42**: Redis killed after commit → the sweeper re-enqueues and exactly one activity exists.
- **Done when:** the status compare-and-set makes a redelivered job a no-op.

#### T9.04 UI: Send Email, and invitation emails · M
- **Files:** `components/records/send-email-dialog.tsx`, `packages/core/src/users.ts` (invitation emails via `mail.ts`).
- **Tests first:** E (w360, w1440): send a quote, and the Mailpit API shows the PDF attachment and a toast confirms. A forced SMTP failure shows an inline error.
- **Done when:** **US-13** passes end to end, and invitations are emailed.

#### T9.05 Share links: table, resolver, create and revoke API · 🛑 HUMAN CHECK · M
- **Files:** migration `share_links` and `resolve_share_link(bytea)` (`SECURITY DEFINER`, `search_path` pinned, owned by `crm_owner`), `[doc_module]/[id]/share_links/route.ts`, `…/[link_id]/route.ts`, `packages/core/src/share-links.ts`.
- **Tests first:** I: **AC-40**: a crafted session `search_path` is ignored, and the function returns ≤ 1 row with 4 columns. Only the sha256 hash is stored. Expiry is the org TTL (7 days, at most 30). Revoke sets `revoked_at`. Rep B can't create a link on rep A's quote (404).
- **Done when:** the plaintext token appears only in the create response.

#### T9.06 Public `/s/{token}` route · M
- **Files:** `apps/web/app/s/[token]/route.ts`, `link-expired` page.
- **Tests first:** I: **AC-01**: a random token → 404 with the same body and headers as an expired one. **AC-03**: revoked → 404 on the next request. **AC-04**: extra query or path tricks still serve only the linked file. **AC-05**: re-rendering doesn't change the shared bytes. **AC-07**: the required headers. **AC-08**: at `expires_at + 1s` → 404 (U with a clock, plus I). **AC-09**: no S3 host and no ids in the response.
- **Done when:** **US-14** link behaviour is met.

#### T9.07 Rate limit and token redaction · S
- **Files:** `apps/web/lib/rate-limit.ts` (Redis), applied to `/s/*`.
- **Tests first:** I: **AC-02**: 100 bad tokens from one IP → 429 past the limit, while another IP is unaffected. **AC-06**: logs and traces from opening a link contain `share_link_id` and never the token.
- **Done when:** ADR-0009's rate limit and logging rules are met.

#### T9.08 UI: Send on WhatsApp and revoke · M
- **Files:** `components/records/whatsapp-button.tsx`, `share-links-list.tsx`.
- **Tests first:** E (w360, w1440): the click opens `https://wa.me/<E.164>?text=…` containing an `/s/` link, and an activity "WhatsApp link shared" is logged. With no mobile, the button is disabled and visible text says why. Revoke makes the link show "link expired".
- **Done when:** **US-14** passes end to end. Together with T7.09 this is PRD M7, done on a phone.

### 🛑 Checkpoint: share links (HUMAN CHECK)
- [ ] AC-01–09, AC-40, AC-42, AC-44 and AC-45 are green.
- [ ] Review the resolver function, the route headers and the redaction. **AC-30** (cross-site POST blocked) is added as an E test here, since every mutating flow now exists.

---

## Slice 10: Forecasts (US-16): Deferred to Phase 2

**Deferred to Phase 2** (scope change 2026-10-27, PRD changelog). Don't build these tasks in the MVP: they aren't in the task count, the go-live gate, or the T1.15 visibility matrix. They're kept here so Phase 2 can start from them. `forecast_targets` and the `/forecasts` paths stay documented in SCHEMA.md and openapi.yaml, marked Phase 2.

#### T10.01 Forecast targets · S · Deferred to Phase 2
- **Files:** migration `forecast_targets` (`target_visibility`), `apps/web/app/api/v1/forecasts/targets/route.ts`.
- **Tests first:** I: the manager sets a target for their own reports. Setting one for another team's rep → 404. A rep → 403. An admin can set any.
- **Done when:** targets are stored per user, year and quarter.

#### T10.02 Forecast computation · M · Deferred to Phase 2
- **Files:** `apps/web/app/api/v1/forecasts/route.ts`, `packages/core/src/forecasts.ts`.
- **Tests first:** I: for Q3 deals, Achieved, Committed, Best Case (Committed + Σ best case), Pipeline and Gap are computed in OMR at each deal's stored rate. The manager's totals equal the sum of their reports. A rep sees only their own row (**US-16**). The fiscal year starts in January.
- **Done when:** nothing is stored; everything is computed per request from `amount_omr`.

#### T10.03 UI: forecast page · M · Deferred to Phase 2
- **Files:** `app/(app)/forecasts/page.tsx` (DataTable plus a Column chart with a data table), target edit dialog.
- **Tests first:** E (w360, w1440): the manager sees the team and the total, and edits a target. A rep sees one row.
- **Done when:** **US-16** passes end to end.

### Checkpoint: slice 10
- Deferred to Phase 2. US-16 is not part of the MVP go-live gate.

---

## Slice 11: Zoho CSV import and cutover (US-17, go-live gate)

#### T11.01 Import tables and upload · M
- **Files:** migration for `import_jobs` and `import_rows` (`admin_only`), `apps/web/app/api/v1/imports/route.ts`.
- **Tests first:** I: **AC-56**: 25 MB → 413, a binary renamed `.csv` → 422, more than the row cap → 422, and nothing reaches the CRM tables. **AC-35**: a rep `POST /imports` → 403.
- **Done when:** the CSV is stored as a `files` row.

#### T11.02 Mapping validation and streaming parse · M
- **Files:** `packages/core/src/import/{mapping.ts,parse.ts}` (csv-parse, a new dependency; check with Context7).
- **Tests first:** U: **AC-54**: mappings to `Grand_Total`, `id`, `org_id` or `Created_Time` → 422. I: **AC-57**: a 5 MB field, 5,000 columns, or unbalanced quotes → a row error or job failure with a message, with bounded memory.
- **Done when:** only allowlisted `api_name`s can be mapped.

#### T11.03 Dry run · M
- **Files:** `apps/worker/src/import.ts` (validate phase), `GET /imports/{id}`.
- **Tests first:** I: **AC-53**: a dry run writes zero CRM rows and reports counts and per-row errors. **AC-50**: an owner email from another org → assigned to the admin and flagged. **AC-52**: 0 or 2 account matches → a row error with no guessed link.
- **Done when:** **US-17** (dry run first) is met.

#### T11.04 Confirm and idempotent upsert · M
- **Files:** `apps/web/app/api/v1/imports/[id]/actions/confirm/route.ts`, `apps/worker/src/import.ts` (write phase).
- **Tests first:** I: valid rows are imported and failed rows kept. Importing the same file twice gives 0 new records, counted as duplicates. **AC-51**: a matching `zoho_id` in org A leaves A untouched. Each record gets an `imported` event.
- **Done when:** **US-17** (no silent failure, no duplicates) is met.

#### T11.05 Errors CSV · S
- **Files:** `apps/web/app/api/v1/imports/[id]/errors/route.ts`.
- **Tests first:** U: **AC-55**: cells starting with `=`, `+`, `@` or `-` are prefixed with `'`.
- **Done when:** failed rows download with their messages.

#### T11.06 Module mappers: Accounts and Products · S
- **Files:** `packages/core/src/import/modules/{accounts,products}.ts`.
- **Tests first:** I: a Zoho sample export of each imports field-for-field.
- **Done when:** these two modules can be imported.

#### T11.07 Module mappers: Contacts and Leads · S
- **Files:** `packages/core/src/import/modules/{contacts,leads}.ts`.
- **Tests first:** I: a Contact links to its Account by Zoho id, falling back to name. Phones are normalised to E.164.
- **Done when:** these two modules can be imported.

#### T11.08 Module mapper: Deals · S
- **Files:** `packages/core/src/import/modules/deals.ts` (Zoho stage → seeded stage map).
- **Tests first:** I: a Deal links to its Account and Contact by Zoho id. An unknown stage → row error.
- **Done when:** all 5 modules can be imported. ⚠ **OQ-07**: historic Quotes, SOs and Invoices are out of scope unless the answer changes this.

#### T11.09 UI: import wizard · M
- **Files:** `app/(app)/settings/import/page.tsx` (upload → map → dry-run report → confirm → download errors).
- **Tests first:** E (w360, w1440): the admin imports a sample Accounts file end to end.
- **Done when:** **US-17** passes end to end.

#### T11.10 Reconciliation report · S
- **Files:** `scripts/reconcile-import.ts`.
- **Tests first:** U: counts per module = imported + error rows. 20 records are sampled and compared field by field.
- **Done when:** the output gives the evidence for PRD M2.

#### T11.11 100k-record seed and load test · M
- **Files:** `packages/db/src/seed-perf.ts`, `scripts/load/{list,detail}.js` (k6).
- **Tests first:** the load script fails when p95 ≥ 1 s.
- **Done when:** list and detail p95 < 1 s for a 100k-record tenant (PRD E11 / M6). The run itself needs staging (see below).

#### T11.12 Restore drill and go-live checklist · 🛑 HUMAN CHECK · S
- **Files:** `docs/RUNBOOK.md` (restore steps), `docs/PRODUCTION_READINESS.md` (launch checklist).
- **Tests first:** none. This is a manual drill: restore takes ≤ 4 h and loses ≤ 1 h of data.
- **Done when:** the drill is recorded. ⛔ **OQ-03** (residency) blocks the hosting region and so the drill environment. ⚠ **OQ-08** sets the uptime monitoring hours.

### 🛑 Checkpoint: go-live gate (HUMAN CHECK)
- [ ] All US-01…US-17 acceptance criteria pass, and the full E2E suite is green at 360 px and desktop.
- [ ] The restore drill has passed, and the import is reconciled (M2).
- [ ] OQ-01, OQ-02, OQ-03, OQ-05, OQ-06 and OQ-09 are answered, or explicitly accepted as risk.

---

## Open questions → tasks

| OQ | Effect | Tasks |
|---|---|---|
| OQ-01 e-invoicing | ⛔ go-live invoice fields and PDF | T8.06, T8.10 |
| OQ-02 bilingual invoices | ⛔ go-live PDF template | T8.10 |
| OQ-03 data residency | ⛔ hosting, staging, restore drill | T11.11 (run), T11.12 |
| OQ-04 VAT on the Adjustment | ⚠ default: no VAT | T7.01 |
| OQ-05 credit notes | ⚠ default: cancel only | T8.07 |
| OQ-06 invoice number format and start | ⛔ config value before the first real issue | T7.03, T8.06 |
| OQ-07 historic document import | ⚠ default: not imported | T11.08 |
| OQ-08 business hours | ⚠ monitoring only | T11.12 |
| OQ-09 SMTP provider | ⛔ prod email config | T9.01 |

No open question maps to slice 10. The PRD assumption that the fiscal year starts in January moved to Phase 2 with US-16 (2026-10-27), so it no longer affects any MVP task.

## Not in this plan

- **Production infrastructure.** Deferred by decision (2026-10-27): hosting is chosen at go-live, likely a single server rather than the AWS layout in TRD/ADR-0013. It will be planned as a later task once OQ-03 is answered. Until then, the app keeps to portable pieces only (Postgres, Redis, S3-compatible storage, SMTP), so it runs on either.
- **Phase 2 items** from PRD §5, including slice 10 (Forecasts), which is deferred but kept above for reference.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Better Auth's org plugin doesn't map cleanly onto `orgs`, `member.manager_id` and `org_id` naming | High (slice 1) | T1.04 runs Better Auth's CLI first and reviews the generated SQL, before writing any RLS on top of it |
| RLS + `set_config` per transaction doesn't fit Drizzle's transaction API | High | T1.06 proves it with AC-12 before anything else builds on it |
| Puppeteer/Chromium image size or startup time in the worker | Medium | It's isolated to T8.11; the template (T8.10) is testable without Chromium |
| E2E runs get slow as 6 Playwright projects × all flows | Medium | Tag the flows. CI runs `w360-light` + `w1440-light` per PR, and all 6 projects nightly |
