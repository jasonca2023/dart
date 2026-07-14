// Native details/summary — accessible, zero JS, styled to the hairline system.
const QA: { q: string; a: string }[] = [
  {
    q: "Is it really free?",
    a: "Yes. The ad is written, designed and rendered in your browser, so there's no render farm to pay for and no bill to pass on. You bring a product photo; Dart does the rest.",
  },
  {
    q: "What do I need to start?",
    a: "One product photo and a sentence about who it's for. Dart writes the copy and picks the palette, type, pacing and motion — you review the result and can re-roll the look before saving.",
  },
  {
    q: "Which formats and lengths?",
    a: "16:9, 9:16, 1:1 and 4:5, from 3 to 20 seconds, exported as 1080p MP4 — sized for feed, story, reel or banner.",
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

export function Faq() {
  return (
    <section className="mx-auto max-w-[var(--page-max)] px-5 py-20 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <p className="t-caption text-driftwood">Questions</p>
        <h2 className="t-heading mt-3">The short answers.</h2>

        <div className="mt-8 border-t border-ash">
          {QA.map(({ q, a }) => (
            <details key={q} className="group border-b border-ash">
              <summary className="flex cursor-pointer list-none items-baseline justify-between gap-6 py-5 text-[16px] font-medium text-ink transition-colors duration-150 ease-out hover:text-driftwood [&::-webkit-details-marker]:hidden">
                {q}
                <span
                  aria-hidden
                  className="shrink-0 font-display text-[20px] font-light text-driftwood transition-transform duration-200 ease-out group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="max-w-[60ch] pb-6 text-[15px] leading-relaxed text-driftwood">
                {a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
