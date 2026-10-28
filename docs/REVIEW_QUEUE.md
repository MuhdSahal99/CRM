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
