import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/strokes": ["./node_modules/hanzi-writer-data/*.json"],
  },
};

export default nextConfig;
