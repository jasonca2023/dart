import { UrlLaunch } from "./UrlLaunch";
import { HeroVisual } from "./HeroVisual";

export function Hero() {
  return (
    <section className="mx-auto max-w-[var(--page-max)] px-5 pb-16 pt-16 text-center sm:px-8 sm:pt-20">
      <p className="t-caption text-driftwood">Autonomous ad factory</p>
      <h1 className="mx-auto mt-5 max-w-[16ch] text-balance font-display text-[2.5rem] font-light leading-[1.05] tracking-[-0.025em] sm:text-[3.5rem] lg:text-[4.25rem]">
        One product link. One cinematic ad.
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-[18px] leading-relaxed text-driftwood">
        Dart reads your product page, directs the scene, and renders a 4K
        commercial — a virtual human holding your real product. No actors, no
        shoot, no editing.
      </p>

      {/* 3D centerpiece — glass orb, orbiting motion graphics */}
      <div className="relative mx-auto mt-8 h-[340px] w-full max-w-3xl sm:h-[440px]">
        <div className="hero-glow" aria-hidden />
        <div className="hero-canvas-wrap">
          <HeroVisual />
        </div>
      </div>

      <div className="-mt-2 flex flex-col items-center gap-4">
        <UrlLaunch size="lg" />
        <p className="font-mono text-[12px] text-fog">
          4K render · 5–15s · 16:9 / 9:16 / 1:1 · review before you publish
        </p>
      </div>
    </section>
  );
}
