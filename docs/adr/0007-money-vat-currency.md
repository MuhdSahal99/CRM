# ADR-0007: Money, Oman VAT and currency handling

## Status
Accepted (VAT on the Adjustment pending OQ-04)

## Date
2026-10-27

## Context
PRD G2, US-08, US-09 and US-10 set the money rules:
- OMR is the base currency, at 3 dp. AED and INR are allowed per record, at 2 dp.
- VAT is set per line by product category: standard 5%, zero-rated, or exempt. The rate is org configuration.
- Each line's VAT is rounded half-up to the currency's precision.
- Each record stores its exchange rate.
- The server computes every total and never trusts totals from the client.

PRD M3 targets zero invoice corrections caused by rounding.

## Decision
- **Storage.**
  - Amounts use `numeric(18,3)`. AED and INR values are stored already rounded to 2 dp; a CHECK `scale_ok` on document headers enforces this through `round(x, currency_scale) = x`.
  - Rates use `numeric(18,8)`.
  - Percentages use `numeric(7,4)`.
  - Drizzle maps all of these as **strings**.
  - JS `number` is never used for money anywhere in the pipeline.
- **Arithmetic.** `packages/core/pricing.ts` exports a pure `priceDocument(input, ctx)`, built on **decimal.js** with `ROUNDING_MODE = ROUND_HALF_UP`. For each line:
  1. `amount = qty × list_price` → round(scale)
  2. `discount = pct ? amount × pct/100 : flat` → round(scale)
  3. `net = amount − discount`
  4. `vat = category = 'standard' ? net × vat_rate/100 : 0` → round(scale). Exempt lines store `vat = 0` with `vat_category = 'exempt'`.
  5. `total = net + vat`
- **Header totals:**
  - `sub_total` = Σ net, and `vat_total` = Σ line vat.
  - A VAT summary groups lines by category.
  - `grand_total = sub_total + vat_total + adjustment`. Sub Total is shown **before** VAT to match the US-10 worked example: 270 + 50 + 24.690 = 358.190.
  - The Adjustment carries **no VAT** until OQ-04 says otherwise.
  - There is no header discount in the MVP.
- **Snapshots on each document.** Lines store `vat_category` and `vat_rate` at pricing time. The header stores `currency`, `currency_scale`, `exchange_rate` (OMR per 1 unit), and OMR equivalents (`grand_total_omr`, `vat_total_omr`) rounded to 3 dp. Changing the org VAT rate or a later exchange rate never rewrites an existing document.
- **Rate capture.** A rate is captured on create, and on currency change while the document is a draft. A Quote → SO → Invoice conversion **copies** the rate and does not re-capture it (US-11). If no rate is effective for the currency, creation is blocked (US-09).
- **Price conversion.** When an OMR-priced product goes onto an AED or INR document, `list_price` defaults to `omr_price ÷ rate`, rounded to 2 dp. The rep can edit it.
- **Zod input.** Input schemas declare **no total fields**, and unknown keys are stripped, so totals sent by a client are silently ignored (US-10). Money arrives as decimal strings matching `^-?\d{1,15}(\.\d{1,3})?$`.
- **Tests.**
  - A unit test reproduces the US-10 worked example exactly.
  - Property tests check that Σ lines = header and that results are stable under recomputation.
  - AED and INR rounding cases are covered.

## Alternatives considered
- **Integer minor units (fils/cents).** Works, but 3 vs 2 dp per currency complicates every column, and `numeric` is exact already. Rejected.
- **big.js.** Smaller, but decimal.js has explicit global rounding config and wider use. Either works. We chose decimal.js.
- **VAT on the document total.** The PRD specifies per-line rounding. Rejected.

## Consequences
- The pricing engine is the only code that writes amount columns. Services call it on every save, and repositories do not accept totals.
- If OQ-04 decides that the Adjustment carries VAT, the change goes into one function plus one new column (`adjustment_vat_category`).
