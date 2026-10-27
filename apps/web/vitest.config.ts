import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Local runs read ../../.env.local; CI sets the TEST_* variables directly.
try {
  process.loadEnvFile("../../.env.local");
} catch {}

// Unit tests plus the visibility matrix (test/), which needs the migrated test database; e2e/*.spec.ts belong to Playwright.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } }, // tsconfig's "@/*", used by route files
  test: {
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "e2e/**", ".next/**"],
    globalSetup: ["test/global-setup.ts"],
  },
});
