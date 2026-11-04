"use client";

// All motion for the glass design system (docs/GLASS_SPEC.md section 7). Every duration goes through d().
// Presets only build tweens; call them inside a useGSAP() callback (from @gsap/react) in a client component so the
// context reverts them on unmount. Nothing here touches the DOM at import time.
import { gsap } from "gsap";
import { CURRENCY_SCALE, type Currency } from "@/lib/format";

type Target = gsap.TweenTarget;

const REDUCED = "(prefers-reduced-motion: reduce)";
const EASE_OUT = "power3.out";

/** True when the user asked for less motion. False on the server. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(REDUCED).matches;
}

/** A duration or delay in seconds, or 0 under prefers-reduced-motion. */
export function d(sec: number): number {
  return prefersReducedMotion() ? 0 : sec;
}

/** Fine pointers only: magnetic and hover effects are off on touch (section 9). */
export function hasFinePointer(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
}

export function routeEnter(header: Target, items?: Target) {
  const tl = gsap.timeline();
  tl.from(header, { x: -14, opacity: 0, duration: d(0.6), ease: EASE_OUT });
  if (items) tl.from(items, { x: -14, opacity: 0, duration: d(0.6), ease: EASE_OUT, stagger: d(0.06) }, ">-0.3");
  return tl;
}

/** Splits the text of `el` into words, each under an overflow-hidden mask, and rises them in. The full text stays in aria-label. */
export function titleWords(el: HTMLElement) {
  const text = el.textContent ?? "";
  if (!el.getAttribute("aria-label")) el.setAttribute("aria-label", text);
  el.textContent = "";
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i, all) => {
      const mask = document.createElement("span");
      mask.style.display = "inline-block";
      mask.style.overflow = "hidden";
      mask.setAttribute("aria-hidden", "true");
      const inner = document.createElement("span");
      inner.style.display = "inline-block";
      inner.textContent = word;
      mask.append(inner);
      el.append(mask);
      if (i < all.length - 1) el.append(" ");
      return inner;
    });
  return gsap.from(words, { yPercent: 115, rotation: 6, duration: d(0.85), ease: "power4.out", stagger: d(0.022) });
}

export function cardsEnter(cards: Target) {
  return gsap.from(cards, { y: 34, scale: 0.985, opacity: 0, duration: d(0.9), ease: EASE_OUT, stagger: d(0.05) });
}

export function tilesPop(tiles: Target) {
  return gsap.from(tiles, {
    scale: 0.94,
    y: 8,
    rotation: () => gsap.utils.random([-1.5, 1.5]),
    opacity: 0,
    duration: d(0.8),
    ease: "back.out(1.4)",
    stagger: d(0.03),
  });
}

export type CountFormat =
  | { kind: "number"; locale: string }
  | { kind: "currency"; locale: string; currency: Currency }
  | { kind: "percent"; locale: string }
  | { kind: "compact"; locale: string };

/** Formats the in-flight value of a count-up. Display only: the settled text is always the server's own string. */
export function formatCount(value: number, f: CountFormat): string {
  const base = { numberingSystem: "latn" } as const;
  switch (f.kind) {
    case "currency": {
      const scale = CURRENCY_SCALE[f.currency];
      return new Intl.NumberFormat(f.locale, {
        ...base,
        style: "currency",
        currency: f.currency,
        currencyDisplay: "code",
        minimumFractionDigits: scale,
        maximumFractionDigits: scale,
      }).format(value);
    }
    case "percent":
      return new Intl.NumberFormat(f.locale, { ...base, style: "percent", maximumFractionDigits: 0 }).format(value / 100);
    case "compact":
      return new Intl.NumberFormat(f.locale, { ...base, notation: "compact", maximumFractionDigits: 1 }).format(value);
    default:
      return new Intl.NumberFormat(f.locale, { ...base, maximumFractionDigits: 0 }).format(value);
  }
}

/** Counts `el` up from 0 to `to`; `finalText` (the server-formatted value) replaces the tween's last frame. */
export function countUp(el: HTMLElement, to: number, format: CountFormat, finalText: string) {
  const state = { v: 0 };
  return gsap.to(state, {
    v: to,
    duration: d(1),
    ease: EASE_OUT,
    onUpdate: () => {
      el.textContent = formatCount(state.v, format);
    },
    onComplete: () => {
      el.textContent = finalText;
    },
  });
}

export function popoverIn(el: Target, origin = "50% 0%") {
  return gsap.fromTo(
    el,
    { scale: 0.94, y: -4, opacity: 0, transformOrigin: origin },
    { scale: 1, y: 0, opacity: 1, duration: d(0.32), ease: "back.out(1.8)" },
  );
}

export function popoverOut(el: Target, onComplete?: () => void) {
  return gsap.to(el, { scale: 0.94, y: -4, opacity: 0, duration: d(0.15), ease: "power2.in", onComplete });
}

/** Phones (< 768px, section 9): modals are bottom sheets and the drawer is full screen. */
export function isPhone(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 767px)").matches;
}

export function modalIn(overlay: Target, panel: Target) {
  const tl = gsap.timeline();
  tl.from(overlay, { opacity: 0, duration: d(0.2) });
  if (isPhone()) tl.add(sheetUp(panel), "<");
  else tl.from(panel, { y: 16, scale: 0.98, opacity: 0, duration: d(0.4), ease: "back.out(1.4)" }, "<");
  return tl;
}

/** `from` is the starting xPercent: 100 slides in from the right, -100 from the left (use the sign that matches the reading direction). */
export function drawerIn(panel: Target, from = 100) {
  return gsap.fromTo(panel, { xPercent: from }, { xPercent: 0, duration: d(0.45), ease: EASE_OUT });
}

/** Phones: a bottom sheet rises from below instead of popping in. */
export function sheetUp(panel: Target) {
  return gsap.fromTo(panel, { yPercent: 100 }, { yPercent: 0, duration: d(0.45), ease: EASE_OUT });
}

export function toastIn(el: Target) {
  return gsap.fromTo(el, { y: -12, opacity: 0 }, { y: 0, opacity: 1, duration: d(0.4), ease: "back.out(2)" });
}

export function toastOut(el: Target, onComplete?: () => void) {
  return gsap.to(el, { y: -8, opacity: 0, duration: d(0.2), ease: "power2.in", onComplete });
}

/** Rects of `els` keyed by `key`, taken just before a drop; pass them to flipFrom once the layout has settled. */
export function snapshotRects(els: Iterable<HTMLElement>, key: (el: HTMLElement) => string) {
  return new Map([...els].map((el) => [key(el), el.getBoundingClientRect()]));
}

/** FLIP: slides each element from its snapshot position to where it now sits (0.35s power3.out). `skip` keys are left alone. */
export function flipFrom(els: Iterable<HTMLElement>, key: (el: HTMLElement) => string, before: Map<string, DOMRect>, skip?: string) {
  for (const el of els) {
    const k = key(el);
    const from = before.get(k);
    if (!from || k === skip) continue;
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (dx || dy) gsap.from(el, { x: dx, y: dy, duration: d(0.35), ease: EASE_OUT, clearProps: "transform" });
  }
}

export function iconTap(svg: Target) {
  return gsap.fromTo(svg, { scale: 0.72 }, { scale: 1, duration: d(0.55), ease: "back.out(3)" });
}

/** Pulls `el` toward the pointer (about 30% of the offset) and springs back on leave. Returns a cleanup. */
export function magnetic(el: HTMLElement): () => void {
  if (!hasFinePointer()) return () => {};
  const x = gsap.quickTo(el, "x", { duration: d(0.5), ease: EASE_OUT });
  const y = gsap.quickTo(el, "y", { duration: d(0.5), ease: EASE_OUT });
  const move = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    x((e.clientX - (r.left + r.width / 2)) * 0.3);
    y((e.clientY - (r.top + r.height / 2)) * 0.3);
  };
  const leave = () => {
    gsap.to(el, { x: 0, y: 0, duration: d(1), ease: "elastic.out(1, 0.5)" });
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerleave", leave);
  return () => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerleave", leave);
    gsap.set(el, { x: 0, y: 0 });
  };
}

/**
 * Tab pill / segmented thumb: tween the two edges separately (leading 0.36s power3.out, trailing 0.1s later) so the
 * pill stretches toward the target; long jumps use one 0.55s power3.inOut. `edges` are the pill's logical start/end
 * insets from the track (px), so callers that measure from the inline-start edge mirror correctly under dir="rtl".
 */
export function edgeTween(edges: { start: number; end: number }, to: { start: number; end: number }, onUpdate: () => void, long = false) {
  if (long) return gsap.to(edges, { start: to.start, end: to.end, duration: d(0.55), ease: "power3.inOut", onUpdate });
  const forward = to.start > edges.start; // moving toward the end: the end edge leads
  const lead = forward ? "end" : "start";
  const trail = forward ? "start" : "end";
  const tl = gsap.timeline({ onUpdate });
  tl.to(edges, { [lead]: to[lead], duration: d(0.36), ease: EASE_OUT }, 0);
  tl.to(edges, { [trail]: to[trail], duration: d(0.36), ease: EASE_OUT }, d(0.1));
  return tl;
}
