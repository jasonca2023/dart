import { Check } from "../icons";
import { Orb } from "../ui/Orb";
import { TONE_ACCENTS } from "@/lib/adSpec";

const STAGES = ["Upload", "Render", "Ready"];

export function FeatureShowcase() {
  return (
    <section
      id="dashboard"
      className="mx-auto max-w-[var(--page-max)] scroll-mt-20 px-5 py-20 sm:px-8"
    >
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Visual left, copy right — flips the hero's bias for rhythm */}
        <div className="order-2 lg:order-1">
          <div className="mx-auto max-w-md rounded-card bg-white p-5 shadow-[var(--shadow-elevated)]">
            <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-[14px] bg-sand">
              <Orb accent={TONE_ACCENTS.luxe} className="size-24" />
            </div>

            {/* Stage rail — the live pipeline, settled */}
            <div className="mt-5 flex items-center">
              {STAGES.map((s, i) => (
                <div key={s} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="flex size-6 items-center justify-center rounded-full bg-ink text-parchment">
                      <Check className="text-[13px]" />
                    </span>
                    <span className="text-[11px] text-driftwood">{s}</span>
                  </div>
                  {i < STAGES.length - 1 && (
                    <span className="mx-1 -mt-5 h-px flex-1 bg-ink" />
                  )}
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-ash pt-4">
              <div>
                <p className="text-[14px] font-medium text-ink">Aero Runner</p>
                <p className="font-mono text-[12px] text-fog">$148.00 · upload</p>
              </div>
              <span className="font-mono text-[12px] text-driftwood">
                16:9 · 1080p
              </span>
            </div>
          </div>
        </div>

        {/* Copy */}
        <div className="order-1 lg:order-2">
          <p className="t-caption text-driftwood">The dashboard</p>
          <h2 className="t-heading-lg mt-3 max-w-[16ch]">
            You stay in the loop. Always.
          </h2>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-driftwood">
            Upload your product photo and Dart composes a short, polished animated
            ad around it: motion, type and your branding. When it's ready, you see
            the finished video right away, saved to your library.
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
