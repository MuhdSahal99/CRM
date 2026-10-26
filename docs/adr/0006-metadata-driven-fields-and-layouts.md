# ADR-0006: Metadata-driven fields and layouts (core columns + custom JSONB)

## Status
Accepted

## Date
2026-10-27

## Context
PRD G4 asks for a model that is defined as data now, so that the Phase-2 admin UI and new tenants can add fields without a rewrite. Reference §8 recommends real tables for standard modules plus JSONB for custom fields. The MVP ships no admin UI and no custom modules.

## Decision
- **Metadata tables:** `modules`, `fields`, `picklists`, `picklist_values`, `layouts`, `layout_sections`, `layout_fields`, `field_permissions`.
  - `fields.api_name` is **immutable** once created. The display `label` is translatable.
  - `picklist_values` carry `category` (Open / Won / Lost style) and `sort_order`.
  - `field_permissions` is keyed by role (`admin`, `manager`, `rep`) × field. Access is `read_write`, `read_only` or `hidden`.
- **Record storage:**
  - Standard modules (Leads, Accounts, Contacts, Deals, Products, Quotes, Sales Orders, Invoices, Activities) have **real typed columns** for the standard fields.
  - Each of these tables also gets `custom jsonb NOT NULL DEFAULT '{}'`, keyed by the custom field's `api_name`.
- **Seeding.** Each standard column is seeded as a `fields` row (`is_system = true`, `column_name` set). Forms, detail views and list columns render from metadata. Special behaviour stays in code: lead convert, deal stages, line items, forecasts.
- **Validation.** Shared Zod schemas validate the core columns. For `custom`, the server builds a Zod schema from the metadata at runtime and rejects unknown or invalid keys.
- **Indexing.** Hot custom fields get expression indexes, added by migration when they are needed.
- **Metadata scope.** Metadata rows carry `org_id`, and system rows are seeded per org. That way a tenant can relabel or hide a system field without affecting other tenants.

## Alternatives considered
- **Full EAV.** Slow, painful to query, no types. Rejected.
- **JSONB-only records.** Loses typed columns, foreign keys and numeric money for the core fields. Rejected.
- **Generate a table per module through DDL at runtime.** That needs DDL rights for the app role, which conflicts with ADR-0003. Rejected.

## Consequences
- The UI is generic, but the MVP's i18n requirement (G6) means `fields.label` holds a message key, not literal text.
- Custom modules (reference §8: JSONB records) are **out of MVP scope**. The `modules` table already has an `is_custom` flag.
