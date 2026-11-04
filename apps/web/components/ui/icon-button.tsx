"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import * as React from "react";
import { iconTap, magnetic } from "@/lib/motion";

const iconButtonVariants = cva(
  "relative inline-grid shrink-0 place-items-center rounded-full text-foreground transition-colors duration-200 ease-glass disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:stroke-[1.6]",
  {
    variants: {
      size: {
        sm: "size-7 pointer-coarse:size-11 [&_svg]:size-4",
        md: "size-(--icon-btn) pointer-coarse:size-11 [&_svg]:size-4",
        lg: "size-11 [&_svg]:size-[18px]",
      },
      variant: {
        outline: "border border-line-2 bg-transparent hover:bg-glass-2",
        fill: "bg-glass-2 hover:bg-glass-3",
      },
    },
    defaultVariants: { size: "md", variant: "outline" },
  },
);

type Props = Omit<React.ComponentProps<"button">, "aria-label"> &
  VariantProps<typeof iconButtonVariants> & {
    /** Accessible name; always from en.json. */
    label: string;
    /** Pulls toward the pointer on fine pointers only (no-op on touch). */
    magnetic?: boolean;
  };

export function IconButton({ label, size, variant, magnetic: pull = false, className, onClick, children, ...props }: Props) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => (pull && ref.current ? magnetic(ref.current) : undefined), [pull]);
  return (
    <button
      ref={ref}
      type="button"
      data-slot="icon-button"
      aria-label={label}
      className={cn(iconButtonVariants({ size, variant }), className)}
      onClick={(e) => {
        const svg = ref.current?.querySelector("svg");
        if (svg) iconTap(svg);
        onClick?.(e);
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export { iconButtonVariants };
