import { cn } from "cn";
import type * as React from "react";
import { Avatar } from "./avatar";

/** A 32px pill toggle; selected = ink pill. Pass `avatar` (a name) for the 20px avatar. */
export function FilterChip({
  selected = false,
  avatar,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { selected?: boolean; avatar?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-slot="filter-chip"
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-200 ease-glass pointer-coarse:h-11 [&_svg]:size-4 [&_svg]:stroke-[1.6]",
        selected ? "border-transparent bg-pill text-on-pill" : "border-line-2 text-foreground hover:bg-glass-2",
        avatar && "ps-1.5",
        className,
      )}
      {...props}
    >
      {avatar && <Avatar name={avatar} size="xs" />}
      {children}
    </button>
  );
}

/** Chips scroll horizontally when they do not fit. */
export function ChipGroup({ label, className, ...props }: Omit<React.ComponentProps<"div">, "aria-label"> & { label: string }) {
  return <div role="group" aria-label={label} className={cn("flex items-center gap-2 overflow-x-auto [scrollbar-width:none]", className)} {...props} />;
}

/** The thin vertical divider between chip groups. */
export function ChipDivider() {
  return <span aria-hidden className="h-5 w-px shrink-0 bg-line-2" />;
}
