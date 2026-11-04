# ADR-0018: Glass visual language

## Status
Accepted. Replaces the flat v1 look in docs/DESIGN_SYSTEM.md. ADR-0016 (i18n, RTL, mobile-first) still holds.

## Date
2026-11-04

## Context
The v1 UI was stock shadcn: flat slate surfaces and a blue primary. The owner supplied a glass design spec (docs/design/GLASS_SPEC.md) and reference screens. The change had to be visual only: no behaviour, API, data or permission changes.

## Decision
- **Frosted surfaces on one photo plus a wash**, in light and dark themes, driven by CSS variables in `globals.css` (`glass`, `glass-2`, `glass-tile`, `well`, `float`, lime `accent`). `data-theme` on any element re-maps them, which also powers the RTL/theme previews on `/design`.
- **Tokens only.** Colours, radii (`rounded-card/tile/well/dock`), durations (`--dur-fast/--dur/--dur-slow`) and easing live in `globals.css`; tweens live in `lib/motion.ts` and go through `d()` so reduced motion zeroes them. Components use no raw hex, `px` radii, literal ms, or physical left/right utilities (lint-enforced for the last).
- **Shell:** top bar with pill tabs plus a start-side dock, and a ⌘K command palette over existing search endpoints. Only real features get buttons.
- **Contrast is measured, not assumed.** `lib/glass-contrast.test.ts` composites each text colour over every surface, the wash and a worst-case photo (#1f1f1f / #e0e0e0) and fails under 4.5:1. Glass opacity and a few text tokens were raised to pass; numbers are in docs/DESIGN_SYSTEM.md.
- **Motion:** GSAP for choreography, CSS transitions for hover/focus state changes.

## Alternatives considered
- **Lower-opacity glass as drawn in the spec.** Rejected: failed 4.5:1 on faint text and wells.
- **Keep the 8-slot chart palette.** Rejected: the glass palette is four semantic colours; more series fold into "Other".

## Consequences
- Contrast must be re-measured when `public/bg/dusk.webp` replaces the placeholder gradient.
- Dark-only or light-only tweaks to a token must update both theme blocks and the contrast test passes before merge.
- Recharts attribute selectors in `ui/chart.tsx` and the standalone `lib/share-response.ts` page keep literal colours by design.
