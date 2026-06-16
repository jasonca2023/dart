import { Orb } from "../ui/Orb";
import { UrlLaunch } from "./UrlLaunch";

const SCENES = ["01", "02", "03", "04"];

export function Hero() {
  return (
    <section className="mx-auto max-w-[var(--page-max)] px-5 pb-20 pt-16 sm:px-8 sm:pt-24">
      <div className="grid items-center gap-14 lg:grid-cols-12 lg:gap-10">
        {/* Left — the pitch + the one action */}
        <div className="lg:col-span-7">
          <p className="t-caption text-driftwood">Autonomous ad factory</p>
          <h1 className="mt-5 max-w-[12ch] text-balance font-display text-[2.5rem] font-light leading-[1.05] tracking-[-0.025em] sm:text-[3.25rem] lg:text-[4rem]">
            One product link. One cinematic ad.
          </h1>
          <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-driftwood">
            Dart reads your product page, directs the scene, and renders a 4K
            commercial — a virtual human holding your real product. No actors,
            no shoot, no editing.
          </p>
          <div className="mt-8">
            <UrlLaunch size="lg" />
          </div>
          <p className="mt-4 font-mono text-[12px] text-fog">
            4K render · 5–15s · 16:9 / 9:16 / 1:1 · review before you publish
          </p>
        </div>

        {/* Right — what comes out (abstract, not fake video chrome) */}
        <div className="lg:col-span-5">
          <figure className="mx-auto max-w-sm rounded-card bg-white p-4 shadow-[var(--shadow-elevated)]">
            <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-[14px] bg-sand">
              <Orb tone="cinematic" className="size-28" />
              <span className="absolute bottom-3 left-3 rounded-full border border-ash bg-white/80 px-2 py-0.5 font-mono text-[10px] text-driftwood">
                2160p · 16:9
              </span>
            </div>
            <figcaption className="mt-4 flex items-center justify-between">
              <span className="font-display text-[18px] font-light text-ink">
                Aero Runner
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ash bg-white px-2.5 py-1 text-[12px] font-medium text-ink">
                <span className="size-2 rounded-full bg-ink" />
                Ready
              </span>
            </figcaption>
            <p className="mt-1 text-[13px] text-driftwood">
              Cinematic mood · 4 scenes
            </p>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {SCENES.map((n) => (
                <div
                  key={n}
                  className="flex aspect-square items-center justify-center rounded-[10px] bg-sand font-mono text-[11px] text-fog"
                >
                  {n}
                </div>
              ))}
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}
