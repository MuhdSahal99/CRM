"use client";

import { CalendarCheckIcon, PlusIcon, SearchIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-items";

const BTN = "relative grid size-10 shrink-0 place-items-center rounded-full text-foreground transition-colors duration-(--dur) ease-glass hover:bg-accent pointer-coarse:size-11";

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  const rtl = useLocale() === "ar";
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={rtl ? "left" : "right"} sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function Dot() {
  return <span aria-hidden className="absolute inset-x-0 bottom-0.5 mx-auto size-1 rounded-full bg-primary" />;
}

/** Search, Create, Today, then Settings and theme. Inline-start rail on desktop, a bottom glass bar on phones. */
export function Dock({ items, onSearch, searchOpen }: { items: NavItem[]; onSearch: () => void; searchOpen: boolean }) {
  const t = useTranslations("shell");
  const tt = useTranslations();
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  const modules = items.filter((i) => i.group === "module");
  const settings = items.find((i) => i.group === "settings");
  const inSettings = pathname.startsWith("/app/settings");
  const today = pathname === "/app/activities";
  const on = (active: boolean) => cn(BTN, active && "bg-accent");

  return (
    <aside
      aria-label={t("dock")}
      className="glass fixed z-40 flex items-center gap-1 rounded-full p-2 max-md:inset-x-3 max-md:bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-md:justify-around md:inset-s-4 md:top-1/2 md:w-(--dock-w) md:-translate-y-1/2 md:flex-col md:rounded-dock md:py-2.5"
    >
      <Tip label={t("search")}>
        <button type="button" aria-label={t("search")} aria-keyshortcuts="Control+K Meta+K" onClick={onSearch} className={on(searchOpen)}>
          <SearchIcon className="size-[18px]" strokeWidth={1.6} />
          {searchOpen && <Dot />}
        </button>
      </Tip>
      {modules.length > 0 && (
        <DropdownMenu open={createOpen} onOpenChange={setCreateOpen}>
          <Tip label={t("create")}>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={t("create")} className={on(createOpen)}>
                <PlusIcon className="size-[18px]" strokeWidth={1.6} />
                {createOpen && <Dot />}
              </button>
            </DropdownMenuTrigger>
          </Tip>
          <DropdownMenuContent side="top" align="center" className="w-auto min-w-44">
            {modules.map((m) => (
              <DropdownMenuItem key={m.href} asChild>
                <Link href={`${m.href}/new`}>{t("newModule", { module: tt(m.labelKey) })}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Tip label={t("today")}>
        <Link href="/app/activities" aria-label={t("today")} aria-current={today ? "page" : undefined} className={on(today)}>
          <CalendarCheckIcon className="size-[18px]" strokeWidth={1.6} />
          {today && <Dot />}
        </Link>
      </Tip>
      <div aria-hidden className="mx-1 h-6 w-px bg-border md:mx-0 md:h-px md:w-6" />
      {settings && (
        <Tip label={t("settings")}>
          <Link href={settings.href} aria-label={t("settings")} aria-current={inSettings ? "page" : undefined} className={on(inSettings)}>
            <SettingsIcon className="size-[18px]" strokeWidth={1.6} />
            {inSettings && <Dot />}
          </Link>
        </Tip>
      )}
      <ThemeToggle />
    </aside>
  );
}
