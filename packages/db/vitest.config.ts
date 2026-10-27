import { defineConfig } from "vitest/config";

// Local runs read ../../.env.local; CI sets the TEST_* variables directly.
try {
  process.loadEnvFile("../../.env.local");
} catch {}

// Own cache dir: parallel `pnpm -r test` runs otherwise race on the shared root cache (EPERM on Windows).
export default defineConfig({
  cacheDir: "node_modules/.vitest",
  test: { include: ["src/**/*.test.ts", "test/**/*.test.ts"], globalSetup: ["test/global-setup.ts"] },
});
