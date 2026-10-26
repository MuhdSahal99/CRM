import { defineConfig, devices } from "@playwright/test";

const widths = [360, 768, 1440] as const;
const schemes = ["light", "dark"] as const;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: "http://localhost:3100", ...devices["Desktop Chrome"] },
  // ADR-0016: 360 px is the phone baseline; 768 tablet; 1440 desktop.
  projects: widths.flatMap((w) =>
    schemes.map((colorScheme) => ({
      name: `w${w}-${colorScheme}`,
      use: { viewport: { width: w, height: w === 360 ? 740 : 900 }, colorScheme, hasTouch: w === 360, isMobile: w === 360 },
    })),
  ),
  webServer: { command: "pnpm exec next dev -p 3100", url: "http://localhost:3100/design", reuseExistingServer: true, timeout: 180_000 },
});
