import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Reads the real tokens from globals.css, so editing a colour or a glass opacity cannot silently break contrast.
// Worst case: the photo behind the wash is as dark (#1f1f1f) or as bright (#e0e0e0) as it will ever be. Numbers: docs/DESIGN_SYSTEM.md.
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replaceAll("\r\n", "\n");

type RGBA = [number, number, number, number];
const hex = (h: string): RGBA => {
  const n = parseInt(h.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, h.length >= 9 ? parseInt(h.slice(7, 9), 16) / 255 : 1];
};
const over = (top: RGBA, bottom: RGBA): RGBA => [0, 1, 2].map((i) => top[i]! * top[3] + bottom[i]! * (1 - top[3])).concat(1) as RGBA;
const lum = (c: RGBA) => {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const ratio = (a: RGBA, b: RGBA) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

/** Token values declared in the block that starts with `selector`. */
function tokens(selector: string) {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("\n}", start));
  return (name: string) => {
    const m = body.match(new RegExp(`--${name}: (#[0-9a-fA-F]{3,8});`));
    if (!m) throw new Error(`--${name} not found in ${selector}`);
    return hex(m[1]!);
  };
}
/** The first colour stop of the wash gradient. */
const washOf = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  const m = css.slice(start, css.indexOf("\n}", start)).match(/--wash: linear-gradient\(180deg, (#[0-9a-fA-F]{8})/);
  return hex(m![1]!);
};

const LIGHT = ':root,\n[data-theme="light"]';

describe.each([
  ['[data-theme="light"]', ":root,\n[data-theme=\"light\"]"],
  ['[data-theme="dark"]', '[data-theme="dark"]'],
] as const)("%s", (_name, selector) => {
  const t = tokens(selector === '[data-theme="dark"]' ? selector : ":root,\n[data-theme=\"light\"]");
  const wash = washOf(selector === '[data-theme="dark"]' ? selector : ":root,\n[data-theme=\"light\"]");
  const photos: RGBA[] = [[31, 31, 31, 1], [224, 224, 224, 1]];

  const surfaces = (photo: RGBA) => {
    const base = over(wash, photo);
    const glass = over(t("glass"), base);
    return { glass, "glass-2": over(t("glass-2"), glass), tile: over(t("glass-tile"), base), "glass+well": over(t("well"), glass) };
  };

  for (const text of ["text", "muted", "faint"]) {
    for (const surface of ["glass", "glass-2", "tile", "glass+well"] as const) {
      // Faint (captions) and well-on-glass are the tightest; the spec requires 4.5:1 for all body text.
      it(`--${text} on ${surface} is at least 4.5:1`, () => {
        const worst = Math.min(...photos.map((p) => ratio(t(text), surfaces(p)[surface])));
        expect(worst).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
  it("on-pill on the pill and on-accent on the accent", () => {
    const shared = tokens(LIGHT); // the lime accent is one value in both themes
    expect(ratio(shared("on-accent"), shared("accent"))).toBeGreaterThanOrEqual(4.5);
    const pill = Math.min(...photos.map((p) => ratio(t("on-pill"), over(t("pill"), surfaces(p).glass))));
    expect(pill).toBeGreaterThanOrEqual(4.5);
  });
  it("good and bad text on floating layers", () => {
    for (const c of ["good", "bad"]) expect(ratio(t(c), t("float"))).toBeGreaterThanOrEqual(4.5);
  });
});
