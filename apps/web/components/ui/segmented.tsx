"use client";

import { useGSAP } from "@gsap/react";
import { cn } from "cn";
import { ToggleGroup } from "radix-ui";
import * as React from "react";
import { edgeTween } from "@/lib/motion";

export type SegmentedOption = { value: string; label: React.ReactNode; icon?: React.ReactNode };

/** Glass track with a sliding ink thumb; the thumb's two edges are tweened separately (lib/motion edgeTween). */
export function Segmented({
  options,
  value,
  onValueChange,
  label,
  className,
}: {
  options: SegmentedOption[];
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible name of the group. */
  label: string;
  className?: string;
}) {
  const track = React.useRef<HTMLDivElement>(null);
  const thumb = React.useRef<HTMLSpanElement>(null);
  const edges = React.useRef<{ start: number; end: number } | null>(null);
  const index = options.findIndex((o) => o.value === value);
  const prev = React.useRef(-1);

  // Insets of the active option from the track's inline-start / inline-end edges, so RTL needs no special case below.
  const measure = () => {
    const t = track.current;
    const el = t?.querySelectorAll<HTMLElement>("[data-segment]")[index];
    if (!t || !el) return null;
    const rtl = getComputedStyle(t).direction === "rtl";
    const w = t.offsetWidth;
    const start = rtl ? w - (el.offsetLeft + el.offsetWidth) : el.offsetLeft;
    return { start, end: w - start - el.offsetWidth };
  };
  const paint = () => {
    const e = edges.current;
    if (!e || !thumb.current) return;
    thumb.current.style.insetInlineStart = `${e.start}px`;
    thumb.current.style.insetInlineEnd = `${e.end}px`;
  };

  useGSAP(
    () => {
      const to = measure();
      if (!to) return;
      if (!edges.current || prev.current < 0) edges.current = to;
      else edgeTween(edges.current, to, paint, Math.abs(index - prev.current) > 2);
      prev.current = index;
      paint();
    },
    { dependencies: [index], scope: track },
  );
  React.useLayoutEffect(() => {
    const t = track.current;
    if (!t) return;
    const ro = new ResizeObserver(() => {
      const to = measure();
      if (to) {
        edges.current = to;
        paint();
      }
    });
    ro.observe(t);
    return () => ro.disconnect();
  });

  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v)}
      aria-label={label}
      data-slot="segmented"
      className={cn("relative inline-flex w-fit max-w-full overflow-x-auto rounded-full border border-line bg-glass-2 p-[3px] [scrollbar-width:none]", className)}
      asChild
    >
      <div ref={track}>
        <span ref={thumb} aria-hidden className="absolute inset-y-[3px] rounded-full bg-pill" />
        {options.map((o) => (
          <ToggleGroup.Item
            key={o.value}
            value={o.value}
            data-segment=""
            className={cn(
              "relative inline-flex h-7 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-200 pointer-coarse:h-10 [&_svg]:size-4 [&_svg]:stroke-[1.6]",
              o.value === value ? "text-on-pill" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.icon}
            {o.label}
          </ToggleGroup.Item>
        ))}
      </div>
    </ToggleGroup.Root>
  );
}
