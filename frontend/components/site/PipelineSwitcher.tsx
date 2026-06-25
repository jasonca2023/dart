"use client";

import { useState } from "react";
import { Orb } from "../ui/Orb";
import { TONE_ACCENTS } from "@/lib/adSpec";

interface Stage {
  key: string;
  tab: string;
  title: string;
  body: string;
  visual: React.ReactNode;
}

function ScrapeVisual() {
  const rows: [string, string][] = [
    ["title", '"Aero Runner"'],
    ["price", "14800"],
    ["currency", '"USD"'],
    ["specs.weight", '"238 g"'],
    ["source", '"shopify"'],
  ];
  return (
    <div className="font-mono text-[13px] leading-[1.7] text-driftwood">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-3">
          <span className="text-fog">{k}</span>
          <span className="text-ink">{v}</span>
        </div>
      ))}
    </div>
  );
}

function ScriptVisual() {
  const scenes: [string, string][] = [
    ["0–3s", "slow push-in"],
    ["3–6s", "orbit-left"],
    ["6–8s", "handheld follow"],
    ["8–10s", "locked-off hero"],
  ];
  return (
    <ul className="flex flex-col gap-2.5">
      {scenes.map(([t, c]) => (
        <li key={t} className="flex items-center gap-3 text-[14px]">
          <span className="w-14 font-mono text-[12px] text-fog">{t}</span>
          <span className="h-px flex-1 bg-ash" />
          <span className="text-ink">{c}</span>
        </li>
      ))}
    </ul>
  );
}

function RenderVisual() {
  return (
    <div className="flex items-center gap-5">
      <Orb accent={TONE_ACCENTS.techy} className="size-20 shrink-0" float={false} />
      <div className="flex-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ash">
          <div className="h-full w-full rounded-full bg-ink" />
        </div>
        <div className="mt-3 flex gap-2">
          {["2160p", "16:9", "10s"].map((c) => (
            <span
              key={c}
              className="rounded-full border border-ash bg-white px-2.5 py-1 font-mono text-[11px] text-driftwood"
            >
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExportVisual() {
  return (
    <div className="flex flex-wrap gap-2.5">
      {["Download 4K", "TikTok Ads", "Meta Ads Manager"].map((d, i) => (
        <span
          key={d}
          className={
            "rounded-full px-3.5 py-2 text-[13px] font-medium " +
            (i === 0
              ? "bg-ink text-parchment"
              : "border border-ash bg-white text-ink")
          }
        >
          {d}
        </span>
      ))}
    </div>
  );
}

const STAGES: Stage[] = [
  {
    key: "scrape",
    tab: "Scrape",
    title: "Reads the page like a buyer would.",
    body: "Dart pulls the title, price, specs and hero image straight from the product URL — Shopify, Amazon, or any page with structured data. No image, no job.",
    visual: <ScrapeVisual />,
  },
  {
    key: "script",
    tab: "Script",
    title: "Directs the scene before a frame is shot.",
    body: "A multimodal model turns the product into a shot list — camera moves, timing and a hero beat — tuned to the audience you choose. Structured, not prose.",
    visual: <ScriptVisual />,
  },
  {
    key: "render",
    tab: "Render",
    title: "Films it in 4K.",
    body: "The shot list and the product image go to the video engine. Dart polls until the cut lands and stores the artifact — and the cost — against the job.",
    visual: <RenderVisual />,
  },
  {
    key: "export",
    tab: "Export",
    title: "Review, then publish on your terms.",
    body: "Preview the cut with the exact script and product data behind it. Regenerate if it misses. Hand off to TikTok or Meta — or just download the file.",
    visual: <ExportVisual />,
  },
];

export function PipelineSwitcher() {
  const [active, setActive] = useState(0);
  const stage = STAGES[active];

  return (
    <section
      id="pipeline"
      className="mx-auto max-w-[var(--page-max)] scroll-mt-20 px-5 py-20 sm:px-8"
    >
      <div className="mb-8 max-w-2xl">
        <p className="t-caption text-driftwood">The pipeline</p>
        <h2 className="t-heading mt-3">Four stages, one click.</h2>
      </div>

      <div className="rounded-card-lg bg-sand p-3 sm:p-4">
        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Pipeline stages"
          className="flex flex-wrap gap-1"
        >
          {STAGES.map((s, i) => {
            const on = i === active;
            return (
              <button
                key={s.key}
                role="tab"
                aria-selected={on}
                onClick={() => setActive(i)}
                className={
                  "rounded-badge px-3.5 py-2 text-[14px] font-medium transition-[background-color,color,box-shadow,transform] " +
                  "duration-[180ms] ease-out active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink " +
                  (on
                    ? "bg-white text-ink shadow-[var(--shadow-inset)]"
                    : "text-driftwood hover:text-ink")
                }
              >
                <span className="mr-1.5 font-mono text-[11px] text-fog">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {s.tab}
              </button>
            );
          })}
        </div>

        {/* Panel */}
        <div
          key={stage.key}
          className="dart-fade mt-3 grid gap-6 rounded-card bg-white p-6 sm:grid-cols-2 sm:p-8"
        >
          <div className="flex flex-col justify-center">
            <h3 className="font-display text-[24px] font-light leading-tight tracking-tight text-ink">
              {stage.title}
            </h3>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-driftwood">
              {stage.body}
            </p>
          </div>
          <div className="flex min-h-32 items-center rounded-[14px] bg-sand p-6">
            {stage.visual}
          </div>
        </div>
      </div>
    </section>
  );
}
