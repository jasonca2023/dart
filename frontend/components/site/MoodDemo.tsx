"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { buildAdSpec, TONE_ACCENTS, type Tone } from "@/lib/adSpec";
import { Orb } from "../ui/Orb";

// The real preview player (the same composition the app renders and exports).
// Split out and browser-only, so Remotion never weighs down the first paint.
const AdPreview = dynamic(() => import("../app/AdPreview"), {
  ssr: false,
  loading: () => (
    <div className="aspect-video w-full animate-pulse rounded-[14px] bg-ink" />
  ),
});

// One pinned sample product; only the audience changes per mood. The audience
// strings are chosen to deterministically trigger each tone in buildAdSpec
// (guarded by a test in lib/adSpec.test.ts).
const DEMO = {
  title: "Atlas Bottle",
  price: "$48",
  image: "/demo/atlas-bottle.svg",
  durationSec: 8,
};

const MOODS: { tone: Tone; name: string; audience: string; note: string }[] = [
  { tone: "luxe", name: "Luxe", audience: "luxury gifting", note: "Gold & serif, slow, editorial" },
  { tone: "techy", name: "Techy", audience: "tech early adopters", note: "Electric, mono, snappy" },
  { tone: "energetic", name: "Energetic", audience: "trail runners", note: "Bold, fast, athletic" },
  { tone: "playful", name: "Playful", audience: "college students", note: "Bright, bouncy, warm" },
  { tone: "calm", name: "Calm", audience: "wellness mornings", note: "Soft, gentle, considered" },
  { tone: "bold", name: "Bold", audience: "streetwear heads", note: "High-contrast, punchy" },
];

export function MoodDemo() {
  const [active, setActive] = useState(0);
  // Mount the player only once the section is near the viewport, so the
  // Remotion chunk doesn't compete with the hero.
  const [live, setLive] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

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
  const spec = buildAdSpec({
    title: DEMO.title,
    audience: mood.audience,
    price: DEMO.price,
    durationSec: DEMO.durationSec,
  });

  return (
    <section id="moods" className="scroll-mt-20 py-20">
      <div className="mx-auto mb-10 max-w-[var(--page-max)] px-5 sm:px-8">
        <div className="max-w-2xl">
          <p className="t-caption text-driftwood">Ad moods · live demo</p>
          <h2 className="t-heading mt-3">This is a real ad, rendering right now.</h2>
          <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-driftwood">
            Not a screen recording — the actual Dart engine, running in your
            browser on a sample product. Tell Dart who the ad is for and it
            picks the mood: palette, typography, pacing, motion. Try one.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[var(--page-max)] px-5 sm:px-8">
        <div className="rounded-card-lg bg-sand p-4 sm:p-8">
          {/* Mood picker — the orbs, now doing the actual job */}
          <ul className="flex snap-x gap-2 overflow-x-auto pb-2 sm:grid sm:grid-cols-6 sm:gap-3 sm:overflow-visible">
            {MOODS.map((m, i) => {
              const on = i === active;
              return (
                <li key={m.tone} className="shrink-0 snap-center">
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setActive(i)}
                    className={
                      "flex w-28 flex-col items-center rounded-card px-2 py-4 text-center transition-[background-color,transform] " +
                      "duration-[180ms] ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:w-full " +
                      (on ? "bg-white shadow-[var(--shadow-inset)]" : "hover:bg-white/50")
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
                <div className="aspect-video w-full" />
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
