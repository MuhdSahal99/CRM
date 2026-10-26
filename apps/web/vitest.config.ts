import { defineConfig } from "vitest/config";

// Unit tests only; e2e/*.spec.ts belong to Playwright.
export default defineConfig({ test: { include: ["**/*.test.{ts,tsx}"], exclude: ["node_modules/**", "e2e/**"] } });
