import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = { devIndicators: false };

export default createNextIntlPlugin()(nextConfig);
