import { UrlLaunch } from "./UrlLaunch";
import { HeroVisual } from "./HeroVisual";

export function Hero() {
  return (
    <section className="mx-auto max-w-[var(--page-max)] px-5 pb-16 pt-16 text-center sm:px-8 sm:pt-20">
      <p
        className="hero-rise t-caption flex items-center justify-center gap-2 text-driftwood"
        style={{ "--d": "0ms" } as React.CSSProperties}
      >
        <span className="hero-live-dot" aria-hidden />
        Autonomous ad factory
      </p>
      <h1
        className="hero-rise mx-auto mt-5 max-w-[16ch] text-balance font-display text-[2.5rem] font-light leading-[1.05] tracking-[-0.025em] sm:text-[3.5rem] lg:text-[4.25rem]"
        style={{ "--d": "90ms" } as React.CSSProperties}
      >
        One product link.{" "}
        <span className="hero-accent">One cinematic ad.</span>
      </h1>
      <p
        className="hero-rise mx-auto mt-6 max-w-xl text-[18px] leading-relaxed text-driftwood"
        style={{ "--d": "180ms" } as React.CSSProperties}
      >
        Dart reads your product page, directs the scene, and renders a{" "}
        <span className="hero-em">4K commercial</span> — a{" "}
        <span className="hero-em">virtual human</span> holding your{" "}
        <span className="hero-em">real product</span>. No actors, no shoot, no
        editing.
      </p>

      {/* 3D centerpiece — glass orb, orbiting motion graphics */}
      <div className="relative mx-auto mt-8 h-[340px] w-full max-w-3xl sm:h-[440px]">
        <div className="hero-glow" aria-hidden />
        <div className="hero-canvas-wrap">
          <HeroVisual />
        </div>
      </div>

      <div
        className="hero-rise -mt-2 flex flex-col items-center gap-4"
        style={{ "--d": "460ms" } as React.CSSProperties}
      >
        <UrlLaunch size="lg" />
        <p className="font-mono text-[12px] text-fog">
          4K render · 3–20s · 16:9 / 9:16 · review before you publish
        </p>
      </div>
    </section>
  );
}
