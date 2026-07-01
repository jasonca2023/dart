"use client";

import { useEffect, useRef, useState } from "react";
import { LaunchForm } from "./LaunchForm";
import { StoreCampaign } from "./StoreCampaign";

// The signed-in "make an ad" surface: one product (upload a photo) or a whole store
// (import the catalogue and render an ad for every product).
export function Generate() {
  const [mode, setMode] = useState<"one" | "store">("one");
  const groupRef = useRef<HTMLDivElement | null>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  // The white thumb slides under the active option instead of jumping.
  const activeIndex = mode === "one" ? 0 : 1;
  useEffect(() => {
    const measure = () => {
      const el = groupRef.current?.querySelectorAll("button")[activeIndex];
      if (!el) return;
      setThumb({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeIndex]);

  return (
    <>
      <div className="mb-8">
        <h1 className="t-heading">New ad{mode === "store" ? "s" : ""}</h1>
        <p className="mt-2 max-w-xl text-[16px] text-driftwood">
          {mode === "one"
            ? "Upload a product photo. Get a short, polished animated ad, rendered in your browser."
            : "Paste your store URL and make an on-brand ad for every product at once."}
        </p>
        <div
          ref={groupRef}
          className="relative mt-5 inline-flex rounded-full border border-ash bg-sand p-1"
        >
          {thumb && (
            <span
              aria-hidden
              className="absolute top-1 bottom-1 rounded-full bg-white shadow-[var(--shadow-inset)] transition-[left,width] duration-300 ease-out motion-reduce:transition-none"
              style={{ left: thumb.left, width: thumb.width }}
            />
          )}
          {([
            ["one", "One ad"],
            ["store", "From your store"],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setMode(v)}
              aria-pressed={mode === v}
              className={
                "relative rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors duration-150 ease-out " +
                (mode === v ? "text-ink" : "text-driftwood hover:text-ink")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {mode === "one" ? <LaunchForm /> : <StoreCampaign />}
    </>
  );
}
