"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/hooks";
import { Orb } from "../ui/Orb";
import { TONE_ACCENTS } from "@/lib/adSpec";

// WebGL is client-only; code-split it so it never ships to the server bundle.
// While it loads (or if WebGL is unavailable), the CSS orb stands in.
const HeroScene = dynamic(
  () => import("./HeroScene").then((m) => m.HeroScene),
  {
    ssr: false,
    loading: () => <CssOrb />,
  },
);

function CssOrb() {
  return (
    <div className="grid h-full place-items-center">
      <Orb accent={TONE_ACCENTS.energetic} className="size-40" />
    </div>
  );
}

// The dynamic() `loading` fallback only covers chunk download — if WebGL
// context creation itself fails (hardware acceleration off, VMs, remote
// desktops), the renderer throws during mount, and without a boundary that
// unhandled exception replaces the ENTIRE landing page with Next's error
// screen. This boundary scopes the failure to the hero: the CSS orb stands
// in and the rest of the page renders normally.
class HeroErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <CssOrb /> : this.props.children;
  }
}

export function HeroVisual() {
  const reduced = useReducedMotion();
  return (
    <div className="hero-canvas">
      <HeroErrorBoundary>
        <HeroScene reduced={reduced} />
      </HeroErrorBoundary>
    </div>
  );
}
