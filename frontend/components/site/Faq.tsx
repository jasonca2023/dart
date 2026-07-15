"use client";

import { useId, useState } from "react";

const QA: { q: string; a: string }[] = [
  {
    q: "Is it really free?",
    a: "Yes. The ad is written, designed and rendered in your browser, so there's no render farm to pay for and no bill to pass on. You bring a product photo; Dart does the rest.",
  },
  {
    q: "What do I need to start?",
    a: "One product photo and a sentence about who it's for. Dart writes the copy and picks the palette, type, pacing and motion. You review the result and can re-roll the look before saving.",
  },
  {
    q: "Which formats and lengths?",
    a: "16:9, 9:16, 1:1 and 4:5, from 3 to 20 seconds, exported as 1080p MP4, sized for feed, story, reel or banner.",
  },
  {
    q: "Do I own what Dart makes?",
    a: "Yes. No watermark, no usage terms hiding in the export. Download the MP4 and run it anywhere.",
  },
  {
    q: "Does my product photo leave my computer?",
    a: "Not until you save. Generation and rendering happen locally in your browser; when you save an ad, the finished video and photo are stored in your private library.",
  },
];

// Accordion rows: the answer expands via the 0fr→1fr grid-rows trick (animates
// to auto height cross-browser, which native <details> can't), the plus turns
// into an ×. aria-expanded + aria-controls keep it honest for screen readers,
// and the collapsed panel is `inert` so its text stays out of the a11y tree
// (the grid trick only hides it visually).
function Item({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="border-b border-ash">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-baseline justify-between gap-6 py-5 text-left text-[16px] font-medium text-ink transition-colors duration-150 ease-out hover:text-driftwood active:text-fog focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {q}
        <span
          aria-hidden
          className={
            "shrink-0 font-display text-[20px] font-light text-driftwood transition-transform duration-[260ms] ease-out motion-reduce:transition-none " +
            (open ? "rotate-45" : "")
          }
        >
          +
        </span>
      </button>
      <div
        id={panelId}
        inert={!open}
        className={
          "grid transition-[grid-template-rows] duration-[300ms] ease-out motion-reduce:transition-none " +
          (open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")
        }
      >
        <div className="overflow-hidden">
          <p
            className={
              "max-w-[60ch] pb-6 text-[15px] leading-relaxed text-driftwood transition-opacity duration-[240ms] ease-out motion-reduce:transition-none " +
              (open ? "opacity-100" : "opacity-0")
            }
          >
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}

export function Faq() {
  return (
    <section className="mx-auto max-w-[var(--page-max)] px-5 py-20 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <p className="t-caption text-driftwood">Questions</p>
        <h2 className="t-heading mt-3">The short answers.</h2>

        <div className="mt-8 border-t border-ash">
          {QA.map(({ q, a }) => (
            <Item key={q} q={q} a={a} />
          ))}
        </div>
      </div>
    </section>
  );
}
