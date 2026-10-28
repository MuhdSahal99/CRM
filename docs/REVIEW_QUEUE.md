# Review queue

## T7.01 Pricing engine (HUMAN CHECK)
- Review: `priceDocument` rounding (per-line half-up, VAT on net, Adjustment carries no VAT, OQ-04) and the US-10 fixture.
- **Fixture discrepancy:** PRD/ADR-0007 say Sub Total 358.190 = 270 + 50 + 24.690, but that sum is 344.690. 358.190 is sub_total + vat_total (344.690 + 13.500). Grand Total 358.000 matches SCHEMA (`grand = sub + vat + adjustment`). Implemented per SCHEMA; the UI labels 358.190 as "Total before adjustment". Confirm and fix PRD/ADR wording.
- Files: packages/core/src/money/pricing.ts, pricing.test.ts
- Commit: fac69ce
