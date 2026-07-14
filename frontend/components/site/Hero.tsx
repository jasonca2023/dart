import { SignInCta } from "./SignInCta";
import { HeroVisual } from "./HeroVisual";

// Centred-narrow editorial hero with the eyebrow row off-axis (left label,
// right-flush mono note) so not everything sits on one centred column. The
// CTA lands above the orb, keeping headline + lede + CTA inside a 1280×800
// fold; the orb then carries the eye across it.
export function Hero() {
  return (
    <section className="mx-auto max-w-[var(--page-max)] px-5 pb-20 pt-10 sm:px-8 sm:pb-24 sm:pt-12">
      {/* Off-axis eyebrow row */}
      <div
        className="hero-rise flex items-baseline justify-between gap-4"
        style={{ "--d": "0ms" } as React.CSSProperties}
      >
        <p className="t-caption flex items-center gap-2 text-driftwood">
          <span className="hero-live-dot" aria-hidden />
          One-click ad factory
        </p>
        <p className="hidden font-mono text-[12px] text-fog sm:block">
          Rendered free in your browser
        </p>
      </div>

      <div className="text-center">
        <h1
          className="hero-rise mx-auto mt-10 max-w-[16ch] text-balance font-display text-[2.5rem] font-light leading-[1.05] tracking-[-0.025em] sm:mt-12 sm:text-[3.5rem] lg:text-[4.25rem]"
          style={{ "--d": "90ms" } as React.CSSProperties}
        >
          One product photo.{" "}
          <span className="hero-accent">One finished ad.</span>
        </h1>
        <p
          className="hero-rise mx-auto mt-6 max-w-xl text-[18px] leading-relaxed text-driftwood"
          style={{ "--d": "180ms" } as React.CSSProperties}
        >
          Dart <span className="hero-em">writes the copy</span>, designs a look in{" "}
          <span className="hero-em">your colours</span>, and renders a short
          animated ad around your <span className="hero-em">real product</span>,
          right in your browser. No editing suite, no render farm.
        </p>

        <div
          className="hero-rise mt-8 flex flex-col items-center gap-4"
          style={{ "--d": "280ms" } as React.CSSProperties}
        >
          <SignInCta />
          <p className="font-mono text-[12px] text-fog">
            3 to 20s · 16:9 · 9:16 · 1:1 · 4:5 · 1080p
          </p>
        </div>

        {/* 3D centerpiece — glass orb, orbiting motion graphics */}
        <div className="relative mx-auto mt-10 h-[340px] w-full max-w-3xl sm:h-[440px]">
          <div className="hero-glow" aria-hidden />
          <div className="hero-canvas-wrap">
            <HeroVisual />
          </div>
        </div>
      </div>
    </section>
  );
}
