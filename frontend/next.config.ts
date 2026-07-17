import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Nothing in the app uses next/image (product/logo images render through
  // plain <img> against the backend proxy), so the optimizer endpoint is
  // disabled outright. The previous config allowed hostname "**", which —
  // depending on how the Workers runtime wires /_next/image — risked exposing
  // an open image proxy anyone could point at arbitrary URLs.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
