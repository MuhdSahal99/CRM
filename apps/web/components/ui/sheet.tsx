"use client"

import * as React from "react"
import { cn } from "cn"
import { Dialog as SheetPrimitive } from "radix-ui"
import { useGSAP } from "@gsap/react"
import { useOverlayRoot } from "@/components/ui/overlay-root"
import { drawerIn, sheetUp } from "@/lib/motion"
import { gsap } from "gsap"

import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"
import { useTranslations } from "next-intl"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/40 backdrop-blur-[6px]",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "end",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  // Logical sides (ADR-0016): start/end follow the reading direction.
  side?: "top" | "end" | "bottom" | "start"
  showCloseButton?: boolean
}) {
  const t = useTranslations("common")
  const overlay = React.useRef<HTMLDivElement>(null)
  const panel = React.useRef<HTMLDivElement>(null)
  // Slides in from its own edge, mirrored under dir="rtl"; the sign is how far off-screen it starts (lib/motion drawerIn).
  useGSAP(() => {
    if (!overlay.current || !panel.current) return
    gsap.from(overlay.current, { opacity: 0, duration: 0.2 })
    const rtl = getComputedStyle(panel.current).direction === "rtl"
    if (side === "end") drawerIn(panel.current, rtl ? -100 : 100)
    else if (side === "start") drawerIn(panel.current, rtl ? 100 : -100)
    else if (side === "bottom") sheetUp(panel.current)
  }, { dependencies: [] })
  return (
    <SheetPortal container={useOverlayRoot()}>
      <SheetOverlay ref={overlay} />
      <SheetPrimitive.Content
        ref={panel}
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          // Drawer: floating glass with a 16px margin; full screen on phones (GLASS_SPEC 6, 9).
          "float-glass fixed z-50 flex flex-col gap-4 text-sm text-popover-foreground data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:rounded-t-card data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:rounded-b-card data-[side=start]:inset-y-4 data-[side=start]:start-4 data-[side=start]:w-[min(30rem,calc(100%-2rem))] data-[side=start]:rounded-card data-[side=end]:inset-y-4 data-[side=end]:end-4 data-[side=end]:w-[min(30rem,calc(100%-2rem))] data-[side=end]:rounded-card max-md:data-[side=start]:inset-0 max-md:data-[side=start]:w-full max-md:data-[side=start]:rounded-none max-md:data-[side=end]:inset-0 max-md:data-[side=end]:w-full max-md:data-[side=end]:rounded-none",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-4 end-4"
              size="icon-sm"
            >
              <XIcon
              />
              <span className="sr-only">{t("close")}</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-heading font-medium text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
