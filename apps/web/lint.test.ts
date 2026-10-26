import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Guards ADR-0016. Note: the i18n rule skips values bound to ALL_CAPS names (treated as constants).
// The physical-class regex once broke silently (esquery drops "\s"), so pin it here.
const lint = async (code: string) => {
  const [result] = await new ESLint().lintText(code, { filePath: "components/probe.tsx" });
  return result.messages.map((m) => m.ruleId);
};

describe("i18n / RTL lint guards", () => {
  it("rejects literal UI text and user-facing attributes", async () => {
    const rules = await lint(`export const Probe = () => <button aria-label="Close">Save</button>;`);
    expect(rules.filter((r) => r === "i18next/no-literal-string")).toHaveLength(2);
  });

  it.each(["ml-2", "md:pr-4", "right-0", "text-left", "border-l", "-mr-1"])("rejects physical class %s", async (cls) => {
    expect(await lint(`export const Probe = () => <p className="p-2 ${cls}">{1}</p>;`)).toContain("no-restricted-syntax");
    expect(await lint(`import { cn } from "@/lib/utils";\nexport const Probe = () => <p className={cn("${cls}")}>{1}</p>;`)).toContain(
      "no-restricted-syntax",
    );
  });

  it("allows logical classes and Radix side variants", async () => {
    const code = `export const Probe = () => <p className="ms-2 pe-4 end-0 text-end border-s data-[side=left]:slide-in-from-right-2">{1}</p>;`;
    expect(await lint(code)).toEqual([]);
  });
});
