# ADR-0008: Gap-free tax-invoice numbering and post-issue locking

## Status
Accepted (format and start number pending OQ-06; credit notes pending OQ-05)

## Date
2026-10-27

## Context
US-12 sets three rules for invoices:
- Each issued invoice gets the next number in an org-wide sequence that has **no gaps and never reuses a number**.
- An issued invoice is locked.
- A cancelled invoice keeps its number.

Postgres `SEQUENCE`s are non-transactional. A rolled-back `nextval` leaves a gap, so they cannot meet this.

## Decision
- **Counter table:** `document_sequences(org_id, doc_type, prefix, next_value, padding)`, with PK `(org_id, doc_type)`.
- **Assign on issue, not on create.** A draft invoice has `invoice_number = NULL`. `POST /Invoices/{id}/actions/issue` runs in one transaction:
  1. `SELECT … FROM invoices WHERE id = $1 FOR UPDATE`. The invoice must be `draft` and visible.
  2. Re-price through the pricing engine (ADR-0007) and verify that totals are unchanged.
  3. Take the next number:
     ```sql
     UPDATE document_sequences SET next_value = next_value + 1
     WHERE org_id = $org AND doc_type = 'invoice'
     RETURNING next_value - 1
     ```
     The row lock serialises concurrent issues, and a rollback releases the number.
  4. Set `invoice_number`, `issued_at`, `issued_by`, `status = 'issued'`.
  5. Write a timeline event.
  6. Commit. The PDF render job is enqueued **after** commit (ADR-0011).
- **Constraints:**
  - `UNIQUE (org_id, invoice_number)`.
  - `CHECK (status = 'draft' OR invoice_number IS NOT NULL)`.
- **Locking trigger (DB backstop).**
  - `invoices_lock` blocks UPDATEs to `invoices` that change any column other than `status`, `paid_at`, `cancelled_at`, `cancel_reason`, `updated_*` and `version` when `OLD.status <> 'draft'`.
  - `invoice_lines_lock` blocks INSERT, UPDATE and DELETE on lines of a non-draft invoice.
  - A hard DELETE of an issued invoice is blocked. Soft delete is also refused when the invoice is not a draft.
- **Status flow:**
  - `draft → issued → paid`
  - `issued → cancelled`
  - `paid → cancelled` is blocked unless the user is an Admin. OQ-05 may require a credit note instead.
  - A cancelled invoice keeps its number and its PDF. The PDF is re-rendered with a "CANCELLED" watermark as a new file version.
- **Quotes and Sales Orders** use the same table (`doc_type = 'quote' | 'sales_order'`) but assign their number on create. Gaps there are harmless, though the same mechanism avoids them anyway.
- **Format** is `prefix || lpad(n, padding, '0')`. Both are configurable per org until OQ-06 decides the format and whether numbering continues from Zoho's last number. The Admin sets `next_value` once, before the first issue. After that, `next_value` can only increase (enforced by trigger).

## Alternatives considered
- **Postgres SEQUENCE.** Leaves gaps on rollback. Rejected.
- **`MAX(invoice_number) + 1`.** Racy without a table lock, and it reuses a number if the newest invoice is ever deleted. Rejected.

## Consequences
- Issuing is serialised per org. At our volume (tens of invoices a day) this is negligible.
- Any correction to an issued invoice is a cancel plus a new invoice (or a credit note, per OQ-05). There is no in-place edit.
