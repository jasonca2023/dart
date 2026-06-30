"use client";

import { useState } from "react";
import { LaunchForm } from "./LaunchForm";
import { StoreCampaign } from "./StoreCampaign";

// The signed-in "make an ad" surface: one product (upload a photo) or a whole store
// (import the catalogue and render an ad for every product).
export function Generate() {
  const [mode, setMode] = useState<"one" | "store">("one");
  return (
    <>
      <div className="mb-8">
        <h1 className="t-heading">New ad{mode === "store" ? "s" : ""}</h1>
        <p className="mt-2 max-w-xl text-[16px] text-driftwood">
          {mode === "one"
            ? "Upload a product photo. Get a short, polished animated ad, rendered in your browser."
            : "Paste your store URL and make an on-brand ad for every product at once."}
        </p>
        <div className="mt-5 inline-flex rounded-full border border-ash bg-sand p-1">
          {([
            ["one", "One ad"],
            ["store", "From your store"],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setMode(v)}
              className={
                "rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors duration-150 ease-out " +
                (mode === v
                  ? "bg-white text-ink shadow-[var(--shadow-inset)]"
                  : "text-driftwood hover:text-ink")
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
