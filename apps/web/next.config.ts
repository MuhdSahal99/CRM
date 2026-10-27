import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Next reads .env* only from apps/web; the monorepo keeps one .env.local at the root. Never overrides real env vars.
try {
  process.loadEnvFile(new URL("../../.env.local", import.meta.url));
} catch {}

const nextConfig: NextConfig = { devIndicators: false, transpilePackages: ["@crm/core", "@crm/db"] };

export default createNextIntlPlugin()(nextConfig);
