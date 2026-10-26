"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Cell, Funnel, FunnelChart, LabelList, Pie, PieChart, PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

/** Values are numbers for plotting only; any amount shown as text goes through <Money>. */
export type Datum = { key: string; name: string; value: number; display: ReactNode };

/** Every chart is a figure with a title and a data-table view (never color alone). */
function ChartFigure({ title, data, children }: { title: ReactNode; data: Datum[]; children: ReactNode }) {
  const t = useTranslations("charts");
  return (
    <figure className="flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-4">
      <figcaption className="font-medium">{title}</figcaption>
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

const ORDINAL = ["--ordinal-1", "--ordinal-2", "--ordinal-3", "--ordinal-4", "--ordinal-5"];

// Charts keep LTR geometry in RTL pages (DESIGN_SYSTEM.md § Charts); text inside still shapes correctly.
export function PipelineFunnel({ title, data }: { title: ReactNode; data: (Datum & { label: string })[] }) {
  const config = Object.fromEntries(data.map((d) => [d.key, { label: d.name }])) satisfies ChartConfig;
  return (
    <ChartFigure title={title} data={data}>
      <ChartContainer dir="ltr" config={config} className="aspect-auto h-56 w-full">
        <FunnelChart margin={{ right: 120 }}>
          <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
          <Funnel dataKey="value" nameKey="key" data={data} isAnimationActive={false} stroke="var(--card)" strokeWidth={2}>
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

export function Donut({ title, data, centerLabel }: { title: ReactNode; data: (Datum & { slot: number })[]; centerLabel: ReactNode }) {
  // `slot` (1–8) is fixed per category by the caller, so filtering never repaints the survivors.
  const config = Object.fromEntries(data.map((d) => [d.key, { label: d.name, color: `var(--chart-${d.slot})` }])) satisfies ChartConfig;
  return (
    <ChartFigure title={title} data={data}>
      <div className="relative mx-auto size-48">
        <ChartContainer dir="ltr" config={config} className="aspect-square size-full">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
            <Pie
              data={data.map((d) => ({ ...d, fill: `var(--color-${d.key})` }))}
              dataKey="value"
              nameKey="key"
              innerRadius="62%"
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm font-semibold">{centerLabel}</div>
      </div>
      <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-xs" style={{ background: `var(--chart-${d.slot})` }} />
            {d.name}
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
