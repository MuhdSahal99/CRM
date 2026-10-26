# ADR-0015: REST API mirroring Zoho v8, OpenAPI 3.1 contract, Zod at the boundary

## Status
Accepted

## Date
2026-10-27

## Context
- Reference §7 suggests mirroring Zoho's REST shape. That eases the import from Zoho and lets integrations familiar with Zoho reuse their mental model.
- CLAUDE.md requires every endpoint to have an OpenAPI entry, tests, and validation by the shared Zod schemas.
- The UI also needs the same operations, through server components and actions.

## Decision
- **Base path `/api/v1`, module paths use module API names** (`Leads`, `Accounts`, `Contacts`, `Deals`, `Products`, `Quotes`, `Sales_Orders`, `Invoices`, `Tasks`, `Calls`, `Meetings`).
- **Field names in bodies are field `api_name`s** (`Deal_Name`, `Closing_Date`), as in Zoho, so that custom fields (ADR-0006) appear in the same object with no nesting. Query parameters are snake_case (`sort_by`, `per_page`), as in §7. This intentionally differs from camelCase conventions, to stay compatible with Zoho.
- **Envelope:**
  - Success: `{ "data": [...], "info": { "page", "per_page", "count", "more_records" } }`. Single-record GETs also return `data: [record]`, as Zoho does.
  - Error: `{ "code", "message", "details": { "api_name"?, ... }, "status" }` on every endpoint.
  - Status codes: 400 malformed, 401 unauthenticated, 403 permission (role cannot perform the action at all), **404 not found or not visible**, 409 version or state conflict, 422 validation (one `details` entry per field), 429 rate limited.
- **Writes:**
  - `POST /{Module}` takes `{data:[…]}` with up to 100 records. Zoho's `trigger` field is accepted and ignored, because the MVP has no workflow engine.
  - `PUT /{Module}/{id}` is a **partial update** (Zoho semantics) and requires the record's `version`. A stale version returns 409.
- **Idempotency.** `Idempotency-Key` header (client-generated, one per intent) on create, convert, issue, cancel, mark_paid, send_email and share-link create.
  - Table `idempotency_keys` with `UNIQUE(org_id, user_id, key)`.
  - Stored with the request hash and the response. Replays return the stored response.
  - Same key with a different body returns 422. A request still in flight returns 409.
  - Retention is 7 days.
- **Pagination.** `page` and `per_page` (default 20, max 200).
- **Search.** `GET /{Module}/search` supports `criteria` (Zoho syntax, parsed to an AST with an allowlist of fields and operators and never concatenated into SQL), `word`, `email` and `phone`.
- **Out of MVP** (no PRD story): bulk `PUT /{Module}`, `POST /{Module}/actions/mass_update`, and `PUT /{Module}/{id}/{RelatedList}/{related_id}`. They can be added later without breaking changes.
- **Contract and validation.**
  - `docs/openapi.yaml` is the contract.
  - Zod 4 schemas in `packages/core` are the runtime validators, and unknown keys are stripped.
  - A CI test compares `z.toJSONSchema()` output with the OpenAPI component schemas so that the two cannot drift.
- **Versioning.** Changes within v1 are additive only.

## Alternatives considered
- **tRPC or server actions only.** No public contract for future integrations or a mobile app, and does not mirror Zoho. Rejected as the primary API. Server actions may call the same services for UI forms.
- **GraphQL.** Visibility per field and per row is harder to reason about, and Zoho does not use it. Rejected.

## Consequences
- Field names look un-JavaScript-like (`Deal_Name`). Zod schemas map them to column names in one place.
- A 404 for invisible records means clients cannot tell "deleted" from "not yours". That is intentional (US-01).
