# Review queue

## T7.01 Pricing engine (HUMAN CHECK)
- Review: `priceDocument` rounding (per-line half-up, VAT on net, Adjustment carries no VAT, OQ-04) and the US-10 fixture.
- **Fixture discrepancy:** PRD/ADR-0007 say Sub Total 358.190 = 270 + 50 + 24.690, but that sum is 344.690. 358.190 is sub_total + vat_total (344.690 + 13.500). Grand Total 358.000 matches SCHEMA (`grand = sub + vat + adjustment`). Implemented per SCHEMA; the UI labels 358.190 as "Total before adjustment". Confirm and fix PRD/ADR wording.
- Files: packages/core/src/money/pricing.ts, pricing.test.ts
- Commit: fac69ce

## Checkpoint: pricing (slice 7, HUMAN CHECK)
- Review: packages/core/src/money/pricing.ts, money/schemas.ts, quotes/service.ts (only code that writes amount columns), the US-10 fixture in pricing.test.ts, apps/web/test/quotes.test.ts and e2e/quotes.spec.ts. OQ-04 (Adjustment carries no VAT) is still open: ask the accountant.
- Also review: Line_Items writes are refused (403) unless the caller sees Grand_Total/Sub_Total/VAT_Total and may write Adjustment (Grand_Total is read-only by design, so "writable" is checked on Adjustment).
- Commits: T7.01 fac69ce ... UI fa56792

## T8.06 Issue an invoice (HUMAN CHECK)
- Review: the issuing transaction (FOR UPDATE, re-price and compare with the stored totals, takeNext, seller and buyer snapshots, invoice_issued event, all in one transaction) and the concurrency test (20 concurrent issues, every third rolled back, numbers contiguous and unique; same Idempotency-Key gives one number).
- Open: OQ-06 (number format and start) must be set before go-live; OQ-01 may add e-invoicing fields. The PDF render is queued once the worker exists (T8.09, T8.11).
- Files: packages/core/src/invoices/issue.ts, apps/web/app/api/v1/Invoices/[id]/actions/issue/route.ts, apps/web/test/invoice-issue.test.ts
- Commit: d35f35c

## Checkpoint: invoice numbering (slice 8, HUMAN CHECK)
- Review: open a PDF rendered by the worker for an issued invoice (run the worker with CHROMIUM_PATH and the S3_* variables, issue an invoice, download it) and check it against Oman tax-invoice content: "Tax Invoice", seller name/address/VATIN, buyer name/VATIN, date and number, per-line VAT, VAT summary, VAT in OMR. The template is packages/pdf/src/template.tsx; fonts come from the worker image, not embedded.
- Also review: invoices_lock and the issue transaction (T8.06 above), the cancel PDF (CANCELLED watermark, second file), packages/core/src/storage.ts (nothing issues a presigned URL), apps/worker/Dockerfile (never built here).
- Open: OQ-05 (credit notes) and OQ-06 (number format and start) need Finance answers before go-live; OQ-01 and OQ-02 gate the final template.
- Commits: T8.06 d35f35c, T8.07 133925d, T8.08 2f5245c, T8.09 4c9cae4, T8.10 d9c59ef, T8.11 d6ab4c1, T8.12 7659310, T8.13 (next commit)

## T9.05 Share links: table, resolver, create and revoke API (HUMAN CHECK)
- Review: `public.resolve_share_link` in packages/db/migrations/0028_share_links.sql (SECURITY DEFINER, pinned search_path, the crm_owner policies it needs because the tables are FORCEd, what it returns, EXECUTE only for crm_app); that only sha256(token) is stored; the create response is the only place the plaintext appears, and the idempotency layer stores it redacted.
- Deviation to confirm: the function returns share_link_id instead of org_id (ADR-0009 listed org_id), so the access log can name the link without the token.
- Files: packages/db/migrations/0028_share_links.sql, packages/core/src/share-links.ts, apps/web/app/api/v1/[module]/[id]/share_links/, apps/web/test/share-links.test.ts
- Commit: 3364180

## Checkpoint: share links (slice 9, HUMAN CHECK)
- Review: the resolver (see T9.05 above and migration 0029, which also ends links of a deleted document), the /s/{token} route headers and its single shared 404 (apps/web/app/s/[token]/route.ts, lib/share-response.ts), and the redaction (one access-log line per request holds share_link_id and the path as /s/[redacted]; no tracing is configured yet). AC-01 to 09, AC-40, AC-42, AC-44, AC-45 are integration tests; AC-30 is e2e/csrf.spec.ts.
- Also review: lib/rate-limit.ts (30 requests/min per IP; ten bad tokens block the IP for 15 minutes; fails open if Redis is down; keys on the right-most X-Forwarded-For), mail.ts (an org's SMTP host must be public on port 25/465/587 and never receives the shared credentials), and the e2e specs email.spec.ts / whatsapp.spec.ts, which start the worker themselves.
- Needs from you: OQ-09 (SMTP provider, domain, SPF/DKIM) and SMTP_USERNAME/SMTP_PASSWORD/SMTP_PASSWORD_HOST/SMTP_FROM_DOMAINS in the prod environment (PRODUCTION_READINESS).
- Commits: T9.01 b7a65c9 (+ hardening 03e88c4, 6702ff9), T9.02 1250f70, T9.03 433948e, T9.04 b6f99b7, T9.05 3364180, T9.06 d981cde, T9.07 9ca74b1, T9.08 490b1a1
