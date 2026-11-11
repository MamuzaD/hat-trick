"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import dynamic from "next/dynamic";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = url ? new ConvexReactClient(url) : null;

// Client-only: the page is entirely live data, and this keeps time-based
// state (honest phase, "last calibrated") free of hydration mismatches.
const HatTrick = dynamic(() => import("./HatTrick"), { ssr: false });

export default function ClientApp() {
  if (!convex) {
    return (
      <p className="p-8 font-mono text-denim-200">
        NEXT_PUBLIC_CONVEX_URL is not set. Run <code>npx convex dev</code> first.
      </p>
    );
  }
  return (
    <ConvexProvider client={convex}>
      <HatTrick />
    </ConvexProvider>
  );
}
