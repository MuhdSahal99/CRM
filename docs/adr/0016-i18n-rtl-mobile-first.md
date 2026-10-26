# ADR-0016: i18n-ready, RTL-safe, mobile-first UI

## Status
Accepted

## Date
2026-10-27

## Context
PRD G6 and E11 set the UI requirements:
- Every UI string comes from translation files, and a lint rule fails the build on hard-coded user-facing strings.
- Layouts use logical CSS properties, so that an Arabic RTL UI can be added later.
- Every MVP screen is fully usable at 360 px, which E2E tests verify.

The MVP UI is English-only.

## Decision
- **next-intl 4.14.x** handles translation.
  - Messages live in `apps/web/messages/en.json`, and `ar.json` is added in Phase 2.
  - Server components read them with `getTranslations` and client components with `useTranslations`.
  - Dates and numbers are formatted through next-intl's formatters. Money uses a shared `formatMoney(value, currency)` that respects the currency's scale (3 for OMR, 2 for AED/INR).
- **Field labels** from metadata (ADR-0006) are message keys.
- **Lint rules** that fail `pnpm check`:
  - No literal strings in JSX text or in user-facing attributes (`aria-label`, `title`, `placeholder`, `alt`), e.g. `eslint-plugin-i18next`'s `no-literal-string` in JSX-only mode.
  - No physical CSS properties or Tailwind utilities: `ml-*`, `mr-*`, `pl-*`, `pr-*`, `left-*`, `right-*`, `text-left`, `text-right` are banned in favour of `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, `text-end`.
- **`<html lang dir>`** is set from the locale, so switching to RTL is a config change.
- **Mobile first.**
  - Base styles target 360 px, and layouts widen at breakpoints.
  - On phones, lists render as cards and the Kanban scrolls horizontally per column, not per page.
  - The line-item editor stacks fields per row.
  - Touch targets are at least 44 px.
- **E2E.** Playwright runs two projects, `desktop` and `mobile-360` (viewport 360×740). The PRD E11 flows run in both: US-05, US-07, US-10, US-13 and US-14. Each test asserts `document.scrollingElement.scrollWidth <= 360`.

## Alternatives considered
- **react-i18next.** Viable, but next-intl integrates with App Router server components. We chose next-intl.

## Consequences
- Small extra effort per string. Arabic in Phase 2 becomes a translation-and-QA task, not a refactor.
- Quote and Invoice PDFs use the same message files, so bilingual PDFs (OQ-02) reuse them.
