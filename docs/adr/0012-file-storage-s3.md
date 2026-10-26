# ADR-0012: File storage on S3-compatible object storage

## Status
Accepted

## Date
2026-10-27

## Context
The system stores generated PDFs, Zoho import CSVs, error-report CSVs and attachments (Phase 2). These files contain customer PII and must stay in-region (OQ-03).

## Decision
- **One private bucket per environment**, in the same region as the database:
  - Block Public Access is on.
  - Objects are encrypted with SSE-KMS.
  - Versioning is on, with lifecycle rules: import CSVs expire 90 days after the import completes. PDFs are kept as long as the record they belong to.
- **Object keys** follow `org/<org_id>/<kind>/<file_id>`. `file_id` is a UUID v7, and no user-supplied name is ever part of a key.
- **`files` table:** `(org_id, kind, storage_key, filename, content_type, size_bytes, sha256, created_by)`. The DB is the source of truth. A key is valid only when it is referenced by a `files` row that the caller can see.
- **Downloads** stream through the app after visibility checks (ADR-0005) or share-link resolution (ADR-0009). We do not hand customers presigned GET URLs.
- **Uploads** (CSV import) go through the app:
  - Size cap is 20 MB.
  - Allowed types are `text/csv` and `application/vnd.ms-excel`. The bytes are sniffed to check the file really is text.
  - Each upload is stored before parsing.
- **Dev** uses MinIO through the same S3 SDK (`@aws-sdk/client-s3` v3). Only the endpoint and credentials change, via environment variables.

## Consequences
- Streaming through the app costs some bandwidth. That is acceptable at PDF sizes of about 100 KB.
- Restoring after a disaster needs both the DB and the bucket, and the bucket is replicated (ADR-0013).
