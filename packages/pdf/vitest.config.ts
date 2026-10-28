import { defineConfig } from "vitest/config";

// Pure rendering, no database: own cache dir like the other packages.
export default defineConfig({ cacheDir: "node_modules/.vitest", test: { include: ["src/**/*.test.ts", "src/**/*.test.tsx"] } });
