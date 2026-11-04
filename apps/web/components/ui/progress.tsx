"use client";

import { useGSAP } from "@gsap/react";
import { cn } from "cn";
import { gsap } from "gsap";
import { useLocale } from "next-intl";
import * as React from "react";
import { formatPercent } from "@/lib/format";
import { d } from "@/lib/motion";
import { type Tone, TONE_BG, TONE_STROKE } from "./tone";

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/** 4-6px bar; `label` is the accessible name and `valueLabel` the optional text at the inline end. */
export function ProgressBar({ value, tone = "lime", label, valueLabel, className }: { value: number; tone?: Tone; label: string; valueLabel?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamp(value))} className="h-1.5 flex-1 overflow-hidden rounded-full bg-well">
        <div className={cn("h-full rounded-full", TONE_BG[tone])} style={{ inlineSize: `${clamp(value)}%` }} />
      </div>
      {valueLabel && <span className="text-xs font-semibold tabular-nums">{valueLabel}</span>}
    </div>
  );
}

/** SVG ring: round caps, starts at the top, big % in the centre and a muted caption below. */
export function ProgressRing({ value, tone = "lime", size = 120, stroke = 10, label, caption, className }: { value: number; tone?: Tone; size?: number; stroke?: number; label: string; caption?: React.ReactNode; className?: string }) {
  const locale = useLocale();
  const v = clamp(value);
  const r = (size - stroke) / 2;
  const arc = React.useRef<SVGCircleElement>(null);
  useGSAP(() => {
    if (arc.current) gsap.from(arc.current, { strokeDasharray: "0 100", duration: d(1), ease: "power3.out" });
  }, [v]);
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} className={cn("relative inline-grid place-items-center", className)} style={{ inlineSize: size, blockSize: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90 rtl:scale-y-[-1]">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-well" />
        <circle ref={arc} cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" pathLength={100} strokeDasharray={`${Math.max(0, v - 2)} 100`} className={TONE_STROKE[tone]} />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="text-2xl leading-none font-semibold tabular-nums">{formatPercent(v, locale)}</span>
        {caption && <span className="mt-1 text-[11px] text-muted-foreground">{caption}</span>}
      </div>
    </div>
  );
}

export type ProportionSegment = { key: string; name: string; count: number; tone: Tone; value?: React.ReactNode };

/** Blocks whose widths equal the shares, then a legend table: dot · name · count · value · %. */
export function ProportionBar({ segments, label, headers, className }: { segments: ProportionSegment[]; label: string; headers: { name: string; count: string; value?: string; share: string }; className?: string }) {
  const locale = useLocale();
  const total = segments.reduce((s, x) => s + x.count, 0) || 1;
  const hasValue = segments.some((s) => s.value !== undefined);
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div role="img" aria-label={label} className="flex h-10 gap-1">
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <span key={s.key} className={cn("rounded-[10px]", TONE_BG[s.tone])} style={{ flexGrow: s.count, flexBasis: 0 }} />
          ))}
      </div>
      <table className="w-full text-[13px]">
        <caption className="sr-only">{label}</caption>
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="pb-1 text-start font-normal">
              {headers.name}
            </th>
            <th scope="col" className="pb-1 text-end font-normal">
              {headers.count}
            </th>
            {hasValue && (
              <th scope="col" className="pb-1 text-end font-normal">
                {headers.value}
              </th>
            )}
            <th scope="col" className="pb-1 text-end font-normal">
              {headers.share}
            </th>
          </tr>
        </thead>
        <tbody>
          {segments.map((s) => (
            <tr key={s.key} className="border-t border-line">
              <th scope="row" className="py-2 text-start font-medium">
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className={cn("size-2 rounded-full", TONE_BG[s.tone])} />
                  {s.name}
                </span>
              </th>
              <td className="py-2 text-end tabular-nums">{s.count}</td>
              {hasValue && <td className="py-2 text-end tabular-nums">{s.value}</td>}
              <td className="py-2 text-end text-muted-foreground tabular-nums">{formatPercent((s.count / total) * 100, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
