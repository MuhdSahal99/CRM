import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type * as React from "react";

type CardProps = Omit<React.ComponentProps<"section">, "title"> & {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Segmented toggle and round icon buttons, at the inline end of the header. */
  tools?: React.ReactNode;
};

/** The main glass surface: header (title + subtitle, tools slot) over the body. */
export function GlassCard({ title, subtitle, tools, className, children, ...props }: CardProps) {
  return (
    <section data-slot="glass-card" className={cn("glass flex flex-col gap-4 rounded-card p-(--pad)", className)} {...props}>
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-medium">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {tools && <div className="flex shrink-0 items-center gap-2">{tools}</div>}
      </header>
      {children}
    </section>
  );
}

/** Hero number line: a big figure with an inline muted caption (wrap key numbers in <b>). */
export function HeroNumber({ value, caption, className }: { value: React.ReactNode; caption?: React.ReactNode; className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-1", className)}>
      <span className="text-[36px] leading-none font-semibold tracking-[-0.02em] tabular-nums">{value}</span>
      {caption && <span className="text-xs text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground">{caption}</span>}
    </p>
  );
}

const tileVariants = cva("rounded-tile border border-line bg-glass-tile p-4 transition-[border-color,transform] duration-200 ease-glass", {
  variants: {
    tint: {
      none: "",
      sky: "bg-[color-mix(in_srgb,var(--sky)_16%,var(--glass-tile))]",
      lime: "bg-[color-mix(in_srgb,var(--lime)_16%,var(--glass-tile))]",
      coral: "bg-[color-mix(in_srgb,var(--coral)_16%,var(--glass-tile))]",
    },
    interactive: { true: "hover:-translate-y-0.5 hover:border-line-2", false: "" },
  },
  defaultVariants: { tint: "none", interactive: false },
});

/** A card inside a card. */
export function Tile({ tint, interactive, className, ...props }: React.ComponentProps<"div"> & VariantProps<typeof tileVariants>) {
  return <div data-slot="tile" className={cn(tileVariants({ tint, interactive }), className)} {...props} />;
}

/** Inset info box inside a tile: no border. */
export function Well({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="well" className={cn("rounded-well bg-well p-3", className)} {...props} />;
}
