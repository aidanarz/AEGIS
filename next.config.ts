import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Generates a standalone build for Docker deployment.
  // The .next/standalone directory contains everything needed to run
  // without the full node_modules tree.
  output: "standalone",
};

export default nextConfig;
