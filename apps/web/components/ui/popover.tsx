"use client";

import { useGSAP } from "@gsap/react";
import { cn } from "cn";
import { Popover as PopoverPrimitive } from "radix-ui";
import * as React from "react";
import { useOverlayRoot } from "@/components/ui/overlay-root";
import { popoverIn } from "@/lib/motion";

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger(props: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

/** Floating glass layer (GLASS_SPEC 6 Popover): springs in from the trigger; close is instant. */
function PopoverContent({ className, align = "center", sideOffset = 6, ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const ref = React.useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const el = ref.current;
      if (el) popoverIn(el, getComputedStyle(el).transformOrigin);
    },
    { dependencies: [] },
  );
  return (
    <PopoverPrimitive.Portal container={useOverlayRoot()}>
      <PopoverPrimitive.Content
        ref={ref}
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn("float-glass z-50 min-w-55 origin-(--radix-popover-content-transform-origin) rounded-tile p-1.5 text-sm text-popover-foreground outline-none", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
