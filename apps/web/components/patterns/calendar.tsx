"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { TONE_BG, type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

export type CalendarEvent = {
  id: string;
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  /** Already formatted for display, e.g. "09:30". */
  time?: string;
  title: string;
  done?: boolean;
  tone: Tone;
  people?: string[];
};

// Local-time calendar days as YYYY-MM-DD keys; Date(y, m, d) normalises overflow, so +/- days and months just work.
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (k: string) => {
  const [y, m, d] = k.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const weekStart = (d: Date) => addDays(d, -((d.getDay() + 6) % 7)); // Monday

const MAX_CHIPS = 2;
const MONTH_TITLE: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" };
const WEEKDAY: Intl.DateTimeFormatOptions = { weekday: "short" };
const FULL_DATE: Intl.DateTimeFormatOptions = { dateStyle: "full" };

function Chip({ e }: { e: CalendarEvent }) {
  return (
    <li className="flex h-[22px] min-w-0 items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,currentColor_12%,transparent)] px-2 text-[11px]">
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", TONE_BG[e.tone])} />
      {e.time && <span className="shrink-0 tabular-nums opacity-70">{e.time}</span>}
      <span className={cn("truncate", e.done && "line-through opacity-70")}>{e.title}</span>
    </li>
  );
}

/** Month / week grid, Monday first (GLASS_SPEC § Calendar). `today` is injectable so the kit renders the same day everywhere. */
export function Calendar({ events, today: todayKey }: { events: CalendarEvent[]; today?: string }) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const [today] = useState(() => todayKey ?? key(new Date()));
  const [anchor, setAnchor] = useState(() => parse(todayKey ?? key(new Date())));
  const [view, setView] = useState<"month" | "week">("month");

  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { numberingSystem: "latn", ...o });
  const first = view === "month" ? weekStart(new Date(anchor.getFullYear(), anchor.getMonth(), 1)) : weekStart(anchor);
  const count = view === "month" ? 42 : 7;
  const days = Array.from({ length: count }, (_, i) => addDays(first, i));
  const monday = new Date(2024, 0, 1);
  const step = (dir: -1 | 1) => setAnchor((a) => (view === "month" ? new Date(a.getFullYear(), a.getMonth() + dir, 1) : addDays(a, 7 * dir)));
  const byDay = Map.groupBy(events, (e) => e.date);

  return (
    <section aria-label={t("label")} className="glass flex flex-col gap-4 rounded-card p-(--pad)">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="me-auto text-xl font-medium">{fmt(MONTH_TITLE).format(anchor)}</h3>
        <IconButton label={t("prev")} onClick={() => step(-1)}>
          <ChevronLeftIcon className="rtl:rotate-180" />
        </IconButton>
        <IconButton label={t("next")} onClick={() => step(1)}>
          <ChevronRightIcon className="rtl:rotate-180" />
        </IconButton>
        <Button variant="secondary" size="sm" className="rounded-full" onClick={() => setAnchor(parse(today))}>
          {t("today")}
        </Button>
        <Segmented
          label={t("view")}
          value={view}
          onValueChange={(v) => setView(v as "month" | "week")}
          options={[
            { value: "month", label: t("month") },
            { value: "week", label: t("week") },
          ]}
        />
      </header>

      <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-muted-foreground" aria-hidden>
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i}>{fmt(WEEKDAY).format(addDays(monday, i))}</span>
        ))}
      </div>

      <ol className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const k = key(day);
          const list = byDay.get(k) ?? [];
          const isToday = k === today;
          const outside = view === "month" && day.getMonth() !== anchor.getMonth();
          const shown = view === "week" ? list : list.slice(0, MAX_CHIPS);
          const people = [...new Set(list.flatMap((e) => e.people ?? []))];
          return (
            <li
              key={k}
              aria-label={fmt(FULL_DATE).format(day)}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "flex min-w-0 flex-col gap-1 rounded-well p-1.5 sm:p-2",
                view === "month" ? "min-h-20 sm:min-h-28" : "min-h-44",
                isToday ? "bg-ink text-background" : "bg-glass-tile",
                outside && "opacity-50",
              )}
            >
              <div className="flex items-start justify-between gap-1">
                <time dateTime={k} className={cn("grid size-6 place-items-center rounded-full text-[13px] tabular-nums", isToday && "border border-current")}>
                  {day.getDate()}
                </time>
                {people.length > 1 && <AvatarStack names={people} max={2} size="xs" className="hidden sm:inline-flex" />}
              </div>
              <ul className="flex min-w-0 flex-col gap-1">
                {shown.map((e) => (
                  <Chip key={e.id} e={e} />
                ))}
              </ul>
              {list.length > shown.length && (
                <Popover>
                  <PopoverTrigger className="self-start rounded-full px-1 text-[11px] font-medium underline-offset-2 hover:underline">{t("more", { count: list.length - shown.length })}</PopoverTrigger>
                  <PopoverContent className="text-foreground" align="start">
                    <p className="px-2 pb-1.5 text-xs text-muted-foreground">{fmt(FULL_DATE).format(day)}</p>
                    <ul className="flex flex-col gap-1">
                      {list.map((e) => (
                        <Chip key={e.id} e={e} />
                      ))}
                    </ul>
                  </PopoverContent>
                </Popover>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
