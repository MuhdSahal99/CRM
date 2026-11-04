"use client";

import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Funnel, FunnelChart, LabelList, Pie, PieChart, PolarAngleAxis, RadialBar, RadialBarChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps, TooltipValueType } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { TONE_BG, type Tone } from "@/components/ui/tone";
import { prefersReducedMotion } from "@/lib/motion";

/** Values are numbers for plotting only; any amount shown as text goes through <Money>. */
export type Datum = { key: string; name: string; value: number; display: ReactNode };

/** Every chart is a figure with a title and a data-table view (never color alone). */
function ChartFigure({ title, data, children }: { title: ReactNode; data: Datum[]; children: ReactNode }) {
  const t = useTranslations("charts");
  return (
    <figure className="glass flex min-w-0 flex-col gap-3 rounded-card p-(--pad)">
      <figcaption className="text-[15px] font-medium">{title}</figcaption>
      {children}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">{t("showData")}</summary>
        <table className="mt-2 w-full">
          <tbody>
            {data.map((d) => (
              <tr key={d.key} className="border-b last:border-0">
                <th scope="row" className="py-1 text-start font-normal">{d.name}</th>
                <td className="py-1 text-end tabular-nums">{d.display}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

// The four semantic roles (sky, lime, coral, ink); later stages reuse the last one.
const ORDINAL = ["--chart-1", "--chart-2", "--chart-3", "--chart-4"];

// Charts keep LTR geometry in RTL pages (DESIGN_SYSTEM.md § Charts); text inside still shapes correctly.
export function PipelineFunnel({ title, data }: { title: ReactNode; data: (Datum & { label: string })[] }) {
  const config = Object.fromEntries(data.map((d) => [d.key, { label: d.name }])) satisfies ChartConfig;
  return (
    <ChartFigure title={title} data={data}>
      <ChartContainer dir="ltr" config={config} className="aspect-auto h-56 w-full">
        <FunnelChart margin={{ right: 120 }}>
          <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
          <Funnel dataKey="value" nameKey="key" data={data} isAnimationActive={false} stroke="var(--float)" strokeWidth={2}>
            {data.map((d, i) => (
              <Cell key={d.key} fill={`var(${ORDINAL[Math.min(i, ORDINAL.length - 1)]})`} />
            ))}
            {/* Custom label: recharts' default wraps "Stage: 123" onto two lines. */}
            <LabelList
              dataKey="label"
              content={({ viewBox, value }) => {
                const b = viewBox as { x: number; y: number; width: number; height: number };
                return (
                  <text x={b.x + b.width + 8} y={b.y + b.height / 2} dominantBaseline="middle" className="fill-foreground text-xs">
                    {value}
                  </text>
                );
              }}
            />
          </Funnel>
        </FunnelChart>
      </ChartContainer>
    </ChartFigure>
  );
}

// ── Runtime colours ──────────────────────────────────────────────────────────────────────────────────────────────
// Charts read the tokens from the computed style of their own wrapper (so a data-theme panel is honoured) and re-read
// them when data-theme changes anywhere above it (GLASS_SPEC 6 Charts).
const TOKENS = ["sky", "lime", "coral", "ink", "muted", "well", "line", "text"] as const;
type Palette = Record<(typeof TOKENS)[number], string>;

function useChartColors(ref: RefObject<HTMLElement | null>): Palette | null {
  const [palette, setPalette] = useState<Palette | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const cs = getComputedStyle(el);
      setPalette(Object.fromEntries(TOKENS.map((k) => [k, cs.getPropertyValue(`--${k}`).trim()])) as Palette);
    };
    read();
    const mo = new MutationObserver(read);
    for (let n: Element | null = el; n; n = n.parentElement) mo.observe(n, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => mo.disconnect();
  }, [ref]);
  return palette;
}

/** A themed, measured chart area: renders its children only once the tokens are read (client only). */
function Plot({ className, children }: { className?: string; children: (c: Palette) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const colors = useChartColors(ref);
  return (
    <div ref={ref} dir="ltr" className={className ?? "h-60 w-full"}>
      {colors && (
        <ChartContainer config={{}} className="aspect-auto size-full">
          {children(colors)}
        </ChartContainer>
      )}
    </div>
  );
}

const nf = (locale: string, o: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, { numberingSystem: "latn", ...o });
const compact = (locale: string) => (v: number) => nf(locale, { notation: "compact", maximumFractionDigits: 1 }).format(v);
const full = (locale: string) => (v: number) => nf(locale, { maximumFractionDigits: 3 }).format(v);

const anim = () => ({ isAnimationActive: !prefersReducedMotion(), animationDuration: 1100, animationEasing: "ease-out" as const });

type LegendItem = { name: string; tone: keyof Palette; dashed?: boolean };

/** Dot / dash + label row that sits above a plot; colours come from the same runtime palette. */
function Legend({ items }: { items: LegendItem[] }) {
  const ref = useRef<HTMLUListElement>(null);
  const c = useChartColors(ref);
  return (
    <ul ref={ref} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {c &&
        items.map((i) => (
          <li key={i.name} className="flex items-center gap-1.5">
            <span aria-hidden className={i.dashed ? "h-0 w-4 border-t-2 border-dashed" : "size-2 rounded-full"} style={i.dashed ? { borderColor: c[i.tone] } : { background: c[i.tone] }} />
            {i.name}
          </li>
        ))}
    </ul>
  );
}

/** Floating glass pill used by every chart tooltip. */
function TipPill({ label, rows }: { label?: ReactNode; rows: { name?: ReactNode; value: ReactNode; color?: string }[] }) {
  return (
    <div className="float-glass flex items-center gap-3 rounded-full px-3 py-1.5 text-xs">
      {label && <span className="text-muted-foreground">{label}</span>}
      {rows.map((r, i) => (
        <span key={i} className="flex items-center gap-1.5 font-medium tabular-nums">
          {r.color && <span aria-hidden className="size-2 rounded-full" style={{ background: r.color }} />}
          {r.name}
          {r.value}
        </span>
      ))}
    </div>
  );
}

type TipProps = TooltipContentProps<TooltipValueType, string | number>;

const MARGIN = { top: 8, right: 8, left: 0, bottom: 0 };
const axis = (c: Palette) => ({ tickLine: false, axisLine: false, tick: { fontSize: 11, fill: c.muted } }) as const;

/** Smooth area/line trend: 2.5px stroke, 35% to 0 gradient, optional dashed target line, compact y-axis. */
export function AreaTrend({ title, data, seriesLabel, tone = "sky", target }: { title: ReactNode; data: Datum[]; seriesLabel: string; tone?: Tone; target?: { value: number; label: string } }) {
  const locale = useLocale();
  const gid = `area-${useId().replace(/:/g, "")}`;
  const rows = data.map((d) => ({ name: d.name, value: d.value }));
  return (
    <ChartFigure title={title} data={data}>
      <Legend items={[{ name: seriesLabel, tone }, ...(target ? [{ name: target.label, tone: "muted" as const, dashed: true }] : [])]} />
      <Plot>
        {(c) => (
          <AreaChart data={rows} margin={MARGIN}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c[tone]} stopOpacity={0.35} />
                <stop offset="100%" stopColor={c[tone]} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={c.line} />
            <XAxis dataKey="name" {...axis(c)} />
            <YAxis {...axis(c)} width={44} tickFormatter={compact(locale)} />
            <Tooltip cursor={{ stroke: c.line }} content={({ active, label, payload }: TipProps) => (active && payload?.length ? <TipPill label={label} rows={[{ name: `${seriesLabel} `, value: full(locale)(Number(payload[0]!.value)), color: c[tone] }]} /> : null)} />
            {target && <ReferenceLine y={target.value} stroke={c.muted} strokeDasharray="6 6" />}
            <Area type="monotone" dataKey="value" stroke={c[tone]} strokeWidth={2.5} fill={`url(#${gid})`} {...anim()} />
          </AreaChart>
        )}
      </Plot>
    </ChartFigure>
  );
}

/** Rounded-top bars over a ghost track; `highlight` (a Datum key) paints the current period coral. */
export function Bars({ title, data, seriesLabel, highlight, tone = "sky" }: { title: ReactNode; data: Datum[]; seriesLabel: string; highlight?: string; tone?: Tone }) {
  const locale = useLocale();
  const rows = data.map((d) => ({ key: d.key, name: d.name, value: d.value }));
  return (
    <ChartFigure title={title} data={data}>
      <Plot>
        {(c) => (
          <BarChart data={rows} margin={MARGIN}>
            <XAxis dataKey="name" {...axis(c)} />
            <YAxis {...axis(c)} width={44} tickFormatter={compact(locale)} />
            <Tooltip cursor={false} content={({ active, label, payload }: TipProps) => (active && payload?.length ? <TipPill label={label} rows={[{ name: `${seriesLabel} `, value: full(locale)(Number(payload[0]!.value)), color: c[tone] }]} /> : null)} />
            <Bar dataKey="value" radius={[10, 10, 0, 0]} maxBarSize={36} background={{ fill: c.well, radius: 10 }} {...anim()}>
              {rows.map((r) => (
                <Cell key={r.key} fill={r.key === highlight ? c.coral : c[tone]} />
              ))}
            </Bar>
          </BarChart>
        )}
      </Plot>
    </ChartFigure>
  );
}

type SegProps = { x?: number; y?: number; width?: number; height?: number; fill?: string; radius?: number | number[] };

/** One stacked segment, inset 1px top and bottom so neighbours show a 2px gap; only the top segment has rounded corners. */
function Segment({ x = 0, y = 0, width = 0, height = 0, fill, radius }: SegProps) {
  if (height <= 2) return null;
  const r = Math.min(Array.isArray(radius) ? (radius[0] ?? 0) : 0, width / 2, height / 2);
  const t = y + 1;
  const b = y + height - 1;
  return <path d={`M${x},${t + r} Q${x},${t} ${x + r},${t} L${x + width - r},${t} Q${x + width},${t} ${x + width},${t + r} L${x + width},${b} L${x},${b} Z`} fill={fill} />;
}

export type StackSeries = { key: string; name: string; tone: Tone };
export type StackRow = { key: string; name: string; values: Record<string, number>; display: ReactNode };

/** Stacked bars in the semantic colours; the legend sits above. */
export function StackedBars({ title, series, data }: { title: ReactNode; series: StackSeries[]; data: StackRow[] }) {
  const locale = useLocale();
  const rows = data.map((r) => ({ name: r.name, ...r.values }));
  return (
    <ChartFigure title={title} data={data.map((r) => ({ key: r.key, name: r.name, value: 0, display: r.display }))}>
      <Legend items={series.map((s) => ({ name: s.name, tone: s.tone }))} />
      <Plot>
        {(c) => (
          <BarChart data={rows} margin={MARGIN}>
            <CartesianGrid vertical={false} stroke={c.line} />
            <XAxis dataKey="name" {...axis(c)} />
            <YAxis {...axis(c)} width={44} tickFormatter={compact(locale)} />
            <Tooltip
              cursor={false}
              content={({ active, label, payload }: TipProps) =>
                active && payload?.length ? <TipPill label={label} rows={payload.map((p) => ({ name: `${p.name} `, value: full(locale)(Number(p.value)), color: p.color }))} /> : null
              }
            />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} stackId="s" fill={c[s.tone]} maxBarSize={36} radius={i === series.length - 1 ? [8, 8, 0, 0] : 0} shape={Segment} {...anim()} />
            ))}
          </BarChart>
        )}
      </Plot>
    </ChartFigure>
  );
}

const ROLE: Tone[] = ["sky", "lime", "coral", "ink"];

/** Donut: 18px ring, 4px gaps, round caps, a 28px centre value with a caption, and a two-column legend. */
export function Donut({ title, data, centerValue, centerCaption }: { title: ReactNode; data: (Datum & { slot: number })[]; centerValue: ReactNode; centerCaption: ReactNode }) {
  const locale = useLocale();
  // `slot` (1–4) is fixed per category by the caller, so filtering never repaints the survivors.
  const total = data.reduce((n, d) => n + d.value, 0);
  const pct = nf(locale, { style: "percent", maximumFractionDigits: 0 });
  const rows = data.map((d) => ({ ...d, tone: ROLE[(d.slot - 1) % ROLE.length]! }));
  return (
    <ChartFigure title={title} data={data}>
      <div className="relative mx-auto size-48">
        <Plot className="size-full">
          {(c) => (
            <PieChart>
              <Tooltip content={({ active, payload }: TipProps) => (active && payload?.length ? <TipPill rows={[{ name: `${payload[0]!.name} `, value: full(locale)(Number(payload[0]!.value)) }]} /> : null)} />
              <Pie data={rows} dataKey="value" nameKey="name" innerRadius={78} outerRadius={96} paddingAngle={3} cornerRadius={9} stroke="none" {...anim()}>
                {rows.map((r) => (
                  <Cell key={r.key} fill={c[r.tone]} />
                ))}
              </Pie>
            </PieChart>
          )}
        </Plot>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <span className="text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums">{centerValue}</span>
          <span className="mt-1 text-xs text-muted-foreground">{centerCaption}</span>
        </div>
      </div>
      <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2">
            <span aria-hidden className={`size-2 rounded-full ${TONE_BG[r.tone]}`} />
            <span className="truncate">{r.name}</span>
            <span className="text-end tabular-nums">{r.display}</span>
            <span className="w-9 text-end text-muted-foreground tabular-nums">{total ? pct.format(r.value / total) : ""}</span>
          </li>
        ))}
      </ul>
    </ChartFigure>
  );
}

/** Single headline vs target, e.g. quota attainment. `percent` may exceed 100; the arc caps at 100. */
export function Gauge({ title, percent, valueLabel, data }: { title: ReactNode; percent: number; valueLabel: ReactNode; data: Datum[] }) {
  const config = { value: { label: title, color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <ChartFigure title={title} data={data}>
      <div className="relative">
        <ChartContainer dir="ltr" config={config} className="mx-auto aspect-[2/1] h-36">
          <RadialBarChart data={[{ value: Math.min(percent, 100) }]} startAngle={180} endAngle={0} innerRadius="75%" outerRadius="100%" cy="100%">
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
            <RadialBar dataKey="value" fill="var(--color-value)" background cornerRadius={4} isAnimationActive={false} />
          </RadialBarChart>
        </ChartContainer>
        <div className="absolute inset-x-0 bottom-0 text-center text-2xl font-semibold tabular-nums">{valueLabel}</div>
      </div>
    </ChartFigure>
  );
}
