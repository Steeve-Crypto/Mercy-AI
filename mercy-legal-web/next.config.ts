import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
