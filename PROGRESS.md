# Build progress

- Slice 8: done (T8.06 to T8.13), last commit 7e23b37. Review queue: T8.06 and the invoice-numbering checkpoint. Needs from you: S3_*/CHROMIUM_PATH in .env.local, a built worker image (see PRODUCTION_READINESS).
- Slice 9: done (T9.01 to T9.08), last commit d39b6fe. Review queue: T9.05 and the share-links checkpoint. Needs from you: SMTP_* and S3_*/CHROMIUM_PATH env for prod, OQ-09 (SMTP provider/domain/SPF/DKIM), a built worker image; tests needing Mailpit/MinIO/Chromium skip without MAILPIT_URL/S3_BUCKET/CHROMIUM_PATH.
