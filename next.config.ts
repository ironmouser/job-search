import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['crawlee', 'puppeteer', '@crawlee/puppeteer', 'playwright', '@crawlee/playwright'],
};

export default nextConfig;
