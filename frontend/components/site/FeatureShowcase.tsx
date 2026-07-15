import { Check } from "../icons";
import { Orb } from "../ui/Orb";
import { TONE_ACCENTS } from "@/lib/adSpec";

// A 2×2 library grid stands in for "the dashboard" — each tile is a saved ad in
// its own mood. This sells the payoff (ads collect in your library) and, unlike
// the old single mock with a fake stage-rail, doesn't re-tell the Pipeline
// section that sits right above it.
const LIBRARY: { title: string; tone: keyof typeof TONE_ACCENTS; fmt: string }[] = [
  { title: "Aero Runner", tone: "energetic", fmt: "9:16" },
  { title: "Atlas Bottle", tone: "luxe", fmt: "16:9" },
  { title: "Peak Flask", tone: "calm", fmt: "1:1" },
  { title: "Trail Tumbler", tone: "bold", fmt: "4:5" },
];

export function FeatureShowcase() {
  return (
    <section
      id="dashboard"
      className="mx-auto max-w-[var(--page-max)] scroll-mt-20 px-5 py-20 sm:px-8"
    >
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Visual left, copy right — flips the store-import section's bias */}
        <div className="order-2 lg:order-1">
          <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
            {LIBRARY.map(({ title, tone, fmt }) => (
              <div
                key={title}
                className="rounded-card bg-white p-3 shadow-[var(--shadow-ring)]"
              >
                <div className="grid aspect-video place-items-center overflow-hidden rounded-[10px] bg-sand">
                  <Orb accent={TONE_ACCENTS[tone]} className="size-12" float={false} />
                </div>
                <div className="mt-2.5 flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-ink">
                    {title}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-fog">
                    {fmt}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Copy */}
        <div className="order-1 lg:order-2">
          <p className="t-caption text-driftwood">The dashboard</p>
          <h2 className="t-heading-lg mt-3 max-w-[16ch]">
            Every ad lands in your library.
          </h2>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-driftwood">
            Upload your product photo and Dart composes a short, polished animated
            ad around it: motion, type and your branding. When it's ready, the
            finished video is there, saved and ready to post.
          </p>
          <ul className="mt-6 flex flex-col gap-3">
            {[
              "A polished ad in your colours, from one product photo",
              "Every ad saved to your library automatically",
              "Export in 16:9, 9:16, 1:1 or 4:5 for any channel",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3 text-[15px] text-ink">
                <Check className="mt-0.5 shrink-0 text-[18px] text-driftwood" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
