"use client";

import { useGSAP } from "@gsap/react";
import type { ReactNode } from "react";
import { useRef } from "react";
import { useLocale } from "next-intl";
import type { Currency } from "@/lib/format";
import { cardsEnter, type CountFormat, countUp, tilesPop } from "@/lib/motion";

/** Counts up every `[data-count]` under `root`: data-count="number|percent|currency", data-to, data-currency. The server-rendered markup is restored at the end. */
export function countAll(root: HTMLElement, locale = document.documentElement.lang || "en") {
  root.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
    const kind = el.dataset.count as CountFormat["kind"];
    const format: CountFormat = kind === "currency" ? { kind, locale, currency: el.dataset.currency as Currency } : { kind, locale };
    const html = (el.dataset.final ??= el.innerHTML); // kept across a dev double-run, which would otherwise capture a mid-count frame
    countUp(el, Number(el.dataset.to), format, el.textContent ?? "").eventCallback("onComplete", () => {
      el.innerHTML = html;
    });
  });
}

/** Page body: glass cards enter, tiles pop, `[data-count]` figures count up. Wrap the card grid in it. */
export function MotionScope({ className, children }: { className?: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const locale = useLocale();
  useGSAP(
    () => {
      const r = root.current;
      if (!r) return;
      cardsEnter(r.querySelectorAll("[data-slot=glass-card], figure"));
      tilesPop(r.querySelectorAll("[data-slot=tile]"));
      countAll(r, locale);
    },
    { scope: root },
  );
  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
