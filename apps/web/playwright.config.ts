import { defineConfig, devices } from "@playwright/test";

// Seed credentials for the sign-in tests live in the root .env.local (CI sets them directly).
try {
  process.loadEnvFile(new URL("../../.env.local", import.meta.url));
} catch {}

const BASE_URL = "http://localhost:3100";
const widths = [360, 768, 1440] as const;
const schemes = ["light", "dark"] as const;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: BASE_URL, ...devices["Desktop Chrome"] },
  // ADR-0016: 360 px is the phone baseline; 768 tablet; 1440 desktop.
  projects: widths.flatMap((w) =>
    schemes.map((colorScheme) => ({
      name: `w${w}-${colorScheme}`,
      use: { viewport: { width: w, height: w === 360 ? 740 : 900 }, colorScheme, hasTouch: w === 360, isMobile: w === 360 },
    })),
  ),
  // Better Auth trusts only BETTER_AUTH_URL's origin for sign-in, so the test server's own origin must be it.
  webServer: {
    command: "pnpm exec next dev -p 3100",
    url: `${BASE_URL}/design`,
    env: { BETTER_AUTH_URL: BASE_URL },
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
