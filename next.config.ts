import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a second dev server run beside `pnpm dev` without fighting over .next/dev's lock.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
