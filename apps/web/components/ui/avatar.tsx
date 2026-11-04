import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type * as React from "react";

const avatarVariants = cva("inline-grid shrink-0 place-items-center rounded-full border border-line font-semibold select-none", {
  variants: {
    size: { xs: "size-6 text-[10px]", sm: "size-7 text-[11px]", md: "size-9 text-xs", lg: "size-11 text-sm", xl: "size-24 text-3xl" },
  },
  defaultVariants: { size: "md" },
});

// Pastel tints rotate through sky / lime / coral / cream by hashing the name.
const TINTS = [
  "bg-[color-mix(in_srgb,var(--sky)_45%,transparent)]",
  "bg-[color-mix(in_srgb,var(--lime)_45%,transparent)]",
  "bg-[color-mix(in_srgb,var(--coral)_45%,transparent)]",
  "bg-[color-mix(in_srgb,var(--cream)_45%,transparent)]",
];

export const tintFor = (name: string) => TINTS[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TINTS.length]!;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export function Avatar({ name, size, className, ...props }: Omit<React.ComponentProps<"span">, "children"> & VariantProps<typeof avatarVariants> & { name: string }) {
  return (
    <span role="img" aria-label={name} data-slot="avatar" className={cn(avatarVariants({ size }), tintFor(name), "text-foreground", className)} {...props}>
      <span aria-hidden>{initials(name)}</span>
    </span>
  );
}

/** Overlapping avatars (-8px, 2px ring), max 3 then "+N". */
export function AvatarStack({ names, max = 3, size = "sm", className }: { names: string[]; max?: number; size?: VariantProps<typeof avatarVariants>["size"]; className?: string }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <span className={cn("inline-flex items-center", className)} data-slot="avatar-stack">
      {shown.map((n, i) => (
        <Avatar key={n} name={n} size={size} className={cn("ring-2 ring-solid", i > 0 && "-ms-2")} />
      ))}
      {extra > 0 && (
        <span className={cn(avatarVariants({ size }), "-ms-2 bg-glass-3 text-foreground ring-2 ring-solid")}>
          <span aria-hidden>+{extra}</span>
          <span className="sr-only">{names.slice(max).join(", ")}</span>
        </span>
      )}
    </span>
  );
}
