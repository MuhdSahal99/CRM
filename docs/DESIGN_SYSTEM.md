# Design system

Status: **v1** (2026-10-27) · Tokens: `apps/web/app/globals.css` · Live reference: `/design` (light, dark, RTL)
Requirements: PRD G6/E11 · Decisions: [ADR-0016](adr/0016-i18n-rtl-mobile-first.md) (i18n, RTL, mobile), [ADR-0007](adr/0007-money-vat-currency.md) (money)

This is the contract every CRM screen builds on. Components come from shadcn/ui (Radix base, `radix-vega` style, initialised with `--rtl`), so they use logical classes. Patterns live in `apps/web/components/patterns/`.

## Principles

1. **Dense, calm, flat.** Reps scan tables and money all day. Use borders before shadows, a single accent color, and 150–200 ms motion only where it explains a change.
2. **Every number is the server's number.** The UI formats decimal strings it receives. It never computes totals (CLAUDE.md, ADR-0007).
3. **Phone first.** Everything works at 360 px with no page-level horizontal scroll, and screens widen at `sm` 640, `md` 768, `lg` 1024 and `xl` 1280.
4. **Text is translatable and direction-neutral.** There are no literal strings and no left/right, so Arabic in Phase 2 is a translation job, not a refactor.
5. **Never color alone.** Status, stage and chart series always carry a label or icon as well.

## Color

All colors are semantic CSS variables (OKLCH) defined in `:root` and `.dark`, and exposed to Tailwind via `@theme inline` (`bg-primary`, `text-muted-foreground`, …). Raw hex or Tailwind palette classes (`bg-blue-600`) are not used in components.

| Token pair | Use | Light | Dark | Contrast L / D |
|---|---|---|---|---|
| `background` / `foreground` | Page | slate-50 / slate-900 | slate-950 / slate-50 | 17.05 / 19.27 |
| `card` / `card-foreground` | Surfaces, tables, popovers | white / slate-900 | slate-900 / slate-50 | 17.84 / 17.05 |
| `primary` / `primary-foreground` | Primary actions, links, selection | blue-800 `#1E40AF` / white | blue-400 / slate-950 | 8.84 / 7.65 |
| `muted` / `muted-foreground` | Secondary text, column backgrounds | slate-100 / slate-600 | slate-800 / slate-400 | 6.90 / 5.58 |
| `accent` / `accent-foreground` | Hover and selected rows, menu highlight | blue-100 / blue-900 | blue-950 / blue-100 | 8.53 / 12.07 |
| `highlight` / `highlight-foreground` | Rare emphasis fills (amber). Never text on its own | amber-500 / slate-900 | amber-500 / slate-950 | 8.32 / 9.40 |
| `destructive` | Errors, delete, Closed Lost (text on card) | red-700 | red-400 | 6.42 / 6.17 |
| `success` | Paid, Closed Won (text on card) | green-700 | green-400 | 4.94 / 10.05 |
| `warning` | Overdue, needs review (text on card) | amber-700 | amber-400 | 5.05 / 10.39 |
| `info` | Issued, informational (text on card) | sky-700 | sky-400 | 5.85 / 8.17 |
| `input` | Form-control boundary (WCAG 1.4.11) | slate ≈450 | slate-500 | 3.64 / 3.74 vs card |
| `ring` | Focus indicator | blue-600 | blue-400 | 5.26 / 6.77 vs card |
| `border` | Decorative dividers only, never the only boundary of a control | slate-200 | white 10% | — |

Contrast was computed from the OKLCH values (WCAG 2 relative luminance). Re-measure any pair you change; `/design` shows the current values.

**Status color rule.** Status badges are `variant="outline"` with `border-<status>/40 text-<status>` plus an icon. Avoid tinted fills (`bg-success/10`): they pull small text below 4.5:1 in light mode.

## Typography

- **Family.** IBM Plex Sans (Latin) and IBM Plex Sans Arabic, loaded by `next/font/google` and self-hosted at build time, so the browser never makes a request to Google. Stack: `--font-latin, --font-arabic, ui-sans-serif, system-ui`. Arabic glyphs fall through to Plex Arabic via `unicode-range`. The Arabic face is not preloaded while the UI is English-only.
- **Scale (Tailwind defaults).** `text-xs` 12/16 (meta, badges, captions) · `text-sm` 14/20 (**body default**, tables, forms) · `text-base` 16/24 (key totals) · `text-lg` 18/28 (section titles) · `text-xl` 20/28 · `text-2xl` 24/32 (page titles, hero figures) · `text-3xl` 30/36.
- **Weights.** 400 body, 500 labels and table headers, 600 titles and grand totals. Never below 12 px.
- **Figures.** `tabular-nums` wherever numbers align vertically: table cells, totals, axis ticks. Hero numbers may use proportional figures.
- **Inputs on iOS.** Inputs render at 16 px on phones (shadcn `text-base md:text-sm`) to prevent zoom on focus. Keep that.

## Spacing, radius, elevation

- **Spacing.** A 4 px grid (Tailwind spacing). Dense defaults: table cells `p-2`, cards `p-3`/`p-4`, form field gap `gap-1.5`, between fields `gap-5`, between sections `py-8`. The page gutter is `px-4` (16 px) at all widths, and content is capped at `max-w-6xl`.
- **Radius.** `--radius: 0.375rem` (6 px). Tokens `rounded-sm` … `rounded-4xl` derive from it. Use `rounded-md` for controls, `rounded-lg` for cards and columns, and `rounded-4xl` for badges.
- **Elevation.** Flat by default. `shadow-xs` on kanban cards and outline buttons, `shadow-md` on popovers and menus, `shadow-lg` on dialogs. Dark mode relies on surface steps (`background` → `card` → `muted`) more than on shadows.

## States

Every interactive component shows these states (see `/design § Buttons`, `§ Form controls`):

| State | Treatment |
|---|---|
| Rest | Token colors as above |
| Hover | Darken or tint one step (`bg-primary/80`, `bg-muted`). Desktop only, never the only cue |
| Focus-visible | **2 px `--ring` outline, 2 px offset**, global and unlayered in `globals.css`, so no component can remove it |
| Active | `translate-y-px` press on buttons |
| Disabled | `opacity-50`, `pointer-events-none`. Exempt from contrast, but explain why nearby when it isn't obvious (e.g. WhatsApp disabled, no mobile) |
| Loading | Disabled + `aria-busy` + spinner + verb ("Saving…"); lists use skeleton rows |
| Invalid | `aria-invalid` (red border + ring) + message under the field linked by `aria-describedby`, with an icon. Never color alone |
| Read-only | `readOnly` + `bg-muted`; still focusable and copyable |
| Selected | `aria-pressed` / `aria-selected` / `data-state=checked` with `bg-secondary` or `bg-accent` |

## Touch and pointer

- **Targets.** Under `@media (pointer: coarse)`, buttons, inputs, select triggers and tabs get `min-block-size: 44px`, and icon buttons `min-inline-size: 44px`. Desktop keeps 32–36 px for density. WCAG 2.5.8 (24 px minimum) holds everywhere.
- **No hover-only UI.** Row actions are always visible (a ⋯ menu), never revealed only on hover.

## Money and numbers

Implemented by `formatMoney(value, currency, locale)` in `apps/web/lib/format.ts` and the `<Money>` component.

| Rule | Detail |
|---|---|
| Input is a string | The API sends decimals as strings (ADR-0007). `Intl.NumberFormat.format(string)` keeps them exact. **Never `Number()` a money value for display.** Charts may convert to numbers for plotting only |
| Scale per currency | OMR 3 dp, AED 2 dp, INR 2 dp (`CURRENCY_SCALE`), always padded: `OMR 358.190`, `AED 38,500.00` |
| ISO code, not symbol | `currencyDisplay: "code"`. It is unambiguous across OMR/AED/INR and has no RTL symbol problems |
| Negative | Leading minus: `-OMR 0.190`. No parentheses, no red-only signal |
| Latin digits | `numberingSystem: "latn"` in every locale, including Arabic (invoices and VAT numbers use Latin digits) |
| Grouping | From the UI locale, not the currency (INR shows `1,250,000.00` in `en`, not lakh grouping) |
| Alignment | End-aligned (`text-end`) in tables and totals, with `tabular-nums` |
| Bidi | `<Money>` renders `<bdi>`, so the amount stays `OMR 1,234.500` inside RTL text. Put alignment on the **parent**: the `bdi` itself resolves to LTR |
| OMR equivalent | Non-OMR documents also show the OMR VAT (and OMR totals where the PRD requires) as a secondary line |
| Rates | Exchange rates show all 8 dp as stored (`0.10500000`); VAT rates show without trailing zeros (`5%`) |
| Quantities | Up to 3 dp, trimmed (`2`, `1.5`, `0.125`), via next-intl `format.number` |
| Dates | next-intl `format.dateTime`, `dateStyle: "medium"` in tables. Business dates are interpreted in `Asia/Muscat` (set in `i18n/request.ts`) |

## Patterns

### Data table (`patterns/data-table.tsx`)

- **Layout.** From `md` up it is a semantic `<table>` with `scope="col"` headers and an `sr-only` caption. Below `md` it becomes a **card list**: the first column is the card title, and the rest is a `<dl>` of label and value (ADR-0016).
- **Numeric columns.** Set `numeric: true` for `text-end tabular-nums`. Text columns are start-aligned.
- **States.** `ready`, `loading` (4 skeleton rows, `aria-busy`), `empty` (dashed box with a sentence that says what to do), and `error` (`role="alert"` with a retry action).
- **Horizontal overflow.** Wide tables scroll inside their own container, never the page.
- **Sticky headers.** These need a vertically scrolling list container, so they come with the app shell.
- **Rows.** Rows open records through a link in the title cell, not by clicking the whole row, so keyboard and screen-reader users get a real link. Bulk selection, when added, uses a checkbox column with `aria-label` per row.
- **Pagination.** Server-side (`per_page ≤ 200`, TRD), with "Load more" on phones and pages on desktop.

### Pipeline Kanban (`patterns/kanban.tsx`)

- **Columns.** One per stage. The header shows the stage name, a count badge and **Σ OMR** (from the server, PRD US-07).
- **Scrolling.** The board scrolls horizontally **inside itself** (`overflow-x-auto`, `snap-x`). On phones each column is 85% wide so the next one peeks in. The board is a focusable `role="region"` with a label, so keyboard users can scroll it.
- **Move to stage.** Every card has a **Move to stage** menu (radio items). This is the required single-pointer, keyboard and screen-reader alternative to dragging (WCAG 2.5.7). Drag-and-drop may be added on top later; it is never the only way.
- **After a move.** The client calls the API and then refetches counts and totals. Stage rules (e.g. Closed Lost needs a reason) open a dialog before the move is saved.

### Forms

- **Labels.** A visible `<Label htmlFor>` above every field. Placeholders are examples, never labels.
- **Required.** Mark required fields with `*` (`aria-hidden`) plus `sr-only` "Required", and set `required` on the input.
- **Help and errors.** Help text and errors sit under the field and are linked with `aria-describedby`. Validate on blur and submit, never on every keystroke. Server (Zod) errors map to the same slots per field (422 response, TRD).
- **Grid.** One column on phones, then `sm:grid-cols-2`, `lg:grid-cols-3`. Long text (`Textarea`) spans the full row.
- **Phone numbers.** `type="tel"`, `inputMode="tel"`, `dir="ltr"`. Stored as E.164 (US-06).
- **Numbers and money inputs.** `inputMode="decimal"`, `text-end tabular-nums`, no `type="number"` (spinners and locale bugs).
- **Choices.** `Select` for ≥ 5 choices, `RadioGroup` for 2–4 visible choices (e.g. VAT category), `Switch` for settings that apply at once, `Checkbox` for form booleans. Group related controls in `<fieldset><legend>`.

### Line-item grid (`patterns/line-item-grid.tsx`)

- **Layout.** One DOM for every width: a **stacked card per line** below `lg`, and a single row per line from `lg` up, with a header row. Field labels are visible when stacked and `sr-only` in row mode, so every input always has a label.
- **Columns.** Product (with a VAT category badge), Qty, List price, Discount %, VAT (amount + category), Line total, Remove.
- **Editable fields.** Only quantity, price, discount and adjustment are editable. VAT, line total and every header total are read-only `<Money>` values from the server pricing engine, refreshed after each save.
- **Totals block.** End-aligned `<dl>`: Sub Total (Σ net), a VAT summary row per category (base + VAT, "No VAT" for exempt), Total VAT, Adjustment (input, no VAT, OQ-04), and **Grand Total** (600 weight, `text-base`). Non-OMR documents add "VAT in OMR".
- **Errors.** Errors attach to the field (e.g. quantity ≤ 0, US-10) and span the line.

### Charts (`patterns/charts.tsx`)

- **Library.** shadcn `chart` (Recharts 3). Every chart is a `<figure>` with a `figcaption` title and a **Show data** `<details>` table, so the data is never color-only.
- **Categorical palette.** 8 slots, `--chart-1` … `--chart-8`, **used in fixed order and never cycled**. A 9th category folds into "Other". This is the validated dataviz reference palette, re-validated on our surfaces (white card and slate-900 card):
  - Light: worst adjacent CVD ΔE 9.1 and normal-vision ΔE 19.6, all passing. Slots 3, 4 and 5 are below 3:1 on white, so the relief rule applies (direct labels or the data table, both always present).
  - Dark: all 8 slots are ≥ 3:1, with worst adjacent CVD ΔE 8.4.
  - Scatter and other all-pairs charts: use only the first 3 slots.
- **Ordinal ramp.** `--ordinal-1` … `--ordinal-5` (one blue hue, monotone lightness) for funnels and ordered stages. Validated in both modes.
- **Status colors.** `success`, `warning` and `destructive` are never used as series colors.
- **Funnel.** Ordinal fills with a 2 px surface gap, and a direct label per stage ("Qualified: 120").
- **Donut.** Categorical fills, a 2 px surface ring, a center total, and an HTML legend below the chart (legends always present for ≥ 2 series).
- **Gauge.** A single series (`chart-1`) on a muted track, with the value as large text. It is a headline: no legend, no tooltip.
- **Line and bar (later).** 2 px lines, rounded data ends, one y-axis only (never dual-axis), a crosshair tooltip, and recessive grid lines.
- **Motion.** Chart animation is off (`isAnimationActive={false}`).
- **RTL.** Charts render with `dir="ltr"` geometry, the norm for Arabic business charts. Text inside them still shapes correctly.

### Overlays and feedback

- **Dialog.** For decisions that block (e.g. reason for loss). It has a title, a description, the primary action at the end and Cancel before it. Focus is trapped and returns to the trigger. The close label is translated.
- **Dropdown menu.** Record actions behind a ⋯ or labelled button; destructive items last, after a separator, with `variant="destructive"`.
- **Tooltip.** Supplementary only (e.g. the stored exchange rate). Never put essential information or actions in a tooltip; on touch screens it must also be reachable another way.
- **Toast (sonner).** Confirms async results ("Quote emailed"). Errors that need action stay inline or in a dialog, not only in a toast.
- **Skeleton.** `bg-foreground/10` pulse with the shape of the content; reduced motion stops the pulse.

## RTL and i18n

- **Strings.**
  - Every user-facing string comes from `apps/web/messages/en.json` via next-intl (`getTranslations` in server components, `useTranslations` in client components).
  - shadcn components that ship English (e.g. the Dialog close label) were changed to read `common.*`.
- **Lint (`pnpm check`).**
  - `i18next/no-literal-string` (jsx-only) fails on literal JSX text and literal `aria-label`, `title`, `placeholder`, `alt` and `label` values.
  - A `no-restricted-syntax` rule fails on physical classes (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `border-l/r`, `rounded-l/r…`, `text-left/right`, `float-left/right`) in `className` strings and `cn()`/`cva()` arguments.
  - Classes built in template literals are not checked, so keep them logical by review.
- **Logical CSS only.** Use `ms-/me-/ps-/pe-/start-/end-/text-start/text-end/border-s/border-e/rounded-s/rounded-e`. Physical utilities appear only for animation sides that Radix positions (`data-[side=left]:…`), which carry explicit `rtl:` counterparts.
- **Document direction.** `<html lang dir>` comes from the locale (`app/layout.tsx`). A subtree preview uses `dir="rtl"` plus the Radix `DirectionProvider`.
- **Icons.**
  - **Mirror** icons that point in a reading direction, with `rtl:rotate-180`: chevrons, arrows, "back" and "next", and send.
  - **Do not mirror** icons that depict real objects or time: clock, checkmark, plus, trash, phone, download, play.
- **Numbers.** Money, dates and phone numbers stay LTR inside RTL text (`<bdi>`, `dir="ltr"` on tel inputs). Latin digits throughout.
- **Phase 2 (Arabic UI).** Add `messages/ar.json` and locale negotiation in `i18n/request.ts`. There are no component changes.

## Accessibility (WCAG 2.2 AA)

| Criterion | How we meet it |
|---|---|
| 1.3.1 Info and relationships | Semantic tables (`scope`, caption), `<dl>` for label/value, `<fieldset>/<legend>`, labelled regions |
| 1.4.3 / 1.4.11 Contrast | Token pairs above: text ≥ 4.5:1, control borders and focus ring ≥ 3:1, in both themes |
| 1.4.1 Use of color | Status and stage badges have text and icons; charts have labels and a data table; errors have an icon and text |
| 1.4.10 Reflow | 360 px with no page-level horizontal scroll, asserted by Playwright at 360, 768 and 1440 |
| 2.1.1 Keyboard | All controls are native elements or Radix primitives; the kanban board is focusable; there is no hover-only UI |
| 2.4.7 / 2.4.11 Focus visible, not obscured | Global 2 px ring with offset; sticky elements (later) reserve `scroll-padding` |
| 2.5.7 Dragging movements | Kanban "Move to stage" menu |
| 2.5.8 Target size | ≥ 24 px everywhere, 44 px on coarse pointers |
| 3.3.1 / 3.3.3 Error identification and suggestion | Error text per field, linked with `aria-describedby`, saying how to fix it |
| 4.1.2 Name, role, value | Icon-only buttons have translated `aria-label`; toggles use `aria-pressed` |
| 2.3.3 Motion | `prefers-reduced-motion` reduces all animation and transition durations to ~0 |

### Keyboard map

| Where | Keys |
|---|---|
| Page | `Tab` / `Shift+Tab` through controls in DOM order (which follows visual order in both directions) |
| Menus, select | `Enter`/`Space` opens; arrows move; `Esc` closes and returns focus |
| Dialog | Focus trapped; `Esc` closes; focus returns to the trigger |
| Tabs | Arrow keys move between tabs (Radix; arrows follow `dir`) |
| Kanban | `Tab` to a card's ⋯ → `Enter` → arrows to the stage → `Enter` moves the card |
| Table | `Tab` reaches the record link and row actions; there is no custom grid navigation in the MVP |

## Using the system

- **Building screens.** Compose shadcn components and the patterns, and add new shadcn components with `pnpm dlx shadcn@4.22.1 add <name>` from `apps/web`. Then check the added file for English literals (the lint will flag them) and physical classes.
- **Changing a token.** Change it in `globals.css` (both `:root` and `.dark`), re-measure contrast, update the table above, and check `/design` in both themes.
- **Adding a chart palette or slot.** Run the dataviz validator (`validate_palette.js`) against both surfaces before you ship it.
