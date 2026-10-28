import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Local runs read ../../.env.local; CI sets the TEST_* variables directly.
try {
  process.loadEnvFile("../../.env.local");
} catch {}

// Own cache dir and one package at a time: the integration tests share crm_test (root `pnpm test` runs packages in turn).
export default defineConfig({
  cacheDir: "node_modules/.vitest",
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    globalSetup: [fileURLToPath(import.meta.resolve("@crm/db/test-setup"))],
  },
});
