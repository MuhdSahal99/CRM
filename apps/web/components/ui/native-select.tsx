import { cn } from "cn";
import type * as React from "react";

/** A native <select> in the form-field skin: 42px, 12px radius, glass-2 fill. Use where the browser's own picker is the contract. */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-[42px] w-full min-w-0 rounded-lg border border-input bg-secondary px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 md:w-auto",
        className,
      )}
      {...props}
    />
  );
}
