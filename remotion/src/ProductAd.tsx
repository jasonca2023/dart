import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import type { AdSpec, Scene, Tone } from "./adSpec";
import { FONT_FAMILY } from "./fonts";

export const productAdSchema = z.object({
  productTitle: z.string(),
  productImage: z.string(),
  price: z.string(),
  audience: z.string(),
  durationInSeconds: z.number(),
  aspectRatio: z.enum(["16:9", "1:1", "4:5", "9:16"]),
  accent: z.string(),
  brandLogo: z.string().optional(),
  brandLogoKnockout: z.boolean().optional(),
  spec: z.any().optional(),
});

type ProductAdProps = z.infer<typeof productAdSchema>;

const up = (s: string) => (s || "").toUpperCase();

// Pick readable text (ink or white) for a filled accent — so a yellow CTA isn't
// white-on-yellow.
function readableOn(hex: string): string {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const r = parseInt(n.slice(0, 2), 16) || 0;
  const g = parseInt(n.slice(2, 4), 16) || 0;
  const b = parseInt(n.slice(4, 6), 16) || 0;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#141414" : "#ffffff";
}

// Per-tone motion personality — timing + easing is what reads as premium vs
// amateur (fast = energy, slow = weight). Drives reveal speed, word stagger,
// product zoom and drift amplitude.
interface Tempo {
  dur: number; // reveal spring length (frames)
  damping: number; // spring damping (lower = bouncier)
  stagger: number; // delay between staggered elements/words
  prodTo: number; // product zoom target
  drift: number; // continuous-drift amplitude (px)
}
const TEMPO: Record<Tone, Tempo> = {
  luxe: { dur: 32, damping: 200, stagger: 7, prodTo: 1.07, drift: 9 }, // slow, weighty
  techy: { dur: 18, damping: 200, stagger: 4, prodTo: 1.05, drift: 6 }, // snappy, precise
  energetic: { dur: 16, damping: 170, stagger: 4, prodTo: 1.08, drift: 7 }, // fast, athletic
  calm: { dur: 26, damping: 200, stagger: 6, prodTo: 1.05, drift: 6 }, // gentle, steady
  playful: { dur: 20, damping: 150, stagger: 5, prodTo: 1.07, drift: 9 }, // lively, no overshoot
  bold: { dur: 16, damping: 150, stagger: 4, prodTo: 1.08, drift: 7 }, // punchy
};

// Tone-aware value line for the price moment (the CTA itself lives in the outro,
// where research says it belongs). Avoids "affordable" for luxe.
const PRICE_LEAD: Record<Tone, string> = {
  luxe: "Yours for",
  energetic: "For an affordable",
  techy: "Smart value at",
  calm: "For an affordable",
  playful: "All this for just",
  bold: "Get it for",
};

function useUnit() {
  const { width, height } = useVideoConfig();
  return Math.min(width, height) / 1080;
}

// Shared left margin so kicker / headline / price / CTA all hang off one column —
// the consistent baseline reads as "designed", not centered-by-default.
function margin(u: number, portrait: boolean) {
  return (portrait ? 76 : 124) * u;
}

// Scene-relative spring (useCurrentFrame restarts at 0 inside a Sequence).
function useReveal(start: number, t: Tempo) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - start, fps, durationInFrames: t.dur, config: { damping: t.damping } });
}

// --- Building blocks ------------------------------------------------------

// Word-by-word kinetic headline: each word springs up in turn, then holds.
const KineticText: React.FC<{
  text: string;
  start: number;
  t: Tempo;
  fontSize: number;
  weight: number;
  color: string;
  letterSpacing: number;
  align: "center" | "left";
  maxWidth?: number | string;
}> = ({ text, start, t, fontSize, weight, color, letterSpacing, align, maxWidth }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = (text || "").split(" ");
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: `${fontSize * 0.06}px ${fontSize * 0.26}px`,
        justifyContent: align === "center" ? "center" : "flex-start",
        maxWidth,
        lineHeight: 1.0,
      }}
    >
      {words.map((w, i) => {
        const s = spring({
          frame: frame - start - i * t.stagger,
          fps,
          durationInFrames: t.dur,
          config: { damping: t.damping },
        });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: s,
              transform: `translateY(${interpolate(s, [0, 1], [fontSize * 0.42, 0])}px)`,
              color,
              fontSize,
              fontWeight: weight,
              letterSpacing,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

// Product on a softly-lit studio stage: a quiet floor gradient and a grounded
// contact shadow. No accent spotlight wash (that "bloom" is the AI tell).
const ProductStage: React.FC<{
  src: string;
  motion: Scene["motion"];
  t: Tempo;
  sceneFrames: number;
  stage: string;
  onStage: string;
  accent: string;
  widthPct: string;
}> = ({ src, motion, t, sceneFrames, stage, onStage, widthPct }) => {
  const frame = useCurrentFrame();
  const tt = interpolate(frame, [0, sceneFrames], [0, 1], { extrapolateRight: "clamp" });
  const enter = useReveal(0, t);

  let scale = 1;
  let y = 0;
  if (motion === "kenburns-in") scale = interpolate(tt, [0, 1], [1.0, t.prodTo]);
  else if (motion === "kenburns-out") scale = interpolate(tt, [0, 1], [t.prodTo, 1.0]);
  else if (motion === "drift") {
    scale = 1.0 + (t.prodTo - 1) * 0.5;
    y = interpolate(tt, [0, 1], [t.drift, -t.drift]);
  } else if (motion === "pop") scale = interpolate(enter, [0, 1], [0.84, 1]);
  else scale = interpolate(tt, [0, 1], [1.0, 1.0 + (t.prodTo - 1) * 0.6]); // rise

  const entY = interpolate(enter, [0, 1], [28, 0]);

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: stage,
        backgroundImage: `linear-gradient(176deg, ${onStage}08 0%, ${stage} 52%, ${onStage}10 100%)`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "relative",
          width: widthPct,
          height: "74%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `translateY(${y + entY}px) scale(${scale})`,
          opacity: enter,
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: "1%",
            width: "60%",
            height: "7%",
            borderRadius: "50%",
            backgroundImage:
              "radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,0.30), transparent 72%)",
            filter: "blur(7px)",
          }}
        />
        <Img
          src={src}
          crossOrigin="anonymous"
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            filter: "drop-shadow(0 24px 44px rgba(0,0,0,0.16))",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

// Refined kicker: a short hairline + small tracked caps in the copy colour
// (muted) — an editorial label, never the "— FOR AUDIENCE" accent-tick eyebrow.
const Kicker: React.FC<{ text: string; color: string; u: number; o: number }> = ({
  text,
  color,
  u,
  o,
}) => {
  if (!text) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16 * u,
        opacity: o,
        transform: `translateY(${interpolate(o, [0, 1], [12, 0])}px)`,
      }}
    >
      <span style={{ width: 46 * u, height: 1.5 * u, backgroundColor: color, opacity: 0.4 }} />
      <span style={{ color, opacity: 0.72, fontSize: 16 * u, fontWeight: 600, letterSpacing: 3.5 * u }}>
        {up(text)}
      </span>
    </div>
  );
};

// Solid CTA — flat accent, contrast-aware text, no gradient, no glow.
const Pill: React.FC<{ text: string; accent: string; u: number; o: number }> = ({
  text,
  accent,
  u,
  o,
}) => (
  <div
    style={{
      opacity: o,
      transform: `translateY(${interpolate(o, [0, 1], [14, 0])}px)`,
      alignSelf: "flex-start",
      padding: `${15 * u}px ${32 * u}px`,
      borderRadius: 10 * u,
      backgroundColor: accent,
      color: readableOn(accent),
      fontWeight: 700,
      fontSize: 24 * u,
      letterSpacing: 0.2 * u,
    }}
  >
    {text}
  </div>
);

// Kicker -> headline -> subhead, staggered at the tone's tempo, left-aligned,
// with a slow continuous drift so the frame keeps breathing.
const Copy: React.FC<{ spec: AdSpec; color: string; u: number; portrait: boolean; sceneFrames: number }> = ({
  spec,
  color,
  u,
  portrait,
  sceneFrames,
}) => {
  const frame = useCurrentFrame();
  const t = TEMPO[spec.tone];
  const eb = useReveal(3, t);
  const tt = useReveal(3 + t.stagger, t);
  const sb = useReveal(3 + t.stagger * 2.4, t);
  const driftY = interpolate(frame, [0, sceneFrames], [t.drift * 0.5, -t.drift * 0.5]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 * u, transform: `translateY(${driftY}px)` }}>
      <Kicker text={spec.eyebrow} color={color} u={u} o={eb} />
      <div
        style={{
          opacity: tt,
          transform: `translateY(${interpolate(tt, [0, 1], [30, 0])}px)`,
          color,
          fontWeight: 760,
          fontSize: (portrait ? 66 : 78) * u,
          lineHeight: 1.0,
          letterSpacing: -2.4 * u,
          maxWidth: portrait ? "15ch" : "16ch",
        }}
      >
        {spec.headline}
      </div>
      {spec.subhead ? (
        <div style={{ opacity: sb * 0.85, color, fontSize: 25 * u, lineHeight: 1.32, maxWidth: "30ch" }}>
          {spec.subhead}
        </div>
      ) : null}
    </div>
  );
};

// --- Scenes ---------------------------------------------------------------

const HookScene: React.FC<SceneProps> = ({ spec, scene, portrait }) => {
  const u = useUnit();
  const t = TEMPO[spec.tone];
  // The hook scene is short and must settle+hold — cap the kinetic timing so even
  // slow tones land the words with time to spare.
  const hookT: Tempo = { ...t, dur: Math.min(t.dur, 24), stagger: Math.min(t.stagger, 5) };
  const { panel, accent, text } = spec.palette;
  const rule = useReveal(2 + hookT.stagger * 2.5, hookT);
  const m = margin(u, portrait);
  return (
    <AbsoluteFill style={{ backgroundColor: panel, justifyContent: "center", padding: `0 ${m}px` }}>
      <KineticText
        text={scene.text || ""}
        start={2}
        t={hookT}
        fontSize={(portrait ? 76 : 108) * u}
        weight={760}
        color={text}
        letterSpacing={-3.2 * u}
        align="left"
        maxWidth="13ch"
      />
      <div
        style={{
          marginTop: 42 * u,
          width: interpolate(rule, [0, 1], [0, 124 * u]),
          height: 3 * u,
          backgroundColor: accent,
        }}
      />
    </AbsoluteFill>
  );
};

// Editorial: type-dominant and asymmetric — an oversized headline owns the top,
// the product sits on a stage strip below, divided by a hairline.
const EditorialHero: React.FC<SceneProps> = ({ spec, scene, productImage }) => {
  const u = useUnit();
  const t = TEMPO[spec.tone];
  const { stage, panel, accent, text, onStage } = spec.palette;
  const frame = useCurrentFrame();
  const eb = useReveal(3, t);
  const hl = useReveal(3 + t.stagger, t);
  const driftY = interpolate(frame, [0, scene.frames], [t.drift * 0.4, -t.drift * 0.4]);
  return (
    <AbsoluteFill style={{ backgroundColor: panel }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "52%",
          backgroundColor: panel,
          padding: `${52 * u}px ${124 * u}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 24 * u, transform: `translateY(${driftY}px)` }}>
          <Kicker text={spec.eyebrow} color={text} u={u} o={eb} />
          <div
            style={{
              opacity: hl,
              transform: `translateY(${interpolate(hl, [0, 1], [36, 0])}px)`,
              color: text,
              fontWeight: 790,
              fontSize: 100 * u,
              lineHeight: 0.95,
              letterSpacing: -3.6 * u,
              maxWidth: "15ch",
            }}
          >
            {spec.headline}
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", top: "52%", left: 0, right: 0, bottom: 0 }}>
        <ProductStage src={productImage} motion={scene.motion} t={t} sceneFrames={scene.frames} stage={stage} onStage={onStage} accent={accent} widthPct="56%" />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5 * u, backgroundColor: accent }} />
      </div>
    </AbsoluteFill>
  );
};

// Statement (bold): an oversized headline takeover owns 60% of the frame, the
// product sits as a small inset card. Type is the hero, product is the accent.
const StatementHero: React.FC<SceneProps> = ({ spec, scene, productImage }) => {
  const u = useUnit();
  const t = TEMPO[spec.tone];
  const { stage, panel, accent, text, onStage } = spec.palette;
  const hl = useReveal(2, t);
  return (
    <AbsoluteFill style={{ flexDirection: "row", backgroundColor: panel }}>
      <div
        style={{
          width: "60%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: `0 ${64 * u}px 0 ${124 * u}px`,
        }}
      >
        <div
          style={{
            width: 92 * u,
            height: 6 * u,
            backgroundColor: accent,
            marginBottom: 34 * u,
            transform: `scaleX(${hl})`,
            transformOrigin: "left",
          }}
        />
        <div
          style={{
            opacity: hl,
            transform: `translateY(${interpolate(hl, [0, 1], [44, 0])}px)`,
            color: text,
            fontWeight: 800,
            fontSize: 122 * u,
            lineHeight: 0.9,
            letterSpacing: -4.5 * u,
            maxWidth: "12ch",
          }}
        >
          {spec.headline}
        </div>
      </div>
      <div
        style={{
          width: "40%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 56 * u,
        }}
      >
        <div style={{ width: "100%", height: "76%", borderRadius: 10 * u, overflow: "hidden", position: "relative" }}>
          <ProductStage src={productImage} motion={scene.motion} t={t} sceneFrames={scene.frames} stage={stage} onStage={onStage} accent={accent} widthPct="84%" />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const HeroScene: React.FC<SceneProps> = (props) => {
  const { spec, scene, productImage, portrait, wide } = props;
  const u = useUnit();
  const t = TEMPO[spec.tone];
  const { stage, panel, accent, text, onStage } = spec.palette;
  const split = spec.layout === "split" && wide;
  const editorial = spec.layout === "editorial" && wide;
  const statement = spec.layout === "statement" && wide;

  if (editorial) return <EditorialHero {...props} />;
  if (statement) return <StatementHero {...props} />;
  if (split) {
    return (
      <AbsoluteFill style={{ flexDirection: "row", backgroundColor: panel }}>
        <div
          style={{
            width: "44%",
            height: "100%",
            backgroundColor: panel,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: 100 * u,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Copy spec={spec} color={text} u={u} portrait={false} sceneFrames={scene.frames} />
        </div>
        <div style={{ width: "56%", height: "100%", position: "relative", overflow: "hidden" }}>
          <ProductStage src={productImage} motion={scene.motion} t={t} sceneFrames={scene.frames} stage={stage} onStage={onStage} accent={accent} widthPct="78%" />
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 1 * u, backgroundColor: `${text}1f` }} />
        </div>
      </AbsoluteFill>
    );
  }

  // Banded: product on a lit stage up top, copy on a flat panel below.
  const stageH = portrait ? "56%" : "60%";
  return (
    <AbsoluteFill style={{ backgroundColor: panel }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: stageH }}>
        <ProductStage src={productImage} motion={scene.motion} t={t} sceneFrames={scene.frames} stage={stage} onStage={onStage} accent={accent} widthPct={portrait ? "82%" : "62%"} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          top: stageH,
          backgroundColor: panel,
          padding: `0 ${margin(u, portrait)}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5 * u, backgroundColor: accent }} />
        <Copy spec={spec} color={text} u={u} portrait={portrait} sceneFrames={scene.frames} />
      </div>
    </AbsoluteFill>
  );
};

const FeatureScene: React.FC<SceneProps> = ({ spec, scene, productImage, portrait }) => {
  const u = useUnit();
  const t = TEMPO[spec.tone];
  const { stage, accent, panel, text, onStage } = spec.palette;
  const r = useReveal(8, t);
  return (
    <AbsoluteFill style={{ backgroundColor: stage }}>
      <ProductStage src={productImage} motion="kenburns-in" t={t} sceneFrames={scene.frames} stage={stage} onStage={onStage} accent={accent} widthPct={portrait ? "74%" : "56%"} />
      <div
        style={{
          position: "absolute",
          left: (portrait ? 60 : 100) * u,
          bottom: (portrait ? 110 : 104) * u,
          opacity: r,
          transform: `translateY(${interpolate(r, [0, 1], [24, 0])}px)`,
          backgroundColor: panel,
          color: text,
          padding: `${24 * u}px ${30 * u}px`,
          borderRadius: 4 * u,
          maxWidth: "62%",
          display: "flex",
          flexDirection: "column",
          gap: 10 * u,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 * u }}>
          <span style={{ width: 24 * u, height: 1.5 * u, backgroundColor: accent }} />
          <span style={{ fontSize: 15 * u, letterSpacing: 2.4 * u, color: accent, fontWeight: 700 }}>
            {up(scene.label || "")}
          </span>
        </div>
        <div style={{ fontSize: (portrait ? 34 : 40) * u, fontWeight: 740, lineHeight: 1.04, letterSpacing: -0.8 * u }}>
          {scene.value}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const PriceScene: React.FC<SceneProps> = ({ spec, scene, portrait }) => {
  const u = useUnit();
  const t = TEMPO[spec.tone];
  const { panel, accent, text } = spec.palette;
  const lead = useReveal(2, t);
  const pop = useReveal(2 + t.stagger, t);
  const m = margin(u, portrait);
  // The price is the moment (the CTA lives in the outro). Frame it as value, not
  // a button: a tone-aware lead line over a big, confident number — left-hung.
  return (
    <AbsoluteFill style={{ backgroundColor: panel, justifyContent: "center", padding: `0 ${m}px` }}>
      <div
        style={{
          opacity: lead,
          transform: `translateY(${interpolate(lead, [0, 1], [16, 0])}px)`,
          color: accent,
          fontWeight: 700,
          fontSize: (portrait ? 22 : 26) * u,
          letterSpacing: 3 * u,
          marginBottom: 18 * u,
        }}
      >
        {up(PRICE_LEAD[spec.tone])}
      </div>
      <div
        style={{
          opacity: pop,
          transform: `translateY(${interpolate(pop, [0, 1], [26, 0])}px)`,
          color: text,
          fontWeight: 800,
          fontSize: (portrait ? 138 : 196) * u,
          letterSpacing: -5 * u,
          lineHeight: 0.9,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {scene.value}
      </div>
      <div
        style={{
          marginTop: 38 * u,
          width: interpolate(pop, [0, 1], [0, 168 * u]),
          height: 3 * u,
          backgroundColor: accent,
        }}
      />
    </AbsoluteFill>
  );
};

const OutroScene: React.FC<SceneProps> = ({ spec, portrait, brandLogo, brandLogoKnockout }) => {
  const u = useUnit();
  const t = TEMPO[spec.tone];
  const { panel, accent, text } = spec.palette;
  const m = margin(u, portrait);

  // Brand end-card: when a logo is set, the outro becomes a clean, centered
  // sign-off — the logo *reveals* as the final beat (one orchestrated moment),
  // CTA staggered just after. A crisp ease-out (high damping, no overshoot) so
  // the brand moment never reads bouncy/templated. White knockout on the dark
  // panel; an opaque logo (knockout === false) renders as-is.
  if (brandLogo) {
    const clean: Tempo = { ...t, dur: Math.min(t.dur, 26), damping: Math.max(t.damping, 190) };
    const logoIn = useReveal(4, clean);
    const ctaIn = useReveal(4 + clean.stagger * 2, clean);
    const knockout = brandLogoKnockout !== false;
    return (
      <AbsoluteFill
        style={{
          backgroundColor: panel,
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          gap: 42 * u,
          padding: `0 ${m}px`,
        }}
      >
        <Img
          src={brandLogo}
          crossOrigin="anonymous"
          style={{
            height: (portrait ? 60 : 84) * u,
            width: "auto",
            maxWidth: "66%",
            objectFit: "contain",
            opacity: logoIn,
            transform: `translateY(${interpolate(logoIn, [0, 1], [24, 0])}px)`,
            ...(knockout ? { filter: "brightness(0) invert(1)" } : {}),
          }}
        />
        <div
          style={{
            opacity: ctaIn,
            transform: `translateY(${interpolate(ctaIn, [0, 1], [14, 0])}px)`,
            padding: `${15 * u}px ${32 * u}px`,
            borderRadius: 10 * u,
            backgroundColor: accent,
            color: readableOn(accent),
            fontWeight: 700,
            fontSize: 24 * u,
            letterSpacing: 0.2 * u,
          }}
        >
          {`${spec.cta} →`}
        </div>
      </AbsoluteFill>
    );
  }

  // No brand logo → the product title is the sign-off, left-hung as before.
  const r = useReveal(2, t);
  const c = useReveal(14, t);
  return (
    <AbsoluteFill
      style={{
        backgroundColor: panel,
        justifyContent: "center",
        alignItems: "flex-start",
        padding: `0 ${m}px`,
      }}
    >
      {/* The headline is the product title, which can be long. */}
      <div
        style={{
          opacity: r,
          transform: `translateY(${interpolate(r, [0, 1], [24, 0])}px)`,
          color: text,
          fontWeight: 770,
          fontSize: (portrait ? 60 : 86) * u,
          lineHeight: 0.98,
          letterSpacing: -2.6 * u,
          maxWidth: "15ch",
          marginBottom: 46 * u,
        }}
      >
        {spec.headline}
      </div>
      <Pill text={`${spec.cta} →`} accent={accent} u={u} o={c} />
    </AbsoluteFill>
  );
};

interface SceneProps {
  spec: AdSpec;
  scene: Scene;
  productImage: string;
  portrait: boolean;
  /** Wide (16:9) gets the horizontal hero layouts; square/vertical stack. */
  wide: boolean;
  /** Brand logo — only the outro renders it, as the end-card sign-off. */
  brandLogo?: string;
  brandLogoKnockout?: boolean;
}

const SceneView: React.FC<SceneProps> = (props) => {
  switch (props.scene.type) {
    case "hook":
      return <HookScene {...props} />;
    case "feature":
      return <FeatureScene {...props} />;
    case "price":
      return <PriceScene {...props} />;
    case "outro":
      return <OutroScene {...props} />;
    case "benefit":
      return <HookScene {...props} />;
    default:
      return <HeroScene {...props} />;
  }
};

// Derive a clean banded spec when none is supplied (keeps old callers working).
function fallbackSpec(props: ProductAdProps): AdSpec {
  const total = Math.max(1, Math.round(props.durationInSeconds * 30));
  const hook = Math.round(total * 0.18);
  const outro = Math.round(total * 0.2);
  return {
    tone: "energetic",
    layout: "banded",
    palette: {
      stage: "#f4f6f8",
      panel: "#0a0d18",
      accent: props.accent || "#ff5a1f",
      text: "#ffffff",
      onStage: "#080a12",
    },
    font: "grotesque",
    headline: props.productTitle,
    subhead: "",
    cta: "Shop now",
    eyebrow: "New",
    scenes: [
      { type: "hook", frames: hook, text: "Your upgrade is here.", motion: "rise" },
      { type: "hero", frames: total - hook - outro, text: props.productTitle, motion: "rise" },
      { type: "outro", frames: outro, text: "Shop now", motion: "rise" },
    ],
  };
}

// Subtle entry per scene so each beat lands as a cut-with-motion, not a hard cut.
// Direction rotates by scene index for variety (slide-in / rise / scale).
const SceneStage: React.FC<{ index: number; children: React.ReactNode }> = ({ index, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame, fps, durationInFrames: 14, config: { damping: 200 } });
  const mode = index % 3;
  const tr =
    mode === 0
      ? `translateX(${interpolate(e, [0, 1], [26, 0])}px)`
      : mode === 1
        ? `translateY(${interpolate(e, [0, 1], [22, 0])}px)`
        : `scale(${interpolate(e, [0, 1], [0.98, 1])})`;
  const opacity = interpolate(e, [0, 0.45], [0, 1], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ transform: tr, opacity }}>{children}</AbsoluteFill>;
};

export const ProductAd: React.FC<ProductAdProps> = (props) => {
  // `spec` is z.any() in the schema; treat it as the real type so this mirror
  // type-checks like the frontend source it mirrors.
  const spec: AdSpec = (props.spec as AdSpec | undefined) ?? fallbackSpec(props);
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const portrait = height > width;
  const wide = width > height * 1.2; // only 16:9 — square/vertical stack
  const u = Math.min(width, height) / 1080;

  let offset = 0;
  const total = spec.scenes.reduce((a, s) => a + s.frames, 0);

  return (
    <AbsoluteFill style={{ backgroundColor: spec.palette.panel, fontFamily: FONT_FAMILY[spec.font] }}>
      {spec.scenes.map((scene, i) => {
        const from = offset;
        offset += scene.frames;
        return (
          <Sequence key={i} from={from} durationInFrames={scene.frames} layout="none">
            <SceneStage index={i}>
              <SceneView
                spec={spec}
                scene={scene}
                productImage={props.productImage}
                portrait={portrait}
                wide={wide}
                brandLogo={props.brandLogo}
                brandLogoKnockout={props.brandLogoKnockout}
              />
            </SceneStage>
          </Sequence>
        );
      })}

      {/* slim progress hairline */}
      <AbsoluteFill style={{ justifyContent: "flex-end" }}>
        <div style={{ height: 3 * u, backgroundColor: "#ffffff14" }}>
          <div
            style={{
              height: "100%",
              width: `${Math.min(100, (frame / Math.max(1, total)) * 100)}%`,
              backgroundColor: spec.palette.accent,
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
