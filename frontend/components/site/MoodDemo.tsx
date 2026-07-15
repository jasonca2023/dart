"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { buildAdSpec, TONE_ACCENTS, type AdSpec, type Tone } from "@/lib/adSpec";
import { useSlidingPill } from "@/lib/useSlidingPill";
import { Orb } from "../ui/Orb";

// The real preview player (the same composition the app renders and exports).
// Split out and browser-only, so Remotion never weighs down the first paint.
const AdPreview = dynamic(() => import("../app/AdPreview"), {
  ssr: false,
  loading: () => <StagePlaceholder />,
});

// Shown before the player mounts (chunk loading, or not yet scrolled into
// view). A quiet pulsing sand surface reads as "loading", never as a broken
// black box, if it's ever glimpsed.
function StagePlaceholder() {
  return (
    <div className="grid aspect-video w-full place-items-center bg-sand">
      <span className="size-6 animate-pulse rounded-full bg-mist" aria-hidden />
    </div>
  );
}

// One pinned sample product; only the audience changes per mood. The audience
// strings are chosen to deterministically trigger each tone in buildAdSpec
// (guarded by a test in lib/adSpec.test.ts).
const DEMO = {
  title: "Atlas Bottle",
  price: "$48",
  image: "/demo/atlas-bottle.svg",
  durationSec: 15,
};

// Hand-written copy per mood — the brain's generated lines are tuned for
// unknown products, and a pinned demo deserves better than generic filler.
// Palette, type, layout, pacing and motion stay 100% live from buildAdSpec.
interface DemoCopy {
  eyebrow: string;
  hook: string;
  subhead: string;
  feature: { label: string; value: string };
  cta: string;
}

const MOODS: {
  tone: Tone;
  name: string;
  audience: string;
  note: string;
  copy: DemoCopy;
}[] = [
  {
    tone: "luxe",
    name: "Luxe",
    audience: "luxury gifting",
    note: "Gold & serif, slow, editorial",
    copy: {
      eyebrow: "The considered gift",
      hook: "Some gifts outlast the occasion.",
      subhead: "Insulated steel, capped in bamboo.",
      feature: { label: "Keeps cold", value: "A full 24 hours" },
      cta: "Gift well",
    },
  },
  {
    tone: "techy",
    name: "Techy",
    audience: "tech early adopters",
    note: "Electric, mono, snappy",
    copy: {
      eyebrow: "Thermal engineering",
      hook: "Cold for 24 hours. Measured.",
      subhead: "Double-wall vacuum. Zero condensation.",
      feature: { label: "Retention", value: "24 h cold · 12 h hot" },
      cta: "See the specs",
    },
  },
  {
    tone: "energetic",
    name: "Energetic",
    audience: "trail runners",
    note: "Bold, fast, athletic",
    copy: {
      eyebrow: "Trail ready",
      hook: "Mile ten tastes better cold.",
      subhead: "Ice at the trailhead, ice at the summit.",
      feature: { label: "Weight", value: "310 g, packed" },
      cta: "Grab yours",
    },
  },
  {
    tone: "playful",
    name: "Playful",
    audience: "college students",
    note: "Bright, bouncy, warm",
    copy: {
      eyebrow: "Hydration, but cute",
      hook: "Your lectures deserve cold water.",
      subhead: "One bottle, zero soggy backpacks.",
      feature: { label: "Fits", value: "Every cupholder" },
      cta: "Get the bottle",
    },
  },
  {
    tone: "calm",
    name: "Calm",
    audience: "wellness mornings",
    note: "Soft, gentle, considered",
    copy: {
      eyebrow: "Morning ritual",
      hook: "Begin with cold water.",
      subhead: "Steel that keeps the quiet in.",
      feature: { label: "Keeps cold", value: "All day long" },
      cta: "Start slow",
    },
  },
  {
    tone: "bold",
    name: "Bold",
    audience: "streetwear heads",
    note: "High-contrast, punchy",
    copy: {
      eyebrow: "No lukewarm",
      hook: "Lukewarm is a choice.",
      subhead: "Matte steel. Loud restraint.",
      feature: { label: "Finish", value: "Matte sage" },
      cta: "Cop it",
    },
  },
];

// Overlay the hand-written lines on the generated spec; everything visual
// (palette, layout, font, motion, scene timing) stays from the live brain.
function withDemoCopy(spec: AdSpec, c: DemoCopy): AdSpec {
  return {
    ...spec,
    eyebrow: c.eyebrow,
    subhead: c.subhead,
    cta: c.cta,
    scenes: spec.scenes.map((s) => {
      if (s.type === "hook") return { ...s, text: c.hook };
      if (s.type === "feature")
        return { ...s, label: c.feature.label, value: c.feature.value };
      if (s.type === "outro") return { ...s, text: c.cta };
      return s;
    }),
  };
}

export function MoodDemo() {
  const [active, setActive] = useState(0);
  // Mount the player only once the section is near the viewport, so the
  // Remotion chunk doesn't compete with the hero.
  const [live, setLive] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  // One white card that slides to the active mood (same treatment as the
  // pipeline tabs), measured off the real buttons.
  const { listRef, btnRefs, pill } = useSlidingPill<HTMLUListElement>(active);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLive(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const mood = MOODS[active];
  const spec = withDemoCopy(
    buildAdSpec({
      title: DEMO.title,
      audience: mood.audience,
      price: DEMO.price,
      durationSec: DEMO.durationSec,
    }),
    mood.copy,
  );

  return (
    <section id="moods" className="scroll-mt-20 py-20">
      <div className="mx-auto mb-10 max-w-[var(--page-max)] px-5 sm:px-8">
        <div className="max-w-2xl">
          <p className="t-caption text-driftwood">Ad moods · live demo</p>
          <h2 className="t-heading mt-3">This is a real ad, rendering right now.</h2>
          <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-driftwood">
            Not a screen recording. This is the actual Dart engine, running in
            your browser on a sample product. Tell Dart who the ad is for and it
            picks the mood: palette, typography, pacing, motion. Try one.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[var(--page-max)] px-5 sm:px-8">
        <div className="rounded-card-lg bg-sand p-4 sm:p-8">
          {/* Mood picker — the orbs, now doing the actual job */}
          <ul
            ref={listRef}
            className="relative flex snap-x gap-2 overflow-x-auto pb-2 sm:grid sm:grid-cols-6 sm:gap-3 sm:overflow-visible"
          >
            {pill && (
              <span
                aria-hidden
                className="pointer-events-none absolute left-0 top-0 rounded-card bg-white shadow-[var(--shadow-inset)] transition-[transform,width,height] duration-[260ms] ease-out motion-reduce:transition-none"
                style={{
                  transform: `translate(${pill.x}px, ${pill.y}px)`,
                  width: pill.w,
                  height: pill.h,
                }}
              />
            )}
            {MOODS.map((m, i) => {
              const on = i === active;
              return (
                <li key={m.tone} className="shrink-0 snap-center">
                  <button
                    ref={(el) => {
                      btnRefs.current[i] = el;
                    }}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setActive(i)}
                    className={
                      "relative z-[1] flex w-28 flex-col items-center rounded-card px-2 py-4 text-center transition-[background-color,transform] " +
                      "duration-[180ms] ease-out active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:w-full " +
                      (on ? "" : "hover:bg-white/50")
                    }
                  >
                    <Orb
                      accent={TONE_ACCENTS[m.tone]}
                      className="size-12"
                      float={false}
                    />
                    <span
                      className={
                        "mt-3 text-[14px] font-medium " + (on ? "text-ink" : "text-driftwood")
                      }
                    >
                      {m.name}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* The stage */}
          <div ref={stageRef} className="mx-auto mt-4 max-w-3xl">
            <div className="overflow-hidden rounded-[14px] bg-ink">
              {live ? (
                <AdPreview
                  key={mood.tone}
                  productTitle={DEMO.title}
                  productImage={DEMO.image}
                  price={DEMO.price}
                  audience={mood.audience}
                  durationInSeconds={DEMO.durationSec}
                  aspectRatio="16:9"
                  accent={spec.palette.accent}
                  spec={spec}
                />
              ) : (
                <StagePlaceholder />
              )}
            </div>
            <p className="mt-3 text-center font-mono text-[12px] text-driftwood">
              audience: “{mood.audience}” → {mood.tone} · {mood.note}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
