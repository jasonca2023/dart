import { Orb } from "../ui/Orb";
import { TONE_ACCENTS } from "@/lib/adSpec";

// The six real tones the brain picks from, with their actual accent colors and
// the design personality each one renders with.
const MOODS = [
  { tone: "luxe", name: "Luxe", note: "Gold & serif, slow, editorial" },
  { tone: "techy", name: "Techy", note: "Electric, mono, snappy" },
  { tone: "energetic", name: "Energetic", note: "Bold, fast, athletic" },
  { tone: "playful", name: "Playful", note: "Bright, bouncy, warm" },
  { tone: "calm", name: "Calm", note: "Soft, gentle, considered" },
  { tone: "bold", name: "Bold", note: "High-contrast, punchy" },
] as const;

export function MoodCarousel() {
  return (
    <section id="moods" className="scroll-mt-20 py-20">
      <div className="mx-auto mb-10 max-w-[var(--page-max)] px-5 sm:px-8">
        <div className="max-w-2xl">
          <p className="t-caption text-driftwood">Ad moods</p>
          <h2 className="t-heading mt-3">A mood, matched to your audience.</h2>
          <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-driftwood">
            Tell Dart who the ad is for and it picks a mood automatically,
            steering the palette, typography, pacing and motion. Tech buyers get
            electric and precise; luxury gets gold and restrained.
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
                <Orb accent={TONE_ACCENTS[m.tone]} className="size-24 sm:size-28" />
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
