import { defineConfig } from "vitest/config";

// Own cache dir: parallel `pnpm -r test` runs otherwise race on the shared root cache (EPERM on Windows).
export default defineConfig({ cacheDir: "node_modules/.vitest", test: { include: ["src/**/*.test.ts", "test/**/*.test.ts"] } });
