import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-[filter,box-shadow,background-color,transform] duration-200 ease-glass outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:brightness-105 hover:shadow-[0_0_24px_-4px_var(--accent)]",
        primary: "bg-primary text-primary-foreground hover:brightness-105 hover:shadow-[0_0_24px_-4px_var(--accent)]",
        outline:
          "border-input bg-transparent hover:bg-secondary aria-expanded:bg-secondary",
        secondary:
          "border-border bg-secondary text-secondary-foreground hover:bg-glass-3 aria-expanded:bg-glass-3",
        ghost:
          "hover:bg-secondary hover:text-foreground aria-expanded:bg-secondary",
        destructive:
          "bg-transparent text-coral hover:bg-coral/15",
        danger: "bg-transparent text-coral hover:bg-coral/15",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-(--ctl-h) gap-1.5 px-[18px] in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pe-4 has-data-[icon=inline-start]:ps-4",
        xs: "h-6 gap-1 px-2.5 text-xs in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-(--ctl-h-sm) gap-1 px-3.5 in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5",
        lg: "h-11 gap-1.5 px-5 has-data-[icon=inline-end]:pe-4 has-data-[icon=inline-start]:ps-4",
        icon: "size-(--icon-btn)",
        "icon-xs":
          "size-6 in-data-[slot=button-group]:rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-8 in-data-[slot=button-group]:rounded-md",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
