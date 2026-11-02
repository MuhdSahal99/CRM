# Glass design system: Saqient CRM

Sections 1 to 12 are the visual spec, unchanged. Section 13 adapts it to this repo and wins wherever the two disagree. Read only the section you need.

════════════════════════════════════════
1. DESIGN PERSONALITY
════════════════════════════════════════
- Premium, calm, "frosted glass over a dusk photo". Soft, rounded, airy, and dense with data without feeling cluttered.
- Every surface is translucent glass floating over a blurred full-screen photo.
- Pills and circles everywhere: buttons, tabs, chips, inputs and badges are fully rounded; cards have large radii.
- Big light headings, big confident numbers, small muted labels. Hierarchy comes from size and colour, not heavy weight.
- A 4-colour semantic palette (sky, lime, coral, ink/cream) carries all meaning: statuses, stages, chart series and categories. A colour always means the same thing across the app.
- One bright accent (lime) is used only for the primary action and positive emphasis.
- Motion is springy, quick and purposeful. Nothing moves without a reason.
- Dark theme is the default; the light theme is equally polished. Same layout, only the tokens swap.

════════════════════════════════════════
2. TYPOGRAPHY
════════════════════════════════════════
- Font: "Urbanist" (Google Fonts), weights 400/500/600/700; fallback ui-sans-serif, system-ui.
- All numbers: font-variant-numeric: tabular-nums.
- Scale (desktop 1440–1600px):
  • Page title: 40–44px, weight 500, line-height 1.0, letter-spacing -0.02em, always split onto TWO lines (e.g. "Deal / Pipeline").
  • Card hero number: 36–40px, weight 600, letter-spacing -0.02em.
  • KPI stat value: 20–22px, weight 600.
  • Card title: 15px, weight 500.
  • Item title (inside tiles): 16–17px, weight 500.
  • Body / table text: 13–14px, weight 400–500.
  • Meta / labels / captions: 11–12px, colour var(--muted) or var(--faint).
  • Section eyebrow (e.g. in menus): 11px, uppercase, letter-spacing 0.08em, var(--faint).
- Never use bold paragraphs. Max text line width is about 65ch.

════════════════════════════════════════
3. DESIGN TOKENS (CSS variables — the single source of truth)
════════════════════════════════════════
:root {                               /* LIGHT THEME */
  --font: "Urbanist", ui-sans-serif, system-ui, sans-serif;
  --bg:#e9ece7;  --text:#13171a;  --muted:#4b524e;  --faint:#575e59;
  --glass:#ffffff80;   --glass-2:#ffffff94;  --glass-3:#ffffffdb;  --glass-tile:#ffffff80;
  --solid:#f4f6f2;     --float:#f8faf6;      --well:#1216140f;
  --line:#1216141a;    --line-2:#1216142e;   --rim:#ffffffb8;
  --sky:#5aa6ec;  --lime:#a9d636;  --coral:#f27d5f;  --ink:#13171a;  --cream:#f6f7f3;
  --accent:#c4ef4f;  --on-accent:#13171a;
  --good:#3c7a14;  --bad:#b8401f;
  --pill:#13171a;  --on-pill:#f6f7f3;          /* active tab / selected pill */
  --wash: linear-gradient(180deg,#f0f3eea8,#f0f3ee99 45%,#ecefe9b3);
  --blur: blur(22px) saturate(150%);
  --shadow: inset 0 1px 0 #fffc, 0 24px 50px -32px #141e1466;
  --shadow-pop: 0 24px 60px -18px #0f191459, 0 2px 6px #0f191414;
  --r-card:22px; --r-tile:18px; --r-well:14px; --r-ctl:999px;
  --gap:16px; --pad:20px; --gutter:clamp(16px,1.6vw,28px);
  --app-max:1840px; --dock-w:60px; --topbar-h:64px;
  --ctl-h:40px; --ctl-h-sm:32px; --icon-btn:34px;
  --ease: cubic-bezier(.2,.8,.2,1);
}
[data-theme="dark"] {                 /* DARK THEME (default) */
  --bg:#111513;  --text:#f2f4f0;  --muted:#c2c7c1;  --faint:#9ca29c;
  --glass:#14171775;   --glass-2:#ffffff14;  --glass-3:#1e2322;  --glass-tile:#16191985;
  --solid:#1a1e1d;     --float:#1f2423;      --well:#ffffff12;
  --line:#ffffff1a;    --line-2:#ffffff2e;   --rim:#ffffff26;
  --sky:#8cc4ff;  --lime:#cdf06a;  --coral:#ff9a7c;  --ink:#f2f4f0;  --cream:#f2f4f0;
  --good:#b8e65a;  --bad:#ff9a7c;
  --pill:#585e5dbd;  --on-pill:#f2f4f0;
  --wash: linear-gradient(180deg,#080b0a80,#080b0a6b 45%,#080b0a8c);
  --shadow: inset 0 1px 0 #ffffff1f, 0 30px 60px -30px #0009;
  --shadow-pop: 0 24px 60px -18px #000000b3, 0 0 0 1px #ffffff1a;
}
Semantic colour roles (map any domain onto these 4):
  sky   = early / new / info / category A
  lime  = active / positive / success / category B / accent
  coral = warning / late / hot / attention / category C
  ink-cream = final / neutral / closed / category D
Tints: for tinted tiles use the semantic colour at about 22% opacity in dark mode (color-mix(in srgb, var(--sky) 22%, var(--glass-tile))) and a solid pastel (about 55–70% mix with white) in light mode. Text on tinted tiles stays var(--text).

════════════════════════════════════════
4. BACKGROUND & GLASS MATERIAL
════════════════════════════════════════
- Body: a fixed full-viewport background photo (warm, low-contrast dusk/landscape, my own royalty-free image, WebP, object-fit: cover), with a fixed overlay of var(--wash) on top. Content scrolls over it.
- GLASS CARD recipe (the main surface):
  background: var(--glass); backdrop-filter: var(--blur); -webkit-backdrop-filter: var(--blur);
  border: 1px solid var(--line); border-radius: var(--r-card); box-shadow: var(--shadow); padding: var(--pad).
- TILE (a card inside a card): background var(--glass-tile); radius var(--r-tile); border 1px var(--line); padding 14–16px.
- WELL (inset info box inside tiles, e.g. two mini stats side by side): background var(--well); radius var(--r-well); no border; padding 10–12px.
- FLOATING layers (menus, popovers, palette, modal, drawer): background var(--float) at 92–96% opacity + var(--blur); box-shadow var(--shadow-pop); radius 18–22px.
- Fallback: if backdrop-filter isn't supported, use var(--solid).
- Hover on interactive cards: border var(--line-2); translateY(-2px); 200ms var(--ease).

════════════════════════════════════════
5. APP SHELL / LAYOUT
════════════════════════════════════════
- NO traditional sidebar. Structure:
  ┌ Top bar (sticky, transparent, height var(--topbar-h)) ─────────────────────────┐
  │ [brand mark: 32px rounded-square lime tile with an icon] brand name (20px/600) │
  │            ( Tab  Tab  Tab  Tab  Tab  Tab )  ← centred glass pill tab bar      │
  │                                   [icon btn] [bell + coral dot] [avatar 36px]  │
  └────────────────────────────────────────────────────────────────────────────────┘
  ┌──┐ Main content: max-width var(--app-max), centred, padding-inline var(--gutter),
  │  │ left padding leaves room for the dock.
  │  │  PAGE HEADER row:
  │  │   [Two-line big title]  [StatChip] [StatChip] [StatChip]   …right: [toggles][primary CTA]
  │  │  TOOLBAR row (optional): [search pill] [filter chips…]  …right: [view toggle][export][CTA]
  │  │  CONTENT: CSS grid, 12 columns, gap var(--gap); cards span 4/5/7/8/12 columns.
  └──┘
  ↑ LEFT DOCK: fixed, vertically centred, left 16–20px, width var(--dock-w), glass, radius 30px,
    padding 10px 0, a column of 40px round icon buttons (search, create, favourites, calendar/today,
    call, send, share, export) – a 1px divider – settings, theme toggle. Tooltip on hover to the right
    (small dark pill). The active item gets a var(--glass-2) circle + a tiny lime dot.
- PILL TAB BAR: glass container, radius 999px, padding 4px; tabs 36px high, padding 0 16px, 14px/500, var(--muted).
  Active state = a sliding "ink pill" (var(--pill)) behind the label, with the label in var(--on-pill).
  Implementation: an absolutely positioned layer holds a second copy of the tab labels in the active colour, clipped with clip-path: inset(...) to the pill's rect. Tween the pill's LEFT and RIGHT edges separately with GSAP (leading edge 0.36s power3.out, trailing edge 0.1s later), so the pill stretches toward the target and the text colour flips exactly at the pill's edge.
- PAGE HEADER STAT CHIP: [44px round glass icon circle with a 18px line icon] + stacked [value 20–22px/600 + optional delta badge] / [label 12px muted]. Gap 12px. 3 chips per page, separated by 32–48px.
- DELTA BADGE: a 20px-high pill, 11px/600; coral bg for negative ("−2% vs last month"), lime for positive, sky for neutral; dark text.

════════════════════════════════════════
6. COMPONENT LIBRARY (build all of them, typed, in /components/ui)
════════════════════════════════════════
- GlassCard: header row = title (15px/500) + optional subtitle (12px muted) on the left; on the right a tools slot with a Segmented toggle and round icon buttons (⋯ more, ↗ expand, + add). Hero number line: big number + an inline muted caption ("won in 12 months · 0 of 12 at target", with key numbers in var(--text)).
- IconButton: circle, 34px (sm 28px, lg 44px), transparent with a 1px var(--line-2) border, or var(--glass-2) fill; icon 16px, 1.6 stroke (lucide icons). Hover: fill var(--glass-2). Optional "magnetic" pull.
- Button primary: pill, var(--ctl-h) high, padding 0 18px, bg var(--accent), color var(--on-accent), 14px/600, leading "+" or other icon. Hover: brightness 1.05 + a soft lime glow. Secondary: glass-2 fill + line border. Ghost: transparent. Danger: coral text.
- Segmented control: a glass-2 pill track with a 3px inset; options 28–32px high, 12–13px/500; the active option has a sliding var(--pill) thumb (animated), with others in muted text. Used for ranges (3M/6M/12M), views (Board/List, Grid/Table) and units ($/%).
- FilterChip: a 32px pill with a 1px var(--line-2) border, 13px/500, optional 20px avatar on the left; selected = var(--pill) bg + var(--on-pill) text. Chip groups scroll horizontally on small screens. A thin vertical divider separates chip groups.
- Search input: pill, 40px, glass-2 fill, line border, 16px search icon at left 14px, placeholder in var(--faint); focus = 2px var(--accent) ring.
- Form fields: label 12px muted above; input/select/textarea with a 12px radius (inputs in forms are rounded rectangles, not pills), 42px high, glass-2 fill, line border; hint text 11px faint below; error text coral. Two-column grid in forms.
- Avatar: a circle (24/28/36/44/96px) with initials 600 weight on a pastel tint (rotate through sky/lime/coral/cream tints by hashing the name). AvatarStack: overlap -8px, 2px ring in the card background colour, max 3 + "+N".
- Badge / count pill: 18–20px high, 11px/600, var(--glass-2) bg; a coral version for alerts.
- Status pill: a 24px pill, glass-2 bg, a 6px colour dot + label 12px/500 (dot colour comes from the semantic role).
- ProgressBar: 4–6px high, radius 999, track var(--well), fill a semantic colour; optional value label at the right.
- ProgressRing: SVG, 56–160px, stroke 8–12px, round caps, track var(--well), fill a semantic colour, the arc starts at the top with a small gap, big % in the centre + a muted caption below.
- Segmented proportion bar: a row of rounded blocks (radius 10px, 40px high, 4px gap) whose widths equal the shares, each in its semantic colour, plus a legend table below (dot · name · count · value · %).
- Tile (item card): meta line at the top-left (12px muted, e.g. a date) + a ⋯ round button at the top-right; title 16–17px/500; subtitle 12–13px muted; spacer; footer with a big value (18–20px/600) + a small status caption on the left and an AvatarStack on the right. Optional semantic tint.
- Profile/entity card: a 44px avatar at the top-left + a star toggle at the top-right (a lime-filled circle when active); name 16px/600; role · company 12px muted; a WELL with 2 mini stats (label 11px muted / value 14px/600); a progress bar with the score at the right; footer: a segment pill on the left + round mail/call buttons on the right.
- DataTable: no outer border, a header row 12px muted with sort chevrons, rows 52–56px with a 1px var(--line) divider, row hover var(--well), an avatar + two-line cell pattern (name / sub), amounts right-aligned and tabular, a status pill, and a ⋯ row menu. Above it: status tabs as a Segmented control + a count caption ("40 items · $998,510") + search on the right.
- Kanban board: columns are glass cards (radius 22, 270–300px wide); the header has a 10px dot in the stage colour, the name 14px/600, a count badge, the total value right-aligned and a + button; tinted tiles stacked with a 10px gap; column body scrolls. A terminal "outcome" rail at the end: dashed-border (2px dashed var(--line-2)) drop zones with a centred round icon, title and caption (e.g. Won/Lost). Dragging: the card lifts (scale 1.03, rotate 1.5°, shadow-pop) and the target column gets a line-2 border glow.
- Calendar: month grid with Mon start; day cells are rounded 14px tiles in glass-tile; the date number at the top-left 13px; event chips are 22px rows with a colour dot, time (muted), truncated title and a line-through when done; "+N more" opens a popover; today's cell is a solid cream (light: ink-inverted) tile with an outlined circled number; tiny AvatarStack at the top-right of busy days. Header: month title 20px + prev/next round buttons + a "Today" pill + Month/Week segmented.
- Side agenda panel: title + a date caption ("Saturday, Oct 31 · 0/3 done"), a + button; task rows are tiles with a circular checkbox, title, time · type dot · type, a sub-line and an avatar; a section divider with a coral icon + "Overdue" + a coral count badge.
- Charts (Recharts/visx or custom SVG):
  • Area/line: smooth monotone curve, 2.5px stroke in a semantic colour, a gradient fill from 35% opacity to 0, a dashed horizontal target/average line (dash 6 6, var(--muted)), y-axis ticks 11px muted with no axis lines, faint horizontal gridlines, month labels at the bottom; the legend sits above the chart as dot/dash + label. Tooltip = a floating glass pill.
  • Bars: rounded top corners 8–10px; an empty "ghost" track behind each bar (var(--well), full height); highlight the current period in coral; stacked bars use the semantic colours with a 2px gap between segments.
  • Donut: 18px ring, 4px gaps between segments, round caps, a centre value 28px/600 + a caption; a two-column legend below (dot · name · count · %).
  • Chart colours are read from CSS variables at runtime, and charts re-render when the theme changes.
- Empty state: a centred 48px glass icon circle, title 15px/600, text 13px muted, an optional button.
- Popover / Menu: floating layer, min-width 220px, padding 6px; items 36px rows with a 16px icon + label + optional shortcut "keys" (small 20px rounded boxes, 11px, line border); separators 1px line; header row with a title + an action link.
- Modal: centred, 520–640px wide, floating glass; a header with a title 18px/600 + sub 13px muted + a close icon button; body in a two-column form grid; footer right-aligned with Cancel (ghost) + primary. The page behind gets a dark overlay with blur(6px).
- Drawer: slides from the right, 440–520px wide, full height with a 16px margin, floating glass, radius 22; a sticky header; a scrollable body of sections (each section = a small eyebrow title + content).
- Command palette (⌘K / Ctrl+K): a 560px glass dialog in the upper third; a 56px search row with an icon, a large input and an "esc" key hint; grouped results (eyebrow headings: Pages, Records, Actions); rows 48px with a 32px round icon/avatar, title 14px/500, sub 12px muted and a chevron at the right; the active row gets a var(--glass-2) bg; arrow keys/enter/esc; the background is blurred and dimmed.
- Toast: bottom-centre glass pill, 44px, icon + message + optional "Undo" text button, auto-dismiss after 4s.
- Live bar (e.g. call in progress): a bottom-centre floating pill with a pulsing coral ring dot, the person's name, a running timer and end/notes buttons.
- Settings layout: a left profile card (96px avatar with a lime online dot, name, role, an email pill, a highlighted lime-tinted card with a progress bar, a 3-up mini-stat row with dividers, a "next item" link tile with a coloured left bar) + a right card with an icon tab bar (Segmented with icons) and a form; footer Discard (ghost) + Save (primary), disabled until something changes.

════════════════════════════════════════
7. MOTION (GSAP 3 + @gsap/react useGSAP)
════════════════════════════════════════
Put all motion in /lib/motion.ts. Every duration goes through d(sec), which returns 0 when prefers-reduced-motion is set.
- Route enter: the page header slides x:-14→0 with opacity, 0.6s power3.out; then stat chips and actions stagger in 0.06s.
- Title words: split into words; each goes from yPercent:115, rotation:6 → 0, 0.85s power4.out, stagger 0.022s (with overflow hidden per line).
- Cards enter: from y:34, scale:0.985, opacity:0 → rest, 0.9s power3.out, stagger 0.05s (top-to-bottom, left-to-right).
- Tiles/chips pop: from scale:0.94, y:8, rotation:±1.5 → rest, 0.8s back.out(1.4), stagger 0.03s.
- Numbers: count up from 0 to their value, 1.0s power3.out (keep formatting: currency, %, K/M).
- Charts: line paths draw in (stroke-dashoffset) 1.1s power2.out; bars grow from scaleY:0 (origin bottom) with stagger; rings sweep from 0.
- Popover/menu open: from scale:0.94, y:-4, opacity:0 → 1, 0.32s back.out(1.8), transform-origin at the trigger; close 0.15s power2.in.
- Modal: overlay fades in 0.2s; the panel goes from y:16, scale:0.98 with 0.4s back.out(1.4). Drawer: x:100% → 0, 0.45s power3.out.
- Icon tap feedback: the svg goes scale 0.72 → 1, 0.55s back.out(3).
- Magnetic buttons (fine pointers only): gsap.quickTo on x/y, 0.5s power3.out, a pull of about 30% of the pointer offset; spring back on leave with elastic.out(1,0.5).
- Tab pill and segmented thumbs: tween left/right edges separately (see the tab bar spec); long jumps use 0.55s power3.inOut.
- Kanban drop: a FLIP animation of siblings, 0.35s power3.out.
- Toast: in from y:-12 with back.out(2); out to y:-8 + fade.
- Theme switch: the sun/moon icon rotates 90° + crossfades; colours transition 300ms via CSS on background-color/color/border-color.
- Only animate transform and opacity; 60fps; add will-change only during tweens; clean up in useGSAP.

════════════════════════════════════════
8. THEMING
════════════════════════════════════════
- Theme options: dark (default) | light | system. Save in localStorage ("app:theme").
- An inline script in <head> sets document.documentElement.dataset.theme before first paint, so there is no flash.
- The theme toggle lives at the bottom of the dock and in Settings → Appearance.
- Every component, chart and tint must be verified in both themes.

════════════════════════════════════════
9. RESPONSIVE
════════════════════════════════════════
- ≥1440: full 12-column layouts. 1280–1439: slightly tighter gaps.
- 768–1279: cards collapse to a 6-col/2-up layout; the tab bar scrolls horizontally with a fade mask; header stats wrap below the title.
- <768: the dock becomes a fixed bottom glass bar (5 main icons + more), respecting safe-area-inset-bottom; the top bar shows the brand + avatar, with tabs below as a scrollable pill row; the page title is 30px; cards go full width; kanban columns scroll horizontally with scroll-snap at 85vw; tables turn into stacked card rows; modals become bottom sheets; the drawer goes full screen.
- Touch targets ≥44px on touch devices; magnetic/hover effects are disabled there.

════════════════════════════════════════
10. ACCESSIBILITY & QUALITY
════════════════════════════════════════
- Use Radix UI primitives (Dialog, Popover, DropdownMenu, Tabs, Select, Tooltip, Checkbox) and cmdk for the palette; dnd-kit with a keyboard sensor for drag and drop.
- Body text contrast ≥4.5:1 on glass in both themes (raise the glass opacity if needed). Never rely on colour alone: pair it with a label or icon.
- A visible focus ring: 2px var(--accent) + 2px offset. A skip-to-content link. aria-label on every icon button. aria-live="polite" for toasts.
- All icons come from lucide-react, 16–18px, stroke 1.6.
- Number formatting: Intl.NumberFormat with compact notation for chart axes ($100K) and full values in cards ($1,421,350).
- Relative times ("2 h ago", "in 29 d") via Intl.RelativeTimeFormat.
- Every list has an empty state, a loading skeleton (glass-tile blocks with a soft shimmer) and an error state.

════════════════════════════════════════
11. TECH STACK
════════════════════════════════════════
React + TypeScript, Tailwind CSS v4 mapped to the CSS variables above (no raw hex in components), GSAP + @gsap/react, Recharts, dnd-kit, Radix UI, cmdk, lucide-react, clsx. (See section 13 for how this maps onto the existing Next.js app.)

════════════════════════════════════════
12. HOW TO WORK
════════════════════════════════════════
1. Build tokens, the theme script, the background + wash, the app shell (top bar, pill tabs, dock) and the motion helpers first.
2. Build every component from section 6 on the kit page (/design) and show both themes.
3. Only then restyle the screens, composing only these components.
4. After each screen, screenshot it at 1440px and 390px (and 360px) in both themes, check it against this spec, and fix any spacing, contrast or alignment issues before moving on.
5. Do not invent new colours, radii, shadows, fonts or easing curves. If something is missing, derive it from the existing tokens and say so in the summary.

App: Saqient CRM, a Zoho-style sales CRM (Leads, Accounts, Contacts, Deals pipeline, Products, Quotes, Sales Orders, Invoices, Activities, Zoho import) for GCC businesses, multi-currency (OMR, AED, INR) with VAT.
Brand: "Saqient". Brand mark = 32px lime rounded-square tile with a lucide icon (e.g. `Sparkle` or `Orbit`).
Accent: lime #c4ef4f (default).
Screens: every route that exists today under /app (Home, Accounts, Contacts, Deals list + board, Products, Quotes, Sales Orders, Invoices, record detail/new/edit, My Activities, Settings: Users, Organisation, VAT rates, Exchange rates, Import), plus /login, /accept-invite and the /design kit page.

════════════════════════════════════════
13. CRM ADAPTATION (this repo; overrides the sections above where they conflict)
════════════════════════════════════════
Stack stays as it is (ADR-0001). Do NOT move to Vite.
- Framework: Next.js 16 App Router in apps/web. Read apps/web/AGENTS.md first; check Next.js APIs in node_modules/next/dist/docs/ or Context7.
- Components: shadcn components already live in apps/web/components/ui and patterns in apps/web/components/patterns. Restyle and extend these; do not create a second, parallel library. New spec components go in components/ui (primitives) or components/patterns (composites).
- Already installed, keep: radix-ui, lucide-react, recharts 3.8, sonner (toasts: style it as the glass pill), next-themes, class-variance-authority, tw-animate-css, Tailwind 4.
- Add (exact current versions via Context7, pinned): gsap, @gsap/react, cmdk, @dnd-kit/core (+ @dnd-kit/sortable only if needed). Add clsx/zustand only if a real need appears.
- Motion file: apps/web/lib/motion.ts. All GSAP code runs in client components only ("use client"), cleaned up via useGSAP.

Fonts
- Load Urbanist with next/font/google (self-hosted at build time, no runtime Google request), weights 400/500/600/700, as --font-latin. Keep IBM Plex Sans Arabic as the Arabic fallback in the font stack.

Theme
- Use next-themes, configured as: attribute="data-theme", defaultTheme="dark", enableSystem, storageKey="app:theme", themes ["light","dark"]. next-themes already injects the no-flash head script; do not write a second one.
- Change `@custom-variant dark` in globals.css from `.dark` to `[data-theme=dark]`, so existing `dark:` utilities keep working.

Token names (the spec and shadcn both use --muted and --accent with different meanings)
- Keep the spec's variable names exactly as in section 3; they are the source of truth.
- Re-point the shadcn tokens to them, so every existing component follows automatically:
  --background → var(--bg) · --foreground → var(--text) · --card → var(--glass) · --card-foreground → var(--text)
  --popover → var(--float) · --popover-foreground → var(--text) · --primary → var(--accent) · --primary-foreground → var(--on-accent)
  --secondary → var(--glass-2) · --secondary-foreground → var(--text)
  Tailwind --color-muted → var(--well) · --color-muted-foreground → var(--muted)   (shadcn's "muted" surface vs the spec's muted text)
  Tailwind --color-accent → var(--glass-2) · --color-accent-foreground → var(--text)   (shadcn's hover surface; the lime is --color-primary / --color-lime)
  --border → var(--line) · --input → var(--line-2) · --ring → var(--accent) · --destructive → var(--bad)
  --success → var(--good) · --warning → var(--coral) · --info → var(--sky)
  --chart-1..4 → sky, lime, coral, ink. Retire chart-5..8 and the ordinal blue ramp; pipeline stages map to the 4 semantic roles.
- Expose the spec tokens to Tailwind too (e.g. bg-glass, bg-glass-tile, bg-well, text-faint, border-line-2, rounded-card, rounded-tile, rounded-well, rounded-ctl, shadow-glass, shadow-pop, ease-glass) so components never need raw values.
- No raw hex, px radii or ms durations in components. Durations live in lib/motion.ts; CSS transitions use the --ease token.

Semantic mapping for this CRM (a colour means the same thing everywhere)
- sky: new / open / draft / lead stages (New, Contacted), Quote Draft, Invoice Draft, info.
- lime: active / won / paid / confirmed / delivered / success, primary CTA.
- coral: overdue / lost / cancelled / at risk / validation errors / alerts.
- ink-cream: closed / final / archived / neutral / converted.
- Deal stages: early stages sky, middle stages lime, Negotiation coral, Closed Won lime + check icon, Closed Lost coral + x icon. Always show the label or icon with the colour.

RTL and i18n (ADR-0016; `pnpm check` enforces these)
- Every user-facing string comes from apps/web/messages/en.json via next-intl, including aria-label, title, placeholder and tooltip text. Two-line page titles are two message keys (or one key split on a newline).
- Use logical properties only: the dock sits at inset-inline-start, "left/right" in the spec means start/end, "right-aligned amounts" means text-end. No ml-/mr-/pl-/pr-/left-/right-/text-left/text-right utilities. The tab-pill clip-path and tweens must mirror correctly when dir="rtl".
- Money stays on the shared formatMoney (currency scale: 3 for OMR). Never compute totals on the client.

Shell
- Replace components/shell/sidebar.tsx with the top bar + pill tabs + dock. Keep nav-items.ts as the single source of nav; only link routes that exist.
- Top tabs: Home, Leads (only if its page exists), Accounts, Contacts, Deals, Products, Quotes/Orders/Invoices (if their list pages exist), Activities. Admin settings (Users, Organisation, VAT, Exchange rates, Import) go under one "Settings" entry (dock settings button + a Settings page with a Segmented sub-nav), visible only to admins as today.
- Dock: only buttons backed by a real feature. Search (opens the ⌘K palette), Create (menu of "New <module>" routes), Today (My Activities), then divider, Settings, Theme toggle. No dead buttons for favourites/call/send/share/export until those features exist. The bell shows only if there is something to show.
- Command palette: Pages = the nav items; Records = the existing /api/v1/{module}/search endpoint; Actions = the New-record routes. No new API unless needed (and then OpenAPI + tests in the same change).

Background photo
- File: apps/web/public/bg/dusk.webp (the owner supplies it; until then use a CSS gradient built from the tokens as the placeholder). Fixed, object-fit cover, with the --wash overlay. The same photo serves both themes; the wash does the work.

Kit page
- The existing /design page (app/design) becomes the kit page: every section 6 component, in both themes, plus an RTL preview. Update e2e/design.spec.ts accordingly.

Quality gates
- Behaviour, API, data and permissions do not change. This is a visual change only.
- Contrast: measure every text/surface pair in both themes over the photo + wash (worst case). Raise glass opacity where needed and record the numbers in docs/DESIGN_SYSTEM.md.
- Keep e2e passing; update selectors only where the shell markup really changed, and prefer role/label selectors.
- Every screen works at 360px (ADR-0016).
- Update docs/DESIGN_SYSTEM.md to describe the new system and add ADR-0018 "Glass visual language" (what changed and why).

Reference images (docs/design/reference/)
- sales-overview.png → Home (/app). Header "Sales / Overview" + 3 stat chips (won this month, open pipeline, win rate). Grid: Revenue area chart card (8 cols, 6M/12M Segmented, dashed target line) + "Hot deals" card (4 cols, 2-up tiles: close date, deal name, account, amount, stage · probability, AvatarStack). Below: Team quota ProgressRing card (lime tint) and Stage mix card (proportion bar + legend table). Use only data the app already has; show an empty state where a figure (e.g. quota) has no source yet.
- customer-directory.png → Contacts and Accounts list pages. Header "Customer / Directory" + 3 stat chips. Toolbar: search pill, filter chips, sort chip, Grid/Table Segmented, Export (only if export exists), lime "New" CTA. Grid view = profile/entity cards (avatar, star, name, title · account, well with Open pipeline / Last contact, progress bar, segment pill, mail/call buttons); Table view = DataTable. Grid is 6-up at 1840px, wrapping down per section 9.
- These images show a look to match, not assets to copy. Do not copy text, logos, or images from them.
