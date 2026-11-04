"use client";

import { NotebookPenIcon, PhoneOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

const clock = (s: number) => {
  const m = Math.floor(s / 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Floating pill for something in progress (e.g. a call): pulsing coral ring dot, the person, a running timer,
 * notes and end buttons. `floating` pins it bottom-centre of the viewport; otherwise it flows where it is placed.
 */
export function LiveBar({ name, startedAt, onEnd, onNotes, floating = false, className }: { name: string; startedAt: number; onEnd: () => void; onNotes?: () => void; floating?: boolean; className?: string }) {
  const t = useTranslations("liveBar");
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return (
    <div
      role="group"
      aria-label={t("label", { name })}
      className={cn("float-glass inline-flex h-14 items-center gap-3 rounded-full ps-5 pe-2", floating && "fixed inset-x-0 bottom-4 z-40 mx-auto w-fit max-w-[calc(100%-2rem)] pb-[env(safe-area-inset-bottom)]", className)}
    >
      <span aria-hidden className="relative grid size-3 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-coral/60" />
        <span className="relative size-2 rounded-full bg-coral" />
      </span>
      <span className="min-w-0 truncate text-sm font-medium">{name}</span>
      <time className="text-sm text-muted-foreground tabular-nums" dateTime={`PT${seconds}S`}>
        {clock(seconds)}
      </time>
      {onNotes && (
        <IconButton variant="fill" label={t("notes")} onClick={onNotes}>
          <NotebookPenIcon />
        </IconButton>
      )}
      <Button variant="secondary" size="sm" className="rounded-full text-coral" onClick={onEnd}>
        <PhoneOffIcon aria-hidden />
        {t("end")}
      </Button>
    </div>
  );
}
