import { BaseSequencer, type TestSpecification } from "vitest/node";

// deals-fx asserts that INR has no rate yet and owns today's AED rate, but the files share one org and rates cannot be deleted
// (insert-only grant), so it must run before any file that posts rates. Vitest otherwise reorders by past failures and durations.
// shortcut: one named file runs first, move deals-fx onto its own org when a second such file appears.
export default class FirstDealsFx extends BaseSequencer {
  async sort(files: TestSpecification[]) {
    const sorted = await super.sort(files);
    const first = (f: TestSpecification) => f.moduleId.endsWith("deals-fx.test.ts");
    return [...sorted.filter(first), ...sorted.filter((f) => !first(f))];
  }
}
