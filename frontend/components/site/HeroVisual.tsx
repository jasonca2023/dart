"use client";

import dynamic from "next/dynamic";
import { useReducedMotion } from "@/lib/hooks";
import { Orb } from "../ui/Orb";

// WebGL is client-only; code-split it so it never ships to the server bundle.
// While it loads (or if WebGL is unavailable), the CSS orb stands in.
const HeroScene = dynamic(
  () => import("./HeroScene").then((m) => m.HeroScene),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center">
        <Orb tone="cinematic" className="size-40" />
      </div>
    ),
  },
);

export function HeroVisual() {
  const reduced = useReducedMotion();
  return (
    <div className="hero-canvas">
      <HeroScene reduced={reduced} />
    </div>
  );
}
