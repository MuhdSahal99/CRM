// The four semantic roles (GLASS_SPEC 1): a colour always means the same thing. Class maps keep components token-only.
export type Tone = "sky" | "lime" | "coral" | "ink";

export const TONE_BG: Record<Tone, string> = { sky: "bg-sky", lime: "bg-lime", coral: "bg-coral", ink: "bg-ink" };
export const TONE_STROKE: Record<Tone, string> = { sky: "stroke-sky", lime: "stroke-lime", coral: "stroke-coral", ink: "stroke-ink" };

/** Tinted-tile fills (tokens --tint-pct / --tint-base flip per theme; text on a tint stays var(--text)). */
export const TONE_TINT: Record<Tone, string> = {
  sky: "bg-[color-mix(in_srgb,var(--sky)_var(--tint-pct),var(--tint-base))]",
  lime: "bg-[color-mix(in_srgb,var(--lime)_var(--tint-pct),var(--tint-base))]",
  coral: "bg-[color-mix(in_srgb,var(--coral)_var(--tint-pct),var(--tint-base))]",
  ink: "bg-[color-mix(in_srgb,var(--ink)_var(--tint-pct-ink),var(--tint-base))]",
};
