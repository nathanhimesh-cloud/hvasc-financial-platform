import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so Next doesn't pick up a stray
  // lockfile elsewhere on the machine (e.g. C:\Users\Nathan\package-lock.json).
  turbopack: {
    root: path.join(__dirname),
  },
  // Don't advertise the framework; trim the response a little.
  poweredByHeader: false,
  // Smaller, cheaper deploys: skip browser source maps in prod (this is an
  // internal tool, not something we debug from the client in production).
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
};

export default nextConfig;
