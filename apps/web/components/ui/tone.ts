// The four semantic roles (GLASS_SPEC 1): a colour always means the same thing. Class maps keep components token-only.
export type Tone = "sky" | "lime" | "coral" | "ink";

export const TONE_BG: Record<Tone, string> = { sky: "bg-sky", lime: "bg-lime", coral: "bg-coral", ink: "bg-ink" };
export const TONE_STROKE: Record<Tone, string> = { sky: "stroke-sky", lime: "stroke-lime", coral: "stroke-coral", ink: "stroke-ink" };
