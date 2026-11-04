"use client";

import { LogOutIcon, OrbitIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth-client";
import { CommandPalette, type SearchModule } from "./command-palette";
import { Dock } from "./dock";
import type { NavItem } from "./nav-items";
import { activeHref, PillTabs } from "./pill-tabs";

type Props = { items: NavItem[]; user: { name: string; email: string }; searchModules: SearchModule[] };

/** The shell chrome: transparent sticky top bar (brand, pill tabs, account), the dock, and the ⌘K palette. */
export function TopBar({ items, user, searchModules }: Props) {
  const t = useTranslations("shell");
  const tTheme = useTranslations("theme");
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const tabs = items.filter((i) => i.group !== "settings"); // settings live in the dock, not the tabs

  async function onSignOut() {
    await signOut();
    router.replace("/login");
    router.refresh(); // drop the signed-in RSC cache
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-(--gutter) py-3 md:min-h-(--topbar-h) md:flex-nowrap xl:grid xl:grid-cols-[1fr_auto_1fr]">
        <Link href="/app" className="flex items-center gap-2.5 rounded-full">
          <span aria-hidden className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <OrbitIcon className="size-[18px]" strokeWidth={1.6} />
          </span>
          <span className="text-xl font-semibold tracking-tight">{t("brand")}</span>
        </Link>
        <div className="order-last min-w-0 basis-full md:order-none md:basis-auto md:flex-1 xl:flex-none">
          <PillTabs items={tabs} active={activeHref(tabs, pathname)} />
        </div>
        <div className="flex items-center justify-end gap-2 md:flex-none">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={t("account")} className="grid size-9 place-items-center rounded-full bg-pill text-sm font-semibold text-on-pill">
                {user.name.trim().charAt(0).toUpperCase()}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-56">
              <DropdownMenuLabel className="flex flex-col">
                <span className="truncate">{user.name}</span>
                <span className="truncate font-normal text-muted-foreground">{user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{tTheme("label")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                <DropdownMenuRadioItem value="light">{tTheme("light")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">{tTheme("dark")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">{tTheme("system")}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onSignOut}>
                <LogOutIcon className="rtl:rotate-180" />
                {t("signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <Dock items={items} onSearch={() => setPaletteOpen(true)} searchOpen={paletteOpen} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={items} searchModules={searchModules} />
    </>
  );
}
