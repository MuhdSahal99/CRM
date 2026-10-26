# CRM — project rules
## Commands
- Dev: `pnpm dev` · Test: `pnpm test` · E2E: `pnpm e2e` · Lint/types: `pnpm check` · DB: `pnpm db:migrate`, `pnpm db:seed`
## Source of truth
- Requirements: @docs/PRD.md · Architecture: @docs/TRD.md · Schema: @docs/SCHEMA.md
- Domain spec: docs/reference/zoho-crm-sales-module-rebuild.md (read the relevant section, not the whole file)
## Rules
- IMPORTANT: Never add an auth bypass, magic header, or "skip auth if dev" branch. Use seeded test users (see docs/PRODUCTION_READINESS.md).
- Any dev-only relaxation must be a typed config flag, marked `// TEMP-DEV: <id>` and listed in docs/PRODUCTION_READINESS.md.
- Every query is scoped by org_id and record-visibility rules on the server.
- Validate all input with the shared Zod schemas; never trust client-computed totals.
- New/changed endpoints → update OpenAPI + tests in the same change. Schema change → migration + SCHEMA.md.
- Work in small vertical slices; run `pnpm check && pnpm test` before saying done.
- Use Context7 for library APIs; don't guess versions.
