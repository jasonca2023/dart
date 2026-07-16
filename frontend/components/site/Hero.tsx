import { SignInCta } from "./SignInCta";
import { HeroVisual } from "./HeroVisual";

// Marquee hero: the statement and the orb ARE the fold. No lede, no CTA in
// view — the orb sits in the middle of the viewport as the page's one light
// source, and the first paragraph + CTA arrive below the fold as the hard
// hand-off into the rest of the page.
export function Hero() {
  return (
    <>
      <section className="relative mx-auto flex min-h-[calc(92svh-5rem)] max-w-[var(--page-max)] flex-col px-5 pt-8 sm:px-8 sm:pt-10">
        {/* Off-axis eyebrow row */}
        <div
          className="night-fade flex items-baseline justify-between gap-4"
          style={{ "--d": "0ms" } as React.CSSProperties}
        >
          <p className="t-caption flex items-center gap-2 text-dusk">
            <span className="hero-live-dot" aria-hidden />
            One-click ad factory
          </p>
          <p className="hidden font-mono text-[12px] text-dusk sm:block">
            Rendered free in your browser
          </p>
        </div>

        <h1
          className="night-fade mx-auto mt-10 max-w-[14ch] text-balance text-center font-display text-[clamp(2.75rem,7.5vw,5.25rem)] font-light leading-[1.02] tracking-[-0.03em] text-linen sm:mt-12"
          style={{ "--d": "120ms" } as React.CSSProperties}
        >
          One product photo. One finished ad.
        </h1>

        {/* The centerpiece — glass orb, orbiting motion graphics, mid-viewport */}
        <div
          className="night-fade relative mx-auto mt-6 min-h-[300px] w-full max-w-3xl flex-1 sm:mt-8 sm:min-h-[380px]"
          style={{ "--d": "280ms" } as React.CSSProperties}
        >
          <div className="hero-glow" aria-hidden />
          <div className="hero-canvas-wrap">
            <HeroVisual />
          </div>
        </div>
      </section>

      {/* Below the fold: the explanation and the first CTA */}
      <section className="mx-auto max-w-[var(--page-max)] px-5 pb-20 pt-12 text-center sm:px-8 sm:pb-24">
        <p className="mx-auto max-w-xl text-[18px] leading-relaxed text-moth">
          Dart <span className="hero-em">writes the copy</span>, designs a look
          in <span className="hero-em">your colours</span>, and renders a short
          animated ad around your <span className="hero-em">real product</span>,
          right in your browser. No editing suite, no render farm.
        </p>
        <div className="mt-8 flex flex-col items-center gap-4">
          <SignInCta />
          <p className="font-mono text-[12px] text-dusk">
            3 to 20s · 16:9 · 9:16 · 1:1 · 4:5 · 1080p
          </p>
        </div>
      </section>
    </>
  );
}
