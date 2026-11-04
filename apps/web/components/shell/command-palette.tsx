"use client";

import { Command } from "cmdk";
import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { callApi } from "@/lib/api-client";
import type { NavItem } from "./nav-items";

type Hit = { module: string; id: string; title: string };
export type SearchModule = { module: string; nameFields: string[] };

const GROUP =
  "px-2 pt-2 pb-1 **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1 **:[[cmdk-group-heading]]:text-[11px] **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-[0.08em] **:[[cmdk-group-heading]]:text-muted-foreground";
const ITEM = "flex min-h-10 cursor-pointer items-center gap-2 rounded-full px-3 text-sm data-[selected=true]:bg-accent";

/** ⌘K / Ctrl+K palette: Pages = the nav, Records = /api/v1/{module}/search, Actions = the New-record routes. */
export function CommandPalette({
  open,
  onOpenChange,
  items,
  searchModules,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: NavItem[];
  searchModules: SearchModule[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const word = query.trim();
  useEffect(() => {
    if (word.length < 2) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const found = await Promise.all(
        searchModules.map(async ({ module, nameFields }) => {
          const { status, json } = await callApi("GET", `/${module}/search?word=${encodeURIComponent(word)}&per_page=5`).catch(() => ({ status: 0, json: null }));
          if (status !== 200) return []; // e.g. 422 when a role may not see the name fields
          return ((json?.data ?? []) as Record<string, unknown>[]).map((r) => ({
            module,
            id: String(r.id),
            title: nameFields.map((f) => r[f]).filter(Boolean).join(" ") || String(r.id),
          }));
        }),
      );
      if (!stale) setHits(found.flat());
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [word, searchModules]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };
  const match = (label: string) => !word || label.toLowerCase().includes(word.toLowerCase());
  const pages = items.filter((i) => match(t(i.labelKey)));
  const actions = items.filter((i) => i.group === "module" && match(t("shell.newModule", { module: t(i.labelKey) })));
  const shown = word.length < 2 ? [] : hits;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setQuery("");
          setHits([]);
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="top-[18%] bottom-auto mt-0 mb-0 gap-0 overflow-hidden p-0 sm:max-w-xl max-md:top-[18%] max-md:bottom-auto max-md:inset-x-4 max-md:mb-0 max-md:w-auto max-md:rounded-card max-md:p-0"
      >
        <DialogTitle className="sr-only">{t("shell.palette.title")}</DialogTitle>
        <DialogDescription className="sr-only">{t("shell.palette.description")}</DialogDescription>
        <Command shouldFilter={false} label={t("shell.palette.title")}>
          <div className="flex items-center gap-2 border-b border-border px-4">
            <SearchIcon className="size-4 text-muted-foreground" aria-hidden />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder={t("shell.palette.placeholder")}
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-80 overflow-y-auto pb-2">
            <Command.Empty className="px-4 py-6 text-center text-sm text-muted-foreground">{t("shell.palette.empty")}</Command.Empty>
            {pages.length > 0 && (
              <Command.Group heading={t("shell.palette.pages")} className={GROUP}>
                {pages.map((i) => (
                  <Command.Item key={i.href} value={i.href} onSelect={() => go(i.href)} className={ITEM}>
                    {t(i.labelKey)}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {shown.length > 0 && (
              <Command.Group heading={t("shell.palette.records")} className={GROUP}>
                {shown.map((h) => (
                  <Command.Item key={`${h.module}:${h.id}`} value={`${h.module}:${h.id}`} onSelect={() => go(`/app/${h.module}/${h.id}`)} className={ITEM}>
                    <span className="min-w-0 flex-1 truncate">{h.title}</span>
                    <span className="text-xs text-muted-foreground">{t(`modules.${h.module}`)}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {actions.length > 0 && (
              <Command.Group heading={t("shell.palette.actions")} className={GROUP}>
                {actions.map((i) => (
                  <Command.Item key={i.href} value={`${i.href}/new`} onSelect={() => go(`${i.href}/new`)} className={ITEM}>
                    {t("shell.newModule", { module: t(i.labelKey) })}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
