import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Local runs read ../../.env.local; CI sets the TEST_* variables directly.
try {
  process.loadEnvFile("../../.env.local");
} catch {}

// Own cache dir: parallel `pnpm -r test` runs otherwise race on the shared root cache (EPERM on Windows).
// Integration tests share crm_test with @crm/db, so packages run one at a time (root `pnpm test`).
export default defineConfig({
  cacheDir: "node_modules/.vitest",
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    globalSetup: [fileURLToPath(import.meta.resolve("@crm/db/test-setup"))],
  },
});
