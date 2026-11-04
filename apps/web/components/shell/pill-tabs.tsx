"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useGSAP } from "@gsap/react";
import { edgeTween } from "@/lib/motion";
import type { NavItem } from "./nav-items";

/** The tab whose href is the longest prefix of the path; Home matches only itself. */
export function activeHref(items: NavItem[], pathname: string) {
  return items
    .filter((i) => (i.href === "/app" ? pathname === "/app" : pathname === i.href || pathname.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

/** Glass pill tab bar. A second copy of the labels (in the pill's colour) is clipped to the pill's rect, so the text flips exactly at the pill's edge. */
export function PillTabs({ items, active }: { items: NavItem[]; active?: string }) {
  const t = useTranslations();
  const rtl = useLocale() === "ar";
  const track = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const edges = useRef<{ start: number; end: number } | null>(null);
  const index = items.findIndex((i) => i.href === active);

  // Insets of the active tab from the track's inline-start / inline-end edges, so the maths is the same in RTL.
  const measure = () => {
    const el = track.current?.querySelectorAll<HTMLElement>("[data-tab]")[index];
    if (!track.current || !el) return null;
    const w = track.current.offsetWidth;
    const start = rtl ? w - (el.offsetLeft + el.offsetWidth) : el.offsetLeft;
    return { start, end: w - start - el.offsetWidth };
  };
  const paint = () => {
    const e = edges.current;
    if (!e || !pill.current || !copy.current) return;
    pill.current.style.insetInlineStart = `${e.start}px`;
    pill.current.style.insetInlineEnd = `${e.end}px`;
    // clip-path insets are physical: the inline-start edge is the right edge under RTL.
    copy.current.style.clipPath = `inset(0 ${rtl ? e.start : e.end}px 0 ${rtl ? e.end : e.start}px round 999px)`;
  };

  const prev = useRef(-1);
  useGSAP(
    () => {
      const to = measure();
      if (!to) {
        edges.current = null;
        if (pill.current) pill.current.style.opacity = "0";
        if (copy.current) copy.current.style.clipPath = "inset(0 50% 0 50%)";
        prev.current = -1;
        return;
      }
      if (pill.current) pill.current.style.opacity = "1";
      if (!edges.current || prev.current < 0) edges.current = to;
      else edgeTween(edges.current, to, paint, Math.abs(index - prev.current) > 2);
      prev.current = index;
      paint();
      track.current?.querySelectorAll<HTMLElement>("[data-tab]")[index]?.scrollIntoView({ inline: "nearest", block: "nearest" });
    },
    { dependencies: [index, rtl], scope: track },
  );

  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const to = measure();
      if (to) {
        edges.current = to;
        paint();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  });
  useEffect(() => {
    // Web fonts change label widths after first paint.
    void document.fonts?.ready.then(() => {
      const to = measure();
      if (to) {
        edges.current = to;
        paint();
      }
    });
  });

  const labels = (hidden: boolean) =>
    items.map((item) => (
      <Link
        key={item.href}
        href={item.href}
        data-tab={hidden ? undefined : ""}
        aria-current={!hidden && item.href === active ? "page" : undefined}
        tabIndex={hidden ? -1 : undefined}
        className={`flex h-9 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium ${hidden ? "text-on-pill" : "text-muted-foreground hover:text-foreground"}`}
      >
        {t(item.labelKey)}
      </Link>
    ));

  return (
    <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-xl:[mask-image:linear-gradient(to_right,transparent,#000_16px,#000_calc(100%-16px),transparent)]">
      <nav aria-label={t("shell.nav")} className="mx-auto w-fit">
        <div ref={track} className="glass relative flex w-max items-center gap-0 rounded-full p-1">
          <span ref={pill} aria-hidden className="absolute inset-y-1 rounded-full bg-pill opacity-0" />
          {labels(false)}
          <div ref={copy} aria-hidden className="pointer-events-none absolute inset-0 flex items-center p-1" style={{ clipPath: "inset(0 50% 0 50%)" }}>
            {labels(true)}
          </div>
        </div>
      </nav>
    </div>
  );
}
