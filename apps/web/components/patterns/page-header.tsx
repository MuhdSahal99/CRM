"use client";

import { useGSAP } from "@gsap/react";
import type { ReactNode } from "react";
import { useRef } from "react";
import { useLocale } from "next-intl";
import { routeEnter, tilesPop, titleWords } from "@/lib/motion";
import { countAll } from "./motion-scope";

/** GLASS_SPEC 5: two-line title, up to 3 StatChips, actions at the inline end (primary CTA in lime). Stats wrap below the title on small screens. */
export function PageHeader({ title, stats, actions }: { title: [string, string]; stats?: ReactNode; actions?: ReactNode }) {
  const root = useRef<HTMLElement>(null);
  const locale = useLocale();
  useGSAP(
    () => {
      const r = root.current;
      if (!r) return;
      const lines = r.querySelectorAll<HTMLElement>("[data-title-line]");
      routeEnter(r.querySelector("h1"), r.querySelectorAll("[data-header-item]"));
      lines.forEach((l) => titleWords(l));
      tilesPop(r.querySelectorAll("[data-slot=stat-chip]"));
      countAll(r, locale);
    },
    { scope: root },
  );
  return (
    <header ref={root} className="flex flex-wrap items-center gap-x-10 gap-y-4">
      <h1 aria-label={`${title[0]} ${title[1]}`} className="text-[30px] leading-[1.05] font-semibold tracking-[-0.02em] md:text-[34px]">
        <span data-title-line className="block">{title[0]}</span>
        <span data-title-line className="block">{title[1]}</span>
      </h1>
      {stats && (
        <div data-header-item className="flex flex-wrap items-center gap-x-10 gap-y-4">
          {stats}
        </div>
      )}
      {actions && (
        <div data-header-item className="ms-auto flex flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}
