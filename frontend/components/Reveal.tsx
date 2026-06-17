"use client";

import type { ReactNode } from "react";
import { useReveal } from "@/lib/hooks";

// Wraps a section so it fades + rises into view once. Spatial motion is dropped
// under prefers-reduced-motion (handled in globals.css).
export function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} data-reveal className={className}>
      {children}
    </div>
  );
}
