"use client";

import { useEffect, useRef, useState } from "react";
import { Orb } from "../ui/Orb";
import { TONE_ACCENTS } from "@/lib/adSpec";

interface Stage {
  key: string;
  tab: string;
  title: string;
  body: string;
  visual: React.ReactNode;
}

function InputsVisual() {
  const rows: [string, string][] = [
    ["title", '"Aero Runner"'],
    ["audience", '"Runners"'],
    ["price", '"$148"'],
    ["format", '"16:9 · 9:16"'],
    ["length", '"10s"'],
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
    ["0–3s", "hook"],
    ["3–6s", "product hero"],
    ["6–8s", "feature"],
    ["8–10s", "brand sign-off"],
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
          {["1080p", "16:9", "10s"].map((c) => (
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
      {["Download MP4", "TikTok Ads", "Meta Ads Manager"].map((d, i) => (
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
    key: "upload",
    tab: "Upload",
    title: "Start with a product photo.",
    body: "Drop in your product image and a few words: title, audience, price, length. No URL, no scraping, no asset library to wrangle.",
    visual: <InputsVisual />,
  },
  {
    key: "write",
    tab: "Write",
    title: "Writes the copy, picks the look.",
    body: "AI writes a hook, headline and CTA, then Dart picks the palette, type and layout to fit your brand and the audience you choose.",
    visual: <ScriptVisual />,
  },
  {
    key: "render",
    tab: "Render",
    title: "Renders in your browser.",
    body: "Dart removes the product background, loads real fonts and renders every format with WebCodecs, all free, and nothing leaves your machine until you publish.",
    visual: <RenderVisual />,
  },
  {
    key: "export",
    tab: "Export",
    title: "Save, download, hand off.",
    body: "Every ad saves to your library and plays on any device. Download the MP4, or open a handoff to TikTok, Meta or YouTube.",
    visual: <ExportVisual />,
  },
];

export function PipelineSwitcher() {
  const [active, setActive] = useState(0);
  const stage = STAGES[active];

  // The white pill is one element that slides to the active tab (instead of
  // each tab toggling its own background). Measured off the real buttons so it
  // survives wrapping and resizes.
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    const measure = () => {
      const el = tabRefs.current[active];
      if (!el) return;
      setPill({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (listRef.current) ro.observe(listRef.current);
    return () => ro.disconnect();
  }, [active]);

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
        {/* Tabs — one sliding pill, buttons stay transparent above it */}
        <div
          ref={listRef}
          role="tablist"
          aria-label="Pipeline stages"
          className="relative flex flex-wrap gap-1"
        >
          {pill && (
            <span
              aria-hidden
              className="absolute left-0 top-0 rounded-badge bg-white shadow-[var(--shadow-inset)] transition-[transform,width,height] duration-[260ms] ease-out motion-reduce:transition-none"
              style={{
                transform: `translate(${pill.x}px, ${pill.y}px)`,
                width: pill.w,
                height: pill.h,
              }}
            />
          )}
          {STAGES.map((s, i) => {
            const on = i === active;
            return (
              <button
                key={s.key}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                role="tab"
                aria-selected={on}
                onClick={() => setActive(i)}
                className={
                  "relative z-[1] rounded-badge px-3.5 py-2 text-[14px] font-medium transition-[color,transform] " +
                  "duration-[180ms] ease-out active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink " +
                  (on ? "text-ink" : "text-driftwood hover:text-ink")
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
