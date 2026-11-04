import { cn } from "cn";
import { SearchIcon } from "lucide-react";
import type * as React from "react";

/** Pill search field: 40px, glass-2 fill, search icon at the inline start. `label` is the accessible name. */
export function SearchInput({ label, className, ...props }: Omit<React.ComponentProps<"input">, "aria-label" | "type"> & { label: string }) {
  return (
    <div className={cn("relative w-full max-w-sm", className)}>
      <SearchIcon aria-hidden className="pointer-events-none absolute inset-s-3.5 top-1/2 size-4 -translate-y-1/2 stroke-[1.6] text-faint" />
      <input
        type="search"
        aria-label={label}
        data-slot="search-input"
        className="h-(--ctl-h) w-full rounded-full border border-line bg-glass-2 ps-10 pe-4 text-sm outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
        {...props}
      />
    </div>
  );
}
