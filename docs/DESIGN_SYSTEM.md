# Design system

Status: **v2, glass** (ADR-0018) · Tokens: `apps/web/app/globals.css` · Live reference: `/design` (light, dark, RTL)
Requirements: PRD G6/E11 · Decisions: [ADR-0018](adr/0018-glass-visual-language.md) (glass), [ADR-0016](adr/0016-i18n-rtl-mobile-first.md) (i18n, RTL, mobile), [ADR-0007](adr/0007-money-vat-currency.md) (money)

This is the contract every CRM screen builds on. Components come from shadcn/ui (Radix base, initialised with `--rtl`) restyled to the glass spec ([GLASS_SPEC](design/GLASS_SPEC.md)), so they use logical classes. Patterns live in `apps/web/components/patterns/`.

## Principles

1. **Dense, calm, glass.** Reps scan tables and money all day. Frosted surfaces sit on one photo and wash, one lime accent marks the primary action, and motion (GSAP, `lib/motion.ts`, or the `--dur*` tokens) only explains a change.
2. **Every number is the server's number.** The UI formats decimal strings it receives. It never computes totals (CLAUDE.md, ADR-0007).
3. **Phone first.** Everything works at 360 px with no page-level horizontal scroll, and screens widen at `sm` 640, `md` 768, `lg` 1024 and `xl` 1280.
4. **Text is translatable and direction-neutral.** There are no literal strings and no left/right, so Arabic in Phase 2 is a translation job, not a refactor.
5. **Never color alone.** Status, stage and chart series always carry a label or icon as well.

## Color

Colours are semantic CSS variables in `globals.css`: hex values in `:root`/`[data-theme="light"]` and `[data-theme="dark"]`, exposed to Tailwind via `@theme inline` (`bg-glass`, `text-muted`, `bg-accent`, …). `data-theme` on any element re-maps the tokens for that subtree. Components never use raw hex or Tailwind palette classes; the only literals outside `globals.css` and `lib/motion.ts` are the recharts attribute selectors in `ui/chart.tsx` and the standalone expired-link page in `lib/share-response.ts`.

- **Text:** `text`, `muted`, `faint` (captions). **Surfaces:** `glass`, `glass-2`, `glass-3`, `glass-tile`, `well`, `solid`, `float` (popovers). **Lines:** `line`, `line-2`, `rim`.
- **Accent:** lime `accent` with `on-accent` text, used for the primary CTA. **Semantic:** `sky`, `lime`, `coral`, `ink`; `good` and `bad` for text; `pill`/`on-pill` for tooltips and toasts.
- **Charts:** `chart-1` … `chart-4` (sky, lime, coral, ink). Series always carry a label or the Show data table.

Measured contrast is in [Glass kit and measured contrast](#glass-kit-and-measured-contrast) below and is enforced by `lib/glass-contrast.test.ts` (4.5:1 for text).

**Status colour rule.** Status is a `StatusPill` with a dot or icon and a label, never colour alone.

## Typography

- **Family.** IBM Plex Sans (Latin) and IBM Plex Sans Arabic, loaded by `next/font/google` and self-hosted at build time, so the browser never makes a request to Google. Stack: `--font-latin, --font-arabic, ui-sans-serif, system-ui`. Arabic glyphs fall through to Plex Arabic via `unicode-range`. The Arabic face is not preloaded while the UI is English-only.
- **Scale (Tailwind defaults).** `text-xs` 12/16 (meta, badges, captions) · `text-sm` 14/20 (**body default**, tables, forms) · `text-base` 16/24 (key totals) · `text-lg` 18/28 (section titles) · `text-xl` 20/28 · `text-2xl` 24/32 (page titles, hero figures) · `text-3xl` 30/36.
- **Weights.** 400 body, 500 labels and table headers, 600 titles and grand totals. Never below 12 px.
- **Figures.** `tabular-nums` wherever numbers align vertically: table cells, totals, axis ticks. Hero numbers may use proportional figures.
- **Inputs on iOS.** Inputs render at 16 px on phones (shadcn `text-base md:text-sm`) to prevent zoom on focus. Keep that.

## Spacing, radius, elevation, motion

- **Spacing.** `--gap` 16 px, `--pad` 20 px, page gutter `--gutter` (clamp 16–28 px), content capped at `--app-max` 1840 px. Controls are `--ctl-h` 40 px (`--ctl-h-sm` 32 px, `--icon-btn` 34 px).
- **Radius tokens.** `rounded-card` 22 px, `rounded-tile` 18 px, `rounded-well` 14 px, `rounded-dock` 30 px, `rounded-full` (`--r-ctl`) for controls. `rounded-sm … rounded-4xl` still derive from `--radius` (0.75 rem). No `rounded-[Npx]`.
- **Elevation.** Glass is blur (`--blur-glass`) + `--rim` highlight + `--shadow`; popovers use `shadow-pop`. Dark mode leans on surface steps more than on shadow.
- **Motion.** Transitions use `duration-(--dur-fast|--dur|--dur-slow)` (100/200/300 ms) and `ease-glass`. Tweens go through `d()` in `lib/motion.ts`, which is 0 under `prefers-reduced-motion`. No literal ms or seconds in components (toast time is `TOAST_MS`).

## States

Every interactive component shows these states (see `/design § Buttons`, `§ Form controls`):

| State | Treatment |
|---|---|
| Rest | Token colours as above |
| Hover | Tint one step (`bg-accent`, `border-line-2`). Desktop only, never the only cue |
| Focus-visible | **2 px `--ring` outline, 2 px offset**, global and unlayered in `globals.css`, so no component can remove it |
| Active | `translate-y-px` press on buttons |
| Disabled | `opacity-50`, `pointer-events-none`. Exempt from contrast, but explain why nearby when it isn't obvious (e.g. WhatsApp disabled, no mobile) |
| Loading | Disabled + `aria-busy` + spinner + verb ("Saving…"); lists use skeleton rows |
| Invalid | `aria-invalid` (red border + ring) + message under the field linked by `aria-describedby`, with an icon. Never color alone |
| Read-only | `readOnly` + `bg-well`; still focusable and copyable |
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

## Glass kit and measured contrast

The glass primitives (`components/ui`: `glass-card` (GlassCard, HeroNumber, Tile, Well), `icon-button`, `segmented`, `filter-chip`, `search-input`, `field`, `avatar`, `status` (StatusPill, DeltaBadge, StatChip), `progress` (ProgressBar, ProgressRing, ProportionBar), `empty-state`, plus the restyled Button, Input, Select, Textarea, Checkbox, Switch, RadioGroup, Badge and Skeleton) are shown on `/design` in the "Glass kit" section: dark, light and an RTL preview, each on its own backdrop and wash (`.kit-stage`; `data-theme` on any element re-maps the tokens).

**Method.** Text colour against each surface composited over the wash and a worst-case photo: the photo is taken as dark as #1f1f1f or as bright as #e0e0e0 (the real photo lies between; re-measure when `public/bg/dusk.webp` lands). Blur is ignored. `lib/glass-contrast.test.ts` recomputes these from `globals.css` and fails under 4.5:1.

Glass opacity was raised from the first spec values where they failed: light `--glass`/`--glass-tile` 50% to 65%, dark `--glass` 46% to 72%, dark `--glass-tile` 52% to 72%. Text tokens: light `--faint` #575e59 to #4f5651, `--good` #3c7a14 to #2d5f0e, `--bad` #b8401f to #9a3414; dark `--muted` #c2c7c1 to #d0d4cf, `--faint` #9ca29c to #b9beb8, `--bad` #ff9a7c to #ffb199.

Worst case per theme and surface (ratio, minimum of the two photo extremes; "+well" is a Well on that surface):

| Pair | Light | Dark |
|---|---|---|
| text on glass | 13.83 | 11.81 |
| muted on glass | 6.16 | 8.72 |
| faint on glass | 5.79 | 6.92 |
| text / muted / faint on glass-2 | 16.18 / 7.21 / 6.78 | 9.25 / 6.82 / 5.42 |
| text / muted / faint on tile | 13.83 / 6.16 / 5.79 | 11.57 / 8.54 / 6.78 |
| text / muted / faint on glass+well | 12.32 / 5.49 / 5.16 | 9.48 / 7.00 / 5.56 |
| good / bad on glass | 5.85 / 5.60 | 9.03 / 7.47 |
| good / bad on glass+well | 5.21 / 4.99 | 7.25 / 6.00 |
| text / muted / faint / good / bad on float | 17.16 / 7.64 / 7.19 / 7.26 / 6.95 | 14.21 / 10.49 / 8.33 / 10.87 / 8.99 |
| on-pill on pill | 16.75 | 7.96 |
| on-accent on accent (lime) | 13.57 | 13.57 |

DeltaBadge, Badge `alert` and the lime CTA put `--on-accent` (#13171a, in both themes) on sky, coral or lime fills; semantic colours are never the only signal (label or dot beside them).

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

### Screens (module lists, record pages, deals, documents, activities, settings)

- Every page opens with `PageHeader`: a two-line title (two message keys, or the module label plus a second word; headings keep the module name so they stay findable), up to three `StatChip`s and the actions at the inline end, the primary one in lime. Chips show only what the page already loads: a list shows its own page ("On this page", "Added in 7 days"), a record shows its own fields, the board and Home show the server's kanban counts and sums.
- Bodies are a 12-column grid of `GlassCard`s (record pages 8 + 4, rate pages 4 + 8, activities 8 + 4) that collapses to one column below `xl`, wrapped in `MotionScope` for the enter, pop and count-up motion.
- Lists (`RecordList`): search pill over the loaded rows and, for Leads, Accounts and Contacts, a Table / Grid toggle (grid = `RecordCard`). `DataTable` supplies the empty state; `app/(app)/app/loading.tsx` and `[module]/[id]/loading.tsx` the skeletons; `app/(app)/app/error.tsx` the error state with a retry.
- Native `<select>`s that tests and browsers rely on use `NativeSelect` (form-field skin). Settings → Organisation uses `SettingsLayout` + `ProfileCard` (completeness = filled fields of the settings it loads) and an Appearance card (dark, light, system) for the theme.

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
- **Categorical palette.** 4 slots, `--chart-1` … `--chart-4` (sky, lime, coral, ink), **used in fixed order and never cycled**. A 5th category folds into "Other". Light slots are below 3:1 on glass, so the relief rule applies (direct labels or the data table, both always present).
- **Ordinal stages.** Funnels and stage mixes use the same four tokens in pipeline order, with a label per stage.
- **Status colours.** `good` and `bad` are text colours, never series colours.
- **Funnel.** Ordinal fills with a 2 px gap, and a direct label per stage ("Qualified: 120").
- **Donut.** Categorical fills, a 2 px ring, a center total, and an HTML legend below the chart (legends always present for ≥ 2 series).
- **Gauge.** A single series (`chart-1`) on a `well` track, with the value as large text. It is a headline: no legend, no tooltip.
- **Line and bar (later).** 2 px lines, rounded data ends, one y-axis only (never dual-axis), a crosshair tooltip, and recessive grid lines.
- **Motion.** Chart animation is off (`isAnimationActive={false}`).
- **RTL.** Charts render with `dir="ltr"` geometry, the norm for Arabic business charts. Text inside them still shapes correctly.

### Overlays and feedback

- **Dialog.** For decisions that block (e.g. reason for loss). It has a title, a description, the primary action at the end and Cancel before it. Focus is trapped and returns to the trigger. The close label is translated.
- **Dropdown menu.** Record actions behind a ⋯ or labelled button; destructive items last, after a separator, with `variant="destructive"`.
- **Tooltip.** Supplementary only (e.g. the stored exchange rate). Never put essential information or actions in a tooltip; on touch screens it must also be reachable another way.
- **Toast (sonner).** Confirms async results ("Quote emailed"). Errors that need action stay inline or in a dialog, not only in a toast.
- **Skeleton.** glass-toned pulse with the shape of the content; reduced motion stops the pulse.

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
| 1.4.3 / 1.4.11 Contrast | Measured pairs in the glass table: text ≥ 4.5:1, control borders and focus ring ≥ 3:1, in both themes |
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
- **Changing a token.** Change it in `globals.css` (both `:root` and `[data-theme="dark"]`), re-measure contrast, update the table above, and check `/design` in both themes.
- **Adding a chart slot.** Add the token to both themes, re-run `glass-contrast.test.ts`, and keep a label or data table beside it.
