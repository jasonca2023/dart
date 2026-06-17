import { Orb } from "../ui/Orb";

const MOODS = [
  { tone: "cinematic", name: "Cinematic", note: "Slow, filmic, premium" },
  { tone: "energetic", name: "Energetic", note: "Fast cuts, high motion" },
  { tone: "luxe", name: "Luxe", note: "Editorial, restrained" },
  { tone: "playful", name: "Playful", note: "Bright, friendly, warm" },
  { tone: "calm", name: "Calm", note: "Soft, airy, considered" },
] as const;

export function MoodCarousel() {
  return (
    <section id="moods" className="scroll-mt-20 py-20">
      <div className="mx-auto mb-10 max-w-[var(--page-max)] px-5 sm:px-8">
        <div className="max-w-2xl">
          <p className="t-caption text-driftwood">Ad moods</p>
          <h2 className="t-heading mt-3">Color is how Dart shows energy.</h2>
          <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-driftwood">
            Every cut carries a mood — the pacing, the grade, the way the
            virtual human moves. Pick one when you launch; it steers the script
            and the render.
          </p>
        </div>
      </div>

      {/* Horizontal carousel — the only chromatic moment on the page */}
      <div className="mx-auto max-w-[var(--page-max)] px-5 sm:px-8">
        <div className="rounded-card-lg bg-sand px-2 py-10 sm:px-6">
          <ul className="flex snap-x gap-8 overflow-x-auto px-4 pb-2 sm:justify-center sm:overflow-visible">
            {MOODS.map((m) => (
              <li
                key={m.name}
                className="flex w-32 shrink-0 snap-center flex-col items-center text-center sm:w-36"
              >
                <Orb tone={m.tone} className="size-24 sm:size-28" />
                <span className="mt-5 text-[15px] font-medium text-ink">
                  {m.name}
                </span>
                <span className="mt-1 text-[13px] text-driftwood">{m.note}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
