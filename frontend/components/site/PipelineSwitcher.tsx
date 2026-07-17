"use client";

import { useId, useState } from "react";
import { Orb } from "../ui/Orb";
import { TONE_ACCENTS } from "@/lib/adSpec";
import { useSlidingPill } from "@/lib/useSlidingPill";

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
    <div className="font-mono text-[13px] leading-[1.7] text-moth">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-3">
          <span className="text-dusk">{k}</span>
          <span className="text-linen">{v}</span>
        </div>
      ))}
    </div>
  );
}

function ScriptVisual() {
  const scenes: [string, string][] = [
    ["0s", "hook"],
    ["3s", "product hero"],
    ["6s", "feature"],
    ["8s", "brand sign-off"],
  ];
  return (
    <ul className="flex flex-col gap-2.5">
      {scenes.map(([t, c]) => (
        <li key={t} className="flex items-center gap-3 text-[14px]">
          <span className="w-14 font-mono text-[12px] text-dusk">{t}</span>
          <span className="h-px flex-1 bg-seam" />
          <span className="text-linen">{c}</span>
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
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-seam">
          <div className="h-full w-full rounded-full bg-linen" />
        </div>
        <div className="mt-3 flex gap-2">
          {["1080p", "16:9", "10s"].map((c) => (
            <span
              key={c}
              className="rounded-full border border-seam bg-night-3 px-2.5 py-1 font-mono text-[11px] text-moth"
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
              ? "bg-linen text-night"
              : "border border-seam bg-night-3 text-linen")
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
  const baseId = useId();
  const tabId = (i: number) => `${baseId}-tab-${i}`;
  const panelId = `${baseId}-panel`;

  // The elevated pill is one element that slides to the active tab (instead of
  // each tab toggling its own background), measured off the real buttons.
  const { listRef, btnRefs: tabRefs, pill } = useSlidingPill<HTMLDivElement>(active);

  // The ARIA tabs pattern requires roving focus: arrow keys move between tabs
  // (activating as they go — there are no side effects to defer), Home/End
  // jump to the extremes, and only the active tab is in the tab order.
  const onTablistKeyDown = (e: React.KeyboardEvent) => {
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      next = (active + 1) % STAGES.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      next = (active - 1 + STAGES.length) % STAGES.length;
    } else if (e.key === "Home") {
      next = 0;
    } else if (e.key === "End") {
      next = STAGES.length - 1;
    }
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section
      id="pipeline"
      className="mx-auto max-w-[var(--page-max)] scroll-mt-20 px-5 py-20 sm:px-8"
    >
      <div className="mb-8 max-w-2xl">
        <h2 className="t-heading">Four stages, one click.</h2>
      </div>

      <div className="rounded-card-lg bg-night-2 p-3 sm:p-4">
        {/* Tabs — one sliding pill, buttons stay transparent above it */}
        <div
          ref={listRef}
          role="tablist"
          aria-label="Pipeline stages"
          onKeyDown={onTablistKeyDown}
          className="relative flex flex-wrap gap-1"
        >
          {pill && (
            <span
              aria-hidden
              className="absolute left-0 top-0 rounded-badge bg-night-3 transition-[transform,width,height] duration-[260ms] ease-out motion-reduce:transition-none"
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
                id={tabId(i)}
                aria-selected={on}
                aria-controls={panelId}
                tabIndex={on ? 0 : -1}
                onClick={() => setActive(i)}
                className={
                  "relative z-[1] rounded-badge px-3.5 py-2 text-[14px] font-medium transition-[color,transform] " +
                  "duration-[180ms] ease-out active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-linen " +
                  (on ? "text-linen" : "text-moth hover:text-linen")
                }
              >
                <span className="mr-1.5 font-mono text-[11px] text-dusk">
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
          role="tabpanel"
          id={panelId}
          aria-labelledby={tabId(active)}
          tabIndex={0}
          className="dart-fade mt-3 grid gap-6 rounded-card bg-night-3 p-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-linen sm:grid-cols-2 sm:p-8"
        >
          <div className="flex flex-col justify-center">
            <h3 className="font-display text-[24px] font-light leading-tight tracking-tight text-linen">
              {stage.title}
            </h3>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-moth">
              {stage.body}
            </p>
          </div>
          <div className="flex min-h-32 items-center rounded-[14px] bg-night-2 p-6">
            {stage.visual}
          </div>
        </div>
      </div>
    </section>
  );
}
