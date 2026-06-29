import { SignInCta } from "./SignInCta";
import { HeroVisual } from "./HeroVisual";

export function Hero() {
  return (
    <section className="mx-auto max-w-[var(--page-max)] px-5 pb-16 pt-16 text-center sm:px-8 sm:pt-20">
      <p
        className="hero-rise t-caption flex items-center justify-center gap-2 text-driftwood"
        style={{ "--d": "0ms" } as React.CSSProperties}
      >
        <span className="hero-live-dot" aria-hidden />
        One-click ad factory
      </p>
      <h1
        className="hero-rise mx-auto mt-5 max-w-[16ch] text-balance font-display text-[2.5rem] font-light leading-[1.05] tracking-[-0.025em] sm:text-[3.5rem] lg:text-[4.25rem]"
        style={{ "--d": "90ms" } as React.CSSProperties}
      >
        One product photo.{" "}
        <span className="hero-accent">One on-brand ad.</span>
      </h1>
      <p
        className="hero-rise mx-auto mt-6 max-w-xl text-[18px] leading-relaxed text-driftwood"
        style={{ "--d": "180ms" } as React.CSSProperties}
      >
        Dart <span className="hero-em">writes the copy</span>, designs an{" "}
        <span className="hero-em">on-brand look</span>, and renders a short
        animated ad around your <span className="hero-em">real product</span> —
        right in your browser. No editing suite, no render farm.
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
        <SignInCta />
        <p className="font-mono text-[12px] text-fog">
          Rendered free in-browser · 3–20s · 16:9 · 9:16 · 1:1 · 4:5
        </p>
      </div>
    </section>
  );
}
