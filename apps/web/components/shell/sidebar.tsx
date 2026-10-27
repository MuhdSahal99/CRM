"use client";

import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-items";

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const t = useTranslations();
  const pathname = usePathname();
  return (
    <nav aria-label={t("shell.nav")} className="p-2">
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const current = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                onClick={onNavigate}
                className={cn("flex min-h-9 items-center rounded-md px-3 text-sm hover:bg-muted pointer-coarse:min-h-11", current && "bg-secondary font-medium")}
              >
                {t(item.labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Desktop: a fixed column from md up. */
export function Sidebar({ items }: { items: NavItem[] }) {
  return (
    <aside className="sticky top-0 hidden h-svh w-56 shrink-0 border-e bg-background md:block">
      <NavList items={items} />
    </aside>
  );
}

/** Phones: a menu button that opens the same nav in a drawer; Radix returns focus to the button on close. */
export function MobileNav({ items }: { items: NavItem[] }) {
  const t = useTranslations("shell");
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label={t("openMenu")}>
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="start">
        <SheetHeader>
          <SheetTitle>{t("menu")}</SheetTitle>
        </SheetHeader>
        <NavList items={items} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
