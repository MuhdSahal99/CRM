import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type * as React from "react";
import { type Tone, TONE_BG } from "./tone";

/** 24px pill: a 6px colour dot (the semantic role) and a label. Colour is never the only signal. */
export function StatusPill({ tone, className, children, ...props }: React.ComponentProps<"span"> & { tone: Tone }) {
  return (
    <span data-slot="status-pill" className={cn("inline-flex h-6 items-center gap-1.5 rounded-full bg-glass-2 px-2.5 text-xs font-medium whitespace-nowrap", className)} {...props}>
      <span aria-hidden className={cn("size-1.5 rounded-full", TONE_BG[tone])} />
      {children}
    </span>
  );
}

const deltaVariants = cva("inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold text-on-accent tabular-nums", {
  variants: { tone: { positive: "bg-lime", negative: "bg-coral", neutral: "bg-sky" } },
  defaultVariants: { tone: "neutral" },
});

export function DeltaBadge({ tone, className, children, ...props }: React.ComponentProps<"span"> & VariantProps<typeof deltaVariants>) {
  return (
    <span data-slot="delta-badge" className={cn(deltaVariants({ tone }), className)} {...props}>
      <bdi>{children}</bdi>
    </span>
  );
}

/** 44px round glass icon circle + stacked value (with optional delta) over a muted label. */
export function StatChip({ icon, value, label, delta, className }: { icon: React.ReactNode; value: React.ReactNode; label: React.ReactNode; delta?: React.ReactNode; className?: string }) {
  return (
    <div data-slot="stat-chip" className={cn("flex items-center gap-3", className)}>
      <span aria-hidden className="glass grid size-11 shrink-0 place-items-center rounded-full [&_svg]:size-[18px] [&_svg]:stroke-[1.6]">
        {icon}
      </span>
      <div>
        <p className="flex items-center gap-2 text-[21px] leading-tight font-semibold tabular-nums">
          {value}
          {delta}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
