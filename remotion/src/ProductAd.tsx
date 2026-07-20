import {
  AbsoluteFill,
  Easing,
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

// Render frame rate. Kept in sync with lib/render.ts and lib/adSpec.ts (which
// budget scene frames). Timing inside the renderer is authored in 30fps-frames
// and scaled by fps/30, so this only changes smoothness, not motion speed.
// Higher = smoother but ~proportionally slower to render in the browser.
const FPS_APP = 60;

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
// `start` and t.dur are authored in 30fps-frames and scaled to the real fps, so
// every mood's reveal keeps the same wall-clock timing at any frame rate.
function useReveal(start: number, t: Tempo) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = fps / 30;
  return spring({ frame: frame - start * k, fps, durationInFrames: t.dur * k, config: { damping: t.damping } });
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
  const k = fps / 30;
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
          frame: frame - (start + i * t.stagger) * k,
          fps,
          durationInFrames: t.dur * k,
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
  /** Product box height as a % of the scene — smaller keeps a tall product off
   * the bottom edge (where player chrome / platform UI sits). Defaults to 74%. */
  heightPct?: string;
  /** Horizontal placement. "right" pushes the product to the right side so it
   * clears a left-side text/gradient lockup (the hook). Defaults to centered. */
  alignX?: "center" | "right";
}> = ({ src, motion, t, sceneFrames, stage, onStage, widthPct, heightPct, alignX }) => {
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
        // AbsoluteFill is a flex COLUMN, so alignItems is the horizontal axis —
        // that's what pushes the product right; justifyContent stays vertical-center.
        alignItems: alignX === "right" ? "flex-end" : "center",
        justifyContent: "center",
        paddingRight: alignX === "right" ? "4%" : 0,
        backgroundColor: stage,
        backgroundImage: `linear-gradient(176deg, ${onStage}08 0%, ${stage} 52%, ${onStage}10 100%)`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "relative",
          width: widthPct,
          height: heightPct ?? "74%",
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

const HookScene: React.FC<SceneProps> = ({ spec, scene, productImage, portrait }) => {
  const u = useUnit();
  const t = TEMPO[spec.tone];
  // The hook owns the first ~3s — the highest-leverage beat for retention. Open
  // on the REAL product (research: the first frames should show the product, not
  // a blank title card), then land the hook line fast in a gradient lockup so the
  // copy stays legible over the photo. A thick accent rule anchors it.
  const hookT: Tempo = { ...t, dur: Math.min(t.dur, 16), stagger: Math.min(t.stagger, 4) };
  const { panel, stage, accent, text, onStage } = spec.palette;
  const rule = useReveal(2 + hookT.stagger * 2, hookT);
  const m = margin(u, portrait);
  // Darken the copy end (bottom for tall, left for wide) so text reads over the
  // product; the opposite end stays clear so the product is visible immediately.
  const scrim = portrait
    ? `linear-gradient(to top, ${panel} 4%, ${panel}e6 20%, ${panel}00 60%)`
    : `linear-gradient(to right, ${panel} 2%, ${panel}e6 26%, ${panel}00 50%)`;
  return (
    <AbsoluteFill style={{ backgroundColor: panel }}>
      <ProductStage
        src={productImage}
        motion={scene.motion}
        t={t}
        sceneFrames={scene.frames}
        stage={stage}
        onStage={onStage}
        accent={accent}
        widthPct={portrait ? "84%" : "58%"}
        heightPct={portrait ? "58%" : "66%"}
        alignX={portrait ? "center" : "right"}
      />
      <AbsoluteFill style={{ backgroundImage: scrim }} />
      <AbsoluteFill
        style={{
          justifyContent: portrait ? "flex-end" : "center",
          padding: portrait ? `0 ${m}px ${58 * u}px` : `0 ${m}px`,
        }}
      >
        <KineticText
          text={scene.text || ""}
          start={2}
          t={hookT}
          fontSize={(portrait ? 76 : 112) * u}
          weight={780}
          color={text}
          letterSpacing={-3.2 * u}
          align="left"
          maxWidth="13ch"
        />
        <div
          style={{
            marginTop: 34 * u,
            width: interpolate(rule, [0, 1], [0, 132 * u]),
            height: 4 * u,
            backgroundColor: accent,
          }}
        />
      </AbsoluteFill>
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

  // All reveals are computed unconditionally (Rules of Hooks); the JSX below picks
  // which to use. The brand end-card uses a crisp high-damping ease-out (no
  // overshoot) so the brand moment never reads bouncy/templated.
  const clean: Tempo = { ...t, dur: Math.min(t.dur, 26), damping: Math.max(t.damping, 190) };
  const logoIn = useReveal(4, clean);
  const ctaIn = useReveal(4 + clean.stagger * 2, clean);
  const r = useReveal(2, t);
  const c = useReveal(14, t);

  // Brand end-card: when a logo is set, the outro becomes a clean, centered
  // sign-off — the logo reveals as the final beat, CTA staggered just after.
  // White knockout on the dark panel; an opaque logo (knockout === false) as-is.
  if (brandLogo) {
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

// ===========================================================================
// Kinetic treatment (energetic mood only). A purpose-built motion vocabulary —
// overshoot pop, blur-to-focus, line-wipe, character stagger, a virtual camera
// push with parallax, and a color-flood price slam — mapped onto the SAME spec
// scene list (hook/hero/feature/price/outro) so timing, duration and formats
// still come from buildAdSpec. Only tone === "energetic" takes this path; the
// other five moods render unchanged through SceneView above.
// ===========================================================================

// Overshoot pop: a spring that shoots a little past 1 and settles (vs the shipped
// high-damping ease-out). This is what makes a word/price "punch". `delay` is
// authored in 30fps-frames and scaled to the real fps so timing holds at any
// frame rate (springs themselves are already time-based).
function usePop(delay: number, damping = 14) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay * (fps / 30), fps, config: { damping, stiffness: 120, mass: 0.8 } });
}

// Character-stagger reveal — each glyph pops up in turn (typed energy, not a
// block fade).
const CharStagger: React.FC<{
  text: string;
  delay: number;
  per: number;
  fontSize: number;
  weight: number;
  color: string;
  letterSpacing?: number;
}> = ({ text, delay, per, fontSize, weight, color, letterSpacing = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = fps / 30;
  return (
    <div style={{ display: "flex", flexWrap: "wrap" }}>
      {(text || "").split("").map((ch, i) => {
        const s = spring({ frame: frame - (delay + i * per) * k, fps, config: { damping: 15, stiffness: 120, mass: 0.8 } });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              whiteSpace: "pre",
              opacity: interpolate(s, [0, 0.6], [0, 1], { extrapolateRight: "clamp" }),
              transform: `translateY(${interpolate(s, [0, 1], [fontSize * 0.5, 0])}px) scale(${interpolate(s, [0, 1], [0.7, 1])})`,
              color,
              fontSize,
              fontWeight: weight,
              letterSpacing,
              lineHeight: 1,
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};

// K1 · Flash hook — product punches in out of a blur (blur-to-focus keeps the
// eye resolving the image) while a tracked kicker char-staggers and a rule wipes.
const KFlashHook: React.FC<SceneProps> = ({ spec, productImage, portrait }) => {
  const u = useUnit();
  const k = useVideoConfig().fps / 30;
  const { panel, accent, text } = spec.palette;
  const pop = usePop(2, 17);
  const blur = interpolate(pop, [0, 1], [20, 0]);
  const scale = interpolate(pop, [0, 1], [1.16, 1.03]);
  const frame = useCurrentFrame();
  const rule = interpolate(frame, [10 * k, 22 * k], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const m = margin(u, portrait);
  return (
    <AbsoluteFill style={{ backgroundColor: panel, overflow: "hidden" }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Img
          src={productImage}
          crossOrigin="anonymous"
          style={{
            width: portrait ? "82%" : "62%",
            maxHeight: portrait ? "62%" : "76%",
            objectFit: "contain",
            filter: `blur(${blur}px) drop-shadow(0 30px 60px rgba(0,0,0,0.5))`,
            transform: `scale(${scale})`,
            opacity: interpolate(pop, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          backgroundImage: portrait
            ? `linear-gradient(to top, ${panel} 2%, ${panel}cc 20%, ${panel}00 46%)`
            : `linear-gradient(to right, ${panel} 0%, ${panel}cc 22%, ${panel}00 46%)`,
        }}
      />
      <AbsoluteFill style={{ justifyContent: portrait ? "flex-end" : "center", padding: portrait ? `0 ${m}px ${64 * u}px` : `0 ${m}px` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 * u }}>
          <div style={{ width: interpolate(rule, [0, 1], [0, 70 * u]), height: 5 * u, backgroundColor: accent, flexShrink: 0 }} />
          <CharStagger text={up(spec.eyebrow)} delay={6} per={1.4} fontSize={(portrait ? 24 : 30) * u} weight={800} color={text} letterSpacing={5 * u} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// K2 · Kinetic hero — headline words slam in (overshoot + line-wipe) while the
// product holds behind a VIRTUAL CAMERA push and a parallax wordmark; an accent
// bar sweeps across. Depth + rhythm the flat cards never had.
const KHero: React.FC<SceneProps> = ({ spec, scene, productImage, portrait }) => {
  const u = useUnit();
  const { fps, width } = useVideoConfig();
  const frame = useCurrentFrame();
  const k = fps / 30;
  const { panel, accent, text } = spec.palette;
  const p = interpolate(frame, [0, scene.frames], [0, 1], { extrapolateRight: "clamp" });
  const cam = interpolate(p, [0, 1], [1.0, 1.12]);
  const bgX = interpolate(p, [0, 1], [40 * u, -90 * u]);
  const prodX = interpolate(p, [0, 1], [10 * u, -22 * u]);
  // Wipe reveal: a glowing accent edge sweeps across ONCE, revealing the product
  // as it passes, then continues off-frame and fades. The line now has a purpose
  // (it IS the reveal) and never parks on screen.
  const rev = interpolate(frame, [4 * k, 22 * k], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const barPos = rev * 114; // % across the frame; ends off the right edge
  const prodClip = `inset(0 ${Math.max(0, 100 - rev * 118)}% 0 0)`;
  const barOpacity = interpolate(rev, [0, 0.06, 0.82, 1], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const words = up(spec.headline).split(" ").filter(Boolean);
  // Fit the slam to ANY headline: cap the size so the longest word can't overflow
  // the column (condensed caps advance ~0.5em/char). Long product-title headlines
  // then wrap across lines instead of clipping.
  const avail = width - 2 * margin(u, portrait);
  const longest = words.reduce((m, w) => Math.max(m, w.length), 1);
  const hlSize = Math.min((portrait ? 90 : 118) * u, avail / (longest * 0.54));
  // Product sits in the upper band, the slam hangs off the bottom over a strong
  // scrim — so the headline is legible in EVERY format (a centered headline over
  // a centered product goes unreadable on square/landscape).
  const scrim = `linear-gradient(to top, ${panel} 10%, ${panel}e6 32%, ${panel}00 62%)`;
  return (
    <AbsoluteFill style={{ backgroundColor: panel, overflow: "hidden" }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: "4%" }}>
        <div
          style={{
            transform: `translateX(${bgX}px) scale(${cam * 1.04})`,
            color: text,
            opacity: 0.05,
            fontSize: 340 * u,
            fontWeight: 800,
            whiteSpace: "nowrap",
            letterSpacing: -6 * u,
          }}
        >
          {up(words[0] || "NEW")}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: portrait ? "8%" : "5%" }}>
        <Img
          src={productImage}
          crossOrigin="anonymous"
          style={{
            width: portrait ? "78%" : "54%",
            maxHeight: portrait ? "56%" : "64%",
            objectFit: "contain",
            filter: "drop-shadow(0 34px 64px rgba(0,0,0,0.55))",
            transform: `translateX(${prodX}px) scale(${cam})`,
            clipPath: prodClip,
          }}
        />
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: "-4%",
          bottom: "-4%",
          left: `${barPos}%`,
          width: 6 * u,
          marginLeft: -3 * u,
          backgroundColor: accent,
          opacity: barOpacity,
          filter: `blur(${1.2 * u}px)`,
          boxShadow: `0 0 ${28 * u}px ${accent}, 0 0 ${8 * u}px ${accent}`,
        }}
      />
      <AbsoluteFill style={{ backgroundImage: scrim }} />
      <AbsoluteFill style={{ justifyContent: "flex-end", padding: `0 ${margin(u, portrait)}px ${(portrait ? 90 : 64) * u}px` }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignContent: "flex-start", gap: `${hlSize * 0.04}px ${hlSize * 0.24}px`, maxWidth: "100%" }}>
          {words.map((w, i) => {
            const s = spring({ frame: frame - (6 + i * 4) * k, fps, config: { damping: 14, stiffness: 120, mass: 0.8 } });
            const accentWord = i === words.length - 1;
            return (
              <div key={i} style={{ overflow: "hidden", clipPath: `inset(0 ${interpolate(s, [0, 1], [100, 0])}% 0 0)`, paddingBottom: hlSize * 0.04 }}>
                <span
                  style={{
                    display: "inline-block",
                    transform: `translateY(${interpolate(s, [0, 1], [22, 0])}px) scale(${interpolate(s, [0, 1], [1.1, 1])})`,
                    transformOrigin: "left bottom",
                    color: accentWord ? accent : text,
                    fontSize: hlSize,
                    fontWeight: 800,
                    letterSpacing: -2 * u,
                    lineHeight: 0.9,
                  }}
                >
                  {w}
                </span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// K3 · Feature pin — a call-out chip WIPES in and pins to the product with a
// connector dot; the product ken-burns behind it. The product is annotated.
const KFeature: React.FC<SceneProps> = ({ spec, scene, productImage, portrait }) => {
  const u = useUnit();
  const { onStage, accent } = spec.palette;
  const frame = useCurrentFrame();
  const kb = interpolate(frame, [0, scene.frames], [1.0, 1.06], { extrapolateRight: "clamp" });
  const chip = usePop(6, 16);
  return (
    <AbsoluteFill style={{ backgroundColor: onStage, overflow: "hidden" }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Img
          src={productImage}
          crossOrigin="anonymous"
          style={{
            width: portrait ? "74%" : "56%",
            maxHeight: portrait ? "64%" : "78%",
            objectFit: "contain",
            filter: "drop-shadow(0 30px 60px rgba(0,0,0,0.5))",
            transform: `scale(${kb})`,
          }}
        />
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: portrait ? "34%" : "42%",
          width: 14 * u,
          height: 14 * u,
          marginLeft: -7 * u,
          borderRadius: "50%",
          backgroundColor: accent,
          opacity: chip,
          boxShadow: `0 0 0 ${6 * u}px ${accent}33`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: margin(u, portrait),
          bottom: (portrait ? 130 : 110) * u,
          transform: `translateX(${interpolate(chip, [0, 1], [-40 * u, 0])}px)`,
          clipPath: `inset(0 ${interpolate(chip, [0, 1], [100, 0])}% 0 0)`,
          backgroundColor: accent,
          color: readableOn(accent),
          padding: `${20 * u}px ${28 * u}px`,
          borderRadius: 3 * u,
          display: "flex",
          flexDirection: "column",
          gap: 8 * u,
          maxWidth: "66%",
        }}
      >
        <span style={{ fontSize: (portrait ? 17 : 20) * u, letterSpacing: 3 * u, fontWeight: 800, opacity: 0.8 }}>{up(scene.label || spec.eyebrow)}</span>
        <span style={{ fontSize: (portrait ? 40 : 52) * u, fontWeight: 800, lineHeight: 0.98, letterSpacing: -0.5 * u }}>{scene.value || spec.subhead}</span>
      </div>
    </AbsoluteFill>
  );
};

// K4 · Price slam — THE SIGNATURE MOMENT. An accent field floods up, the price
// punches in oversized on heavy overshoot and settles (tabular), a value tag
// drops in above. The beat the ad is remembered by.
const KPrice: React.FC<SceneProps> = ({ spec, scene, portrait }) => {
  const u = useUnit();
  const { accent } = spec.palette;
  const ink = readableOn(accent);
  const frame = useCurrentFrame();
  const k = useVideoConfig().fps / 30;
  const flood = interpolate(frame, [0, 9 * k], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const slam = usePop(7, 13);
  const lead = usePop(4, 17);
  const rule = interpolate(frame, [20 * k, 32 * k], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{
        backgroundColor: accent,
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
        clipPath: `inset(0 0 ${interpolate(flood, [0, 1], [100, 0])}% 0)`,
      }}
    >
      <div
        style={{
          opacity: interpolate(lead, [0, 0.6], [0, 1], { extrapolateRight: "clamp" }),
          transform: `translateY(${interpolate(lead, [0, 1], [-20, 0])}px)`,
          color: ink,
          fontSize: (portrait ? 26 : 34) * u,
          fontWeight: 800,
          letterSpacing: 7 * u,
        }}
      >
        {up(PRICE_LEAD[spec.tone])}
      </div>
      <div
        style={{
          transform: `scale(${interpolate(slam, [0, 1], [0.3, 1])})`,
          color: ink,
          fontSize: (portrait ? 220 : 320) * u,
          fontWeight: 800,
          lineHeight: 0.86,
          letterSpacing: -8 * u,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {scene.value}
      </div>
      <div style={{ marginTop: 18 * u, width: interpolate(rule, [0, 1], [0, 200 * u]), height: 6 * u, backgroundColor: ink }} />
    </AbsoluteFill>
  );
};

// K5 · CTA card — a color flood carries out of the price into the sign-off:
// brand logo (knockout) or title, plus a CTA pill that pops. Continuity, not a cut.
const KOutro: React.FC<SceneProps> = ({ spec, portrait, brandLogo, brandLogoKnockout }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, accent, text } = spec.palette;
  const m = margin(u, portrait);
  const title = usePop(3, 18);
  const pill = usePop(10, 15);
  const logoIn = usePop(3, 18);
  // Fit the sign-off title so a long product-title headline can't overflow.
  const words = up(spec.headline).split(" ").filter(Boolean);
  const longest = words.reduce((mx, w) => Math.max(mx, w.length), 1);
  const titleSize = Math.min((portrait ? 74 : 104) * u, (width - 2 * m) / (longest * 0.54));
  if (brandLogo) {
    const knockout = brandLogoKnockout !== false;
    // Knock the mark out to whatever reads on the panel: white on a dark panel,
    // black on a light one (a plain invert-to-white would vanish on light bg).
    const knockoutFilter =
      readableOn(panel) === "#ffffff" ? "brightness(0) invert(1)" : "brightness(0)";
    return (
      <AbsoluteFill style={{ backgroundColor: panel, justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 42 * u, padding: `0 ${m}px`, overflow: "hidden" }}>
        <Img
          src={brandLogo}
          crossOrigin="anonymous"
          style={{
            height: (portrait ? 60 : 84) * u,
            width: "auto",
            maxWidth: "66%",
            objectFit: "contain",
            opacity: interpolate(logoIn, [0, 0.6], [0, 1], { extrapolateRight: "clamp" }),
            transform: `scale(${interpolate(logoIn, [0, 1], [0.7, 1])})`,
            ...(knockout ? { filter: knockoutFilter } : {}),
          }}
        />
        <div
          style={{
            transform: `scale(${interpolate(pill, [0, 1], [0.6, 1])})`,
            padding: `${18 * u}px ${40 * u}px`,
            backgroundColor: accent,
            color: readableOn(accent),
            fontSize: 30 * u,
            fontWeight: 800,
            letterSpacing: 1 * u,
            borderRadius: 6 * u,
          }}
        >
          {`${up(spec.cta)}  →`}
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ backgroundColor: panel, justifyContent: "center", alignItems: "flex-start", padding: `0 ${m}px`, overflow: "hidden" }}>
      <div
        style={{
          opacity: interpolate(title, [0, 0.6], [0, 1], { extrapolateRight: "clamp" }),
          transform: `translateY(${interpolate(title, [0, 1], [30, 0])}px)`,
          color: text,
          fontSize: titleSize,
          fontWeight: 800,
          lineHeight: 0.92,
          letterSpacing: -2 * u,
          maxWidth: "16ch",
          marginBottom: 40 * u,
        }}
      >
        {up(spec.headline)}
      </div>
      <div
        style={{
          transform: `scale(${interpolate(pill, [0, 1], [0.6, 1])})`,
          transformOrigin: "left",
          padding: `${18 * u}px ${40 * u}px`,
          backgroundColor: accent,
          color: readableOn(accent),
          fontSize: (portrait ? 26 : 30) * u,
          fontWeight: 800,
          letterSpacing: 1 * u,
          borderRadius: 6 * u,
        }}
      >
        {`${up(spec.cta)}  →`}
      </div>
    </AbsoluteFill>
  );
};

// Dispatch a spec scene to its kinetic beat (energetic only).
const KineticBeat: React.FC<SceneProps> = (props) => {
  switch (props.scene.type) {
    case "hook":
      return <KFlashHook {...props} />;
    case "feature":
      return <KFeature {...props} />;
    case "price":
      return <KPrice {...props} />;
    case "outro":
      return <KOutro {...props} />;
    case "benefit":
      return <KFlashHook {...props} />;
    default:
      return <KHero {...props} />;
  }
};

// ===========================================================================
// LUXE — slow, editorial, restrained. The opposite of energetic: no overshoot,
// no color-flood, no wipe. Everything eases in-out slowly; the serif tracks in
// (letter-spacing contracts); thin gold hairlines draw; a soft specular light
// glides over the product; beats cross-dissolve (content fades up over the
// shared panel). Research: luxury reads through slow ease-in-out and restraint.
// ===========================================================================

const EASE_LUX = Easing.inOut(Easing.ease);

// Slow eased 0..1 over [delay, delay+dur], authored at 30fps and fps-scaled.
function useSlow(delay: number, dur: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = fps / 30;
  return interpolate(frame, [delay * k, (delay + dur) * k], [0, 1], {
    easing: EASE_LUX,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

// Serif headline that TRACKS IN: the line fades up while its letter-spacing
// contracts from wide to set — an unhurried, couture reveal (never per-word pop).
const LuxeSerif: React.FC<{
  text: string;
  size: number;
  color: string;
  delay: number;
  u: number;
  maxWidth?: number | string;
  align?: "left" | "center";
}> = ({ text, size, color, delay, u, maxWidth, align = "left" }) => {
  const a = useSlow(delay, 34);
  return (
    <div
      style={{
        opacity: a,
        transform: `translateY(${interpolate(a, [0, 1], [size * 0.16, 0])}px)`,
        letterSpacing: interpolate(a, [0, 1], [size * 0.12, -size * 0.012]),
        color,
        fontWeight: 600,
        fontSize: size,
        lineHeight: 1.04,
        maxWidth,
        textAlign: align,
        textWrap: "balance",
      }}
    >
      {text}
    </div>
  );
};

// A soft specular highlight that glides once across the frame — light catching a
// premium surface. Subtle (low opacity, blurred, skewed).
const Specular: React.FC<{ u: number; delay?: number }> = ({ u, delay = 0 }) => {
  const g = useSlow(delay, 46);
  return (
    <div
      style={{
        position: "absolute",
        top: "-25%",
        bottom: "-25%",
        left: `${interpolate(g, [0, 1], [-45, 125])}%`,
        width: "38%",
        background: "linear-gradient(105deg, transparent, #ffffff 50%, transparent)",
        opacity: 0.1,
        filter: `blur(${18 * u}px)`,
        transform: "skewX(-12deg)",
        pointerEvents: "none",
      }}
    />
  );
};

// Small tracked gold kicker, slow fade + tracking-in.
const LuxeKicker: React.FC<{ text: string; accent: string; u: number; delay: number; align?: "left" | "center" }> = ({
  text,
  accent,
  u,
  delay,
  align = "left",
}) => {
  const a = useSlow(delay, 30);
  if (!text) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16 * u,
        opacity: a,
        justifyContent: align === "center" ? "center" : "flex-start",
      }}
    >
      <span style={{ width: interpolate(a, [0, 1], [0, 40 * u]), height: 1 * u, backgroundColor: accent }} />
      <span style={{ color: accent, fontSize: 15 * u, fontWeight: 600, letterSpacing: interpolate(a, [0, 1], [8 * u, 4 * u]) }}>
        {up(text)}
      </span>
    </div>
  );
};

// L1 · Hook — opens on the product, held quietly under a slow ken-burns and a
// single specular glide; a whispered gold kicker tracks in beneath.
const LuxeHook: React.FC<SceneProps> = ({ spec, scene, productImage, portrait }) => {
  const u = useUnit();
  const frame = useCurrentFrame();
  const { panel, accent, text } = spec.palette;
  const enter = useSlow(0, 30);
  const kb = interpolate(frame, [0, scene.frames], [1.0, 1.06], { extrapolateRight: "clamp", easing: EASE_LUX });
  const m = margin(u, portrait);
  return (
    <AbsoluteFill style={{ backgroundColor: panel, overflow: "hidden" }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", opacity: enter, transform: `scale(${kb})` }}>
          <Img
            src={productImage}
            crossOrigin="anonymous"
            style={{
              width: portrait ? "76%" : "52%",
              maxHeight: portrait ? "60%" : "72%",
              objectFit: "contain",
              filter: "drop-shadow(0 30px 60px rgba(0,0,0,0.4))",
            }}
          />
        </div>
      </AbsoluteFill>
      <Specular u={u} delay={4} />
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: portrait ? "center" : "flex-start", padding: portrait ? `0 0 ${72 * u}px` : `0 ${m}px ${66 * u}px` }}>
        <LuxeKicker text={spec.eyebrow} accent={accent} u={u} delay={10} align={portrait ? "center" : "left"} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// L2 · Hero — editorial: an oversized serif headline tracks in up top, a thin
// gold hairline draws, and the product rests on a light stage strip below.
const LuxeHero: React.FC<SceneProps> = ({ spec, scene, productImage, portrait }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, stage, accent, text, onStage } = spec.palette;
  const rule = useSlow(12, 26);
  const m = margin(u, portrait);
  const frame = useCurrentFrame();
  const kb = interpolate(frame, [0, scene.frames], [1.04, 1.0], { extrapolateRight: "clamp", easing: EASE_LUX });
  const words = spec.headline.split(" ").filter(Boolean);
  const longest = words.reduce((mx, w) => Math.max(mx, w.length), 1);
  const size = Math.min((portrait ? 72 : 100) * u, (width - 2 * m) / (longest * 0.5));
  const topH = portrait ? "50%" : "54%";
  return (
    <AbsoluteFill style={{ backgroundColor: panel }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: topH, padding: `0 ${m}px`, display: "flex", flexDirection: "column", justifyContent: "center", overflow: "hidden" }}>
        <LuxeKicker text={spec.eyebrow} accent={accent} u={u} delay={2} />
        <div style={{ height: 20 * u }} />
        <LuxeSerif text={spec.headline} size={size} color={text} delay={5} u={u} maxWidth={portrait ? "16ch" : "15ch"} />
      </div>
      <div style={{ position: "absolute", top: topH, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: m, width: interpolate(rule, [0, 1], [0, 200 * u]), height: 1.5 * u, backgroundColor: accent, zIndex: 2 }} />
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", backgroundColor: stage, backgroundImage: `linear-gradient(176deg, ${onStage}08, ${stage} 60%)` }}>
          <Img
            src={productImage}
            crossOrigin="anonymous"
            style={{ width: portrait ? "72%" : "48%", maxHeight: "82%", objectFit: "contain", transform: `scale(${kb})`, filter: "drop-shadow(0 22px 40px rgba(0,0,0,0.16))" }}
          />
          <Specular u={u} delay={6} />
        </AbsoluteFill>
      </div>
    </AbsoluteFill>
  );
};

// L3 · Price — understated value, never a slam: a tracked gold lead, a large
// serif figure that fades and settles (no overshoot), a fine gold rule.
const LuxePrice: React.FC<SceneProps> = ({ spec, scene, portrait }) => {
  const u = useUnit();
  const { panel, accent, text } = spec.palette;
  const lead = useSlow(2, 28);
  const num = useSlow(8, 32);
  const rule = useSlow(18, 26);
  const m = margin(u, portrait);
  return (
    <AbsoluteFill style={{ backgroundColor: panel, justifyContent: "center", alignItems: "flex-start", padding: `0 ${m}px` }}>
      <div style={{ opacity: lead, color: accent, fontSize: (portrait ? 20 : 24) * u, fontWeight: 600, letterSpacing: interpolate(lead, [0, 1], [8 * u, 4 * u]), marginBottom: 22 * u }}>
        {up(PRICE_LEAD[spec.tone])}
      </div>
      <div
        style={{
          opacity: num,
          transform: `scale(${interpolate(num, [0, 1], [0.96, 1])})`,
          transformOrigin: "left",
          color: text,
          fontWeight: 600,
          fontSize: (portrait ? 150 : 210) * u,
          lineHeight: 0.9,
          letterSpacing: -4 * u,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {scene.value}
      </div>
      <div style={{ marginTop: 34 * u, width: interpolate(rule, [0, 1], [0, 180 * u]), height: 1.5 * u, backgroundColor: accent }} />
    </AbsoluteFill>
  );
};

// L4 · Outro — a quiet sign-off: logo (knockout, panel-aware) or the serif name,
// a drawn gold hairline, and a tracked "SHOP NOW" link (no loud filled button).
const LuxeOutro: React.FC<SceneProps> = ({ spec, portrait, brandLogo, brandLogoKnockout }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, accent, text } = spec.palette;
  const m = margin(u, portrait);
  const inn = useSlow(3, 32);
  const rule = useSlow(14, 24);
  const cta = useSlow(20, 24);
  const words = spec.headline.split(" ").filter(Boolean);
  const longest = words.reduce((mx, w) => Math.max(mx, w.length), 1);
  const size = Math.min((portrait ? 66 : 92) * u, (width - 2 * m) / (longest * 0.5));
  const knockoutFilter = readableOn(panel) === "#ffffff" ? "brightness(0) invert(1)" : "brightness(0)";
  return (
    <AbsoluteFill style={{ backgroundColor: panel, justifyContent: "center", alignItems: "center", flexDirection: "column", padding: `0 ${m}px` }}>
      {brandLogo ? (
        <Img
          src={brandLogo}
          crossOrigin="anonymous"
          style={{ height: (portrait ? 56 : 78) * u, width: "auto", maxWidth: "64%", objectFit: "contain", opacity: inn, ...(brandLogoKnockout !== false ? { filter: knockoutFilter } : {}) }}
        />
      ) : (
        <div style={{ opacity: inn, transform: `translateY(${interpolate(inn, [0, 1], [14, 0])}px)`, color: text, fontWeight: 600, fontSize: size, lineHeight: 1.02, letterSpacing: -1 * u, textAlign: "center", maxWidth: "16ch" }}>
          {spec.headline}
        </div>
      )}
      <div style={{ marginTop: 30 * u, width: interpolate(rule, [0, 1], [0, 120 * u]), height: 1.5 * u, backgroundColor: accent }} />
      <div style={{ marginTop: 26 * u, opacity: cta, color: accent, fontSize: (portrait ? 18 : 22) * u, fontWeight: 600, letterSpacing: 5 * u }}>
        {`${up(spec.cta)}  →`}
      </div>
    </AbsoluteFill>
  );
};

// Dispatch a spec scene to its luxe beat (luxe has no feature beat).
const LuxeBeat: React.FC<SceneProps> = (props) => {
  switch (props.scene.type) {
    case "hook":
      return <LuxeHook {...props} />;
    case "price":
      return <LuxePrice {...props} />;
    case "outro":
      return <LuxeOutro {...props} />;
    case "benefit":
      return <LuxeHook {...props} />;
    default:
      return <LuxeHero {...props} />;
  }
};

// ===========================================================================
// TECHY — HUD / terminal. Monospace (JetBrains Mono), a faint measurement grid,
// scanlines, the product framed by HUD corner brackets with a crosshair callout,
// typewriter headlines with a blinking cursor, and a price that counts up like an
// odometer. Snappy and precise — engineered, not athletic. Research: tech reads
// through typewriter/terminal, scanlines, HUD panels and mechanical precision.
// ===========================================================================

// Faint measurement grid.
const TechGrid: React.FC<{ color: string; u: number }> = ({ color, u }) => (
  <AbsoluteFill
    style={{
      backgroundImage: `linear-gradient(${color}12 1px, transparent 1px), linear-gradient(90deg, ${color}12 1px, transparent 1px)`,
      backgroundSize: `${46 * u}px ${46 * u}px`,
    }}
  />
);

// CRT scanline overlay.
const Scanlines: React.FC<{ u: number }> = ({ u }) => (
  <AbsoluteFill
    style={{
      backgroundImage: `repeating-linear-gradient(0deg, rgba(255,255,255,0.035), rgba(255,255,255,0.035) ${1 * u}px, transparent ${1 * u}px, transparent ${4 * u}px)`,
      pointerEvents: "none",
    }}
  />
);

// Monospace typewriter with a blinking block cursor. `cps` = chars/second.
const Typewriter: React.FC<{
  text: string;
  delay: number;
  cps: number;
  size: number;
  color: string;
  cursor: string;
  weight?: number;
  maxWidth?: number | string;
}> = ({ text, delay, cps, size, color, cursor, weight = 500, maxWidth }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = fps / 30;
  const n = Math.max(0, Math.floor(((frame - delay * k) * cps) / fps));
  const shown = (text || "").slice(0, n);
  const done = n >= (text || "").length;
  const blink = Math.floor(frame / (fps * 0.4)) % 2 === 0;
  return (
    <div style={{ color, fontSize: size, fontWeight: weight, lineHeight: 1.18, maxWidth, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {shown}
      <span style={{ color: cursor, opacity: !done || blink ? 1 : 0 }}>▊</span>
    </div>
  );
};

// HUD corner brackets that frame a region, scaling/fading in.
const HudBrackets: React.FC<{ color: string; u: number; o: number }> = ({ color, u, o }) => {
  const L = 34 * u;
  const t = 2 * u;
  const inset = interpolate(o, [0, 1], [24 * u, 0]);
  const corner = (pos: React.CSSProperties): React.CSSProperties => ({ position: "absolute", width: L, height: L, opacity: o, ...pos });
  return (
    <>
      <div style={{ ...corner({ top: inset, left: inset }), borderTop: `${t}px solid ${color}`, borderLeft: `${t}px solid ${color}` }} />
      <div style={{ ...corner({ top: inset, right: inset }), borderTop: `${t}px solid ${color}`, borderRight: `${t}px solid ${color}` }} />
      <div style={{ ...corner({ bottom: inset, left: inset }), borderBottom: `${t}px solid ${color}`, borderLeft: `${t}px solid ${color}` }} />
      <div style={{ ...corner({ bottom: inset, right: inset }), borderBottom: `${t}px solid ${color}`, borderRight: `${t}px solid ${color}` }} />
    </>
  );
};

// Parse a price string into a countable number + its prefix/suffix/decimals.
function parsePrice(s: string): { prefix: string; num: number; suffix: string; decimals: number } | null {
  const m = String(s || "").match(/^(\D*)([\d,]+(?:\.\d+)?)(.*)$/);
  if (!m) return null;
  const num = parseFloat(m[2].replace(/,/g, ""));
  if (!Number.isFinite(num)) return null;
  return { prefix: m[1], num, suffix: m[3], decimals: (m[2].split(".")[1] || "").length };
}

// A snappy scene-relative spring for techy (fast, precise, minimal overshoot).
function useSnap(delay: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay * (fps / 30), fps, config: { damping: 22, stiffness: 200, mass: 0.6 } });
}

// T1 · Hook — a boot-up: product framed by HUD brackets over a grid + scanlines,
// with a typewriter system line reading the product in.
const TechHook: React.FC<SceneProps> = ({ spec, productImage, portrait }) => {
  const u = useUnit();
  const { panel, text } = spec.palette;
  // On a light "blueprint" panel the neon accent is illegible, so HUD ink drops
  // to the dark text colour; on a dark terminal panel it stays the neon accent.
  const accent = readableOn(panel) === "#ffffff" ? spec.palette.accent : text;
  const o = useSnap(2);
  const m = margin(u, portrait);
  return (
    <AbsoluteFill style={{ backgroundColor: panel, overflow: "hidden" }}>
      <TechGrid color={text} u={u} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", width: portrait ? "78%" : "56%", height: portrait ? "56%" : "68%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <HudBrackets color={accent} u={u} o={o} />
          <Img
            src={productImage}
            crossOrigin="anonymous"
            style={{ maxWidth: "82%", maxHeight: "82%", objectFit: "contain", opacity: interpolate(o, [0, 0.6], [0, 1], { extrapolateRight: "clamp" }), filter: "drop-shadow(0 20px 44px rgba(0,0,0,0.5))" }}
          />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "flex-end", padding: portrait ? `0 ${m}px ${70 * u}px` : `0 ${m}px ${60 * u}px` }}>
        <Typewriter text={`> ${up(spec.eyebrow)}`} delay={8} cps={22} size={(portrait ? 20 : 24) * u} color={text} cursor={accent} weight={700} />
      </AbsoluteFill>
      <Scanlines u={u} />
    </AbsoluteFill>
  );
};

// T2 · Hero — product with a crosshair-pinned coordinate readout; the headline
// types out in mono below. Grid + scanlines throughout.
const TechHero: React.FC<SceneProps> = ({ spec, scene, productImage, portrait }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, text } = spec.palette;
  const accent = readableOn(panel) === "#ffffff" ? spec.palette.accent : text;
  const frame = useCurrentFrame();
  const o = useSnap(2);
  const kb = interpolate(frame, [0, scene.frames], [1.0, 1.05], { extrapolateRight: "clamp" });
  const m = margin(u, portrait);
  const longest = spec.headline.split(" ").reduce((mx, w) => Math.max(mx, w.length), 1);
  const size = Math.min((portrait ? 40 : 52) * u, (width - 2 * m) / (Math.max(longest, 12) * 0.62));
  const cross = interpolate(o, [0, 1], [0, 1]);
  return (
    <AbsoluteFill style={{ backgroundColor: panel, overflow: "hidden" }}>
      <TechGrid color={text} u={u} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: portrait ? "flex-start" : "center", paddingTop: portrait ? "8%" : 0 }}>
        <div style={{ position: "relative" }}>
          <Img
            src={productImage}
            crossOrigin="anonymous"
            style={{ width: portrait ? "72%" : "auto", maxWidth: portrait ? "72%" : "46vw", maxHeight: portrait ? "48%" : "62%", objectFit: "contain", transform: `scale(${kb})`, filter: "drop-shadow(0 22px 48px rgba(0,0,0,0.5))" }}
          />
          {/* crosshair + coordinate tag */}
          <div style={{ position: "absolute", top: "18%", right: "6%", opacity: cross }}>
            <div style={{ width: 26 * u, height: 1.5 * u, backgroundColor: accent, position: "absolute", top: 0, left: -13 * u }} />
            <div style={{ height: 26 * u, width: 1.5 * u, backgroundColor: accent, position: "absolute", top: -13 * u, left: 0 }} />
            <div style={{ position: "absolute", left: 18 * u, top: -8 * u, color: accent, fontSize: 14 * u, fontWeight: 500, whiteSpace: "nowrap" }}>
              [ VERIFIED ]
            </div>
          </div>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "flex-end", padding: portrait ? `0 ${m}px ${76 * u}px` : `0 ${m}px ${72 * u}px` }}>
        <div style={{ color: accent, fontSize: 15 * u, fontWeight: 700, letterSpacing: 2 * u, marginBottom: 12 * u, opacity: o }}>{up(spec.eyebrow)}</div>
        <Typewriter text={spec.headline} delay={6} cps={26} size={size} color={text} cursor={accent} weight={700} maxWidth={portrait ? "100%" : "22ch"} />
      </AbsoluteFill>
      <Scanlines u={u} />
    </AbsoluteFill>
  );
};

// T3 · Feature — the spec pinned as a HUD annotation: a crosshair on the product,
// a connector, and a bracketed mono label + value.
const TechFeature: React.FC<SceneProps> = ({ spec, scene, productImage, portrait }) => {
  const u = useUnit();
  const { text, onStage } = spec.palette;
  const accent = readableOn(onStage) === "#ffffff" ? spec.palette.accent : text;
  const frame = useCurrentFrame();
  const o = useSnap(4);
  const kb = interpolate(frame, [0, scene.frames], [1.02, 1.06], { extrapolateRight: "clamp" });
  const m = margin(u, portrait);
  const line = interpolate(o, [0, 1], [0, 1]);
  return (
    <AbsoluteFill style={{ backgroundColor: onStage, overflow: "hidden" }}>
      <TechGrid color={text} u={u} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Img src={productImage} crossOrigin="anonymous" style={{ width: portrait ? "70%" : "50%", maxHeight: portrait ? "56%" : "70%", objectFit: "contain", transform: `scale(${kb})`, filter: "drop-shadow(0 22px 48px rgba(0,0,0,0.5))" }} />
      </AbsoluteFill>
      {/* dot on product + connector to the callout */}
      <div style={{ position: "absolute", left: "50%", top: portrait ? "34%" : "40%", width: 12 * u, height: 12 * u, marginLeft: -6 * u, borderRadius: "50%", backgroundColor: accent, opacity: o, boxShadow: `0 0 0 ${5 * u}px ${accent}33` }} />
      <div style={{ position: "absolute", left: m, bottom: (portrait ? 120 : 108) * u, opacity: o, transform: `translateY(${interpolate(o, [0, 1], [16 * u, 0])}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 * u, color: accent, fontSize: (portrait ? 15 : 18) * u, fontWeight: 700, marginBottom: 10 * u }}>
          <span>{`[ ${up(scene.label || spec.eyebrow)} ]`}</span>
        </div>
        <div style={{ color: text, fontSize: (portrait ? 34 : 44) * u, fontWeight: 700, lineHeight: 1.08, maxWidth: "62%", letterSpacing: -0.5 * u }}>
          {scene.value || spec.subhead}
        </div>
      </div>
      <Scanlines u={u} />
    </AbsoluteFill>
  );
};

// T4 · Price — an odometer: the figure counts up to the price in mono, under a
// system label, with a filling progress bar. Precise, not a slam.
const TechPrice: React.FC<SceneProps> = ({ spec, scene, portrait }) => {
  const u = useUnit();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = fps / 30;
  const { panel, text } = spec.palette;
  const accent = readableOn(panel) === "#ffffff" ? spec.palette.accent : text;
  const m = margin(u, portrait);
  const roll = interpolate(frame, [6 * k, 34 * k], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const label = useSnap(2);
  const p = parsePrice(scene.value ?? "");
  let display = scene.value ?? "";
  if (p) {
    const v = p.num * roll;
    const dec = roll >= 1 ? p.decimals : 0;
    display = `${p.prefix}${v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}${p.suffix}`;
  }
  return (
    <AbsoluteFill style={{ backgroundColor: panel, justifyContent: "center", alignItems: "flex-start", padding: `0 ${m}px`, overflow: "hidden" }}>
      <TechGrid color={text} u={u} />
      <div style={{ color: accent, fontSize: (portrait ? 18 : 22) * u, fontWeight: 700, letterSpacing: 3 * u, marginBottom: 18 * u, opacity: label }}>
        {`// ${up(PRICE_LEAD[spec.tone])}`}
      </div>
      <div style={{ color: text, fontWeight: 700, fontSize: (portrait ? 150 : 220) * u, lineHeight: 0.9, letterSpacing: -4 * u, fontVariantNumeric: "tabular-nums" }}>
        {display}
      </div>
      <div style={{ marginTop: 34 * u, width: portrait ? "70%" : "44%", height: 4 * u, backgroundColor: `${text}22` }}>
        <div style={{ width: `${roll * 100}%`, height: "100%", backgroundColor: accent }} />
      </div>
      <Scanlines u={u} />
    </AbsoluteFill>
  );
};

// T5 · Outro — a terminal prompt sign-off: logo/name, then `> shop now_` typing
// with a blinking cursor. Grid + scanlines.
const TechOutro: React.FC<SceneProps> = ({ spec, portrait, brandLogo, brandLogoKnockout }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, text } = spec.palette;
  const accent = readableOn(panel) === "#ffffff" ? spec.palette.accent : text;
  const m = margin(u, portrait);
  const o = useSnap(3);
  const longest = spec.headline.split(" ").reduce((mx, w) => Math.max(mx, w.length), 1);
  const size = Math.min((portrait ? 40 : 56) * u, (width - 2 * m) / (Math.max(longest, 10) * 0.62));
  const knockoutFilter = readableOn(panel) === "#ffffff" ? "brightness(0) invert(1)" : "brightness(0)";
  return (
    <AbsoluteFill style={{ backgroundColor: panel, justifyContent: "center", alignItems: "flex-start", padding: `0 ${m}px`, overflow: "hidden" }}>
      <TechGrid color={text} u={u} />
      {brandLogo ? (
        <Img src={brandLogo} crossOrigin="anonymous" style={{ height: (portrait ? 52 : 72) * u, width: "auto", maxWidth: "62%", objectFit: "contain", opacity: o, marginBottom: 34 * u, ...(brandLogoKnockout !== false ? { filter: knockoutFilter } : {}) }} />
      ) : (
        <div style={{ opacity: o, color: text, fontWeight: 700, fontSize: size, lineHeight: 1.1, letterSpacing: -0.5 * u, maxWidth: "20ch", marginBottom: 30 * u }}>
          {spec.headline}
        </div>
      )}
      <Typewriter text={`> ${up(spec.cta)}`} delay={10} cps={20} size={(portrait ? 26 : 32) * u} color={accent} cursor={accent} weight={700} />
      <Scanlines u={u} />
    </AbsoluteFill>
  );
};

const TechyBeat: React.FC<SceneProps> = (props) => {
  switch (props.scene.type) {
    case "hook":
      return <TechHook {...props} />;
    case "feature":
      return <TechFeature {...props} />;
    case "price":
      return <TechPrice {...props} />;
    case "outro":
      return <TechOutro {...props} />;
    case "benefit":
      return <TechHook {...props} />;
    default:
      return <TechHero {...props} />;
  }
};

// ===========================================================================
// CALM — soft, soothing, breathing. Newsreader serif. Nothing snaps: the product
// resolves out of a blur, a big muted colour blob drifts behind it, everything
// breathes (a slow sine drift), and type fades up gently. No hairlines, no hard
// edges, no cuts. Research: calm reads through soft blur, muted palettes, slow
// fluid movement with no hard stops. Distinct from luxe (crisp/editorial) by
// being soft/rounded/hazy rather than sharp.
// ===========================================================================

// Gentle continuous "breathing" drift (deterministic sine on the timeline).
function useBreath(ampPx: number, periodSec = 6) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return Math.sin((frame / fps) * ((2 * Math.PI) / periodSec)) * ampPx;
}

// A large, soft, blurred colour blob that drifts behind the product.
const SoftBlob: React.FC<{ color: string; u: number; delay: number; size?: string }> = ({ color, u, delay, size = "72%" }) => {
  const a = useSlow(delay, 46);
  const by = useBreath(10 * u, 9);
  return (
    <div
      style={{
        position: "absolute",
        width: size,
        aspectRatio: "1 / 1",
        borderRadius: "50%",
        background: `radial-gradient(circle, ${color}, transparent 66%)`,
        opacity: a * 0.34,
        filter: `blur(${56 * u}px)`,
        transform: `translateY(${by}px)`,
      }}
    />
  );
};

// Serif line that resolves gently: soft fade + slight rise, no tracking gimmick.
const CalmLine: React.FC<{ text: string; size: number; color: string; delay: number; u: number; maxWidth?: number | string; align?: "left" | "center"; weight?: number; opacityMax?: number }> = ({
  text,
  size,
  color,
  delay,
  u,
  maxWidth,
  align = "left",
  weight = 600,
  opacityMax = 1,
}) => {
  const a = useSlow(delay, 34);
  return (
    <div style={{ opacity: a * opacityMax, transform: `translateY(${interpolate(a, [0, 1], [18 * u, 0])}px)`, color, fontSize: size, fontWeight: weight, lineHeight: 1.18, letterSpacing: -0.5 * u, maxWidth, textAlign: align, textWrap: "balance" }}>
      {text}
    </div>
  );
};

// C1 · Hook — the product resolves out of a soft blur over a drifting blob;
// a whispered serif kicker breathes in beneath.
const CalmHook: React.FC<SceneProps> = ({ spec, productImage, portrait }) => {
  const u = useUnit();
  const { panel, accent, text } = spec.palette;
  const foc = useSlow(0, 36);
  const by = useBreath(9 * u, 8);
  const m = margin(u, portrait);
  return (
    <AbsoluteFill style={{ backgroundColor: panel, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
      <SoftBlob color={accent} u={u} delay={2} />
      <Img
        src={productImage}
        crossOrigin="anonymous"
        style={{
          width: portrait ? "74%" : "50%",
          maxHeight: portrait ? "58%" : "70%",
          objectFit: "contain",
          filter: `blur(${interpolate(foc, [0, 1], [16, 0])}px) drop-shadow(0 26px 54px rgba(0,0,0,0.26))`,
          opacity: interpolate(foc, [0, 0.5], [0, 1], { extrapolateRight: "clamp" }),
          transform: `translateY(${by}px) scale(${interpolate(foc, [0, 1], [1.04, 1])})`,
        }}
      />
      <div style={{ position: "absolute", bottom: (portrait ? 76 : 66) * u, left: portrait ? 0 : m, right: portrait ? 0 : "auto", textAlign: portrait ? "center" : "left" }}>
        <CalmLine text={up(spec.eyebrow)} size={(portrait ? 16 : 18) * u} color={accent} delay={10} u={u} align={portrait ? "center" : "left"} weight={600} />
      </div>
    </AbsoluteFill>
  );
};

// C2 · Hero — product resting over a soft blob up top, a gentle serif headline
// breathing in below. Product-forward and unhurried.
const CalmHero: React.FC<SceneProps> = ({ spec, scene, productImage, portrait }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, accent, text, stage } = spec.palette;
  const foc = useSlow(0, 34);
  const by = useBreath(8 * u, 9);
  const m = margin(u, portrait);
  const longest = spec.headline.split(" ").reduce((mx, w) => Math.max(mx, w.length), 1);
  const size = Math.min((portrait ? 60 : 82) * u, (width - 2 * m) / (longest * 0.5));
  const topH = portrait ? "54%" : "58%";
  return (
    <AbsoluteFill style={{ backgroundColor: panel }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: topH, overflow: "hidden", alignItems: "center", justifyContent: "center", display: "flex", backgroundColor: stage }}>
        <SoftBlob color={accent} u={u} delay={2} size="66%" />
        <Img
          src={productImage}
          crossOrigin="anonymous"
          style={{ width: portrait ? "66%" : "44%", maxHeight: "80%", objectFit: "contain", filter: `blur(${interpolate(foc, [0, 1], [12, 0])}px) drop-shadow(0 24px 46px rgba(0,0,0,0.18))`, transform: `translateY(${by}px)`, opacity: interpolate(foc, [0, 0.5], [0, 1], { extrapolateRight: "clamp" }) }}
        />
      </div>
      <div style={{ position: "absolute", top: topH, left: 0, right: 0, bottom: 0, padding: `0 ${m}px`, display: "flex", flexDirection: "column", justifyContent: "center", backgroundColor: panel }}>
        <CalmLine text={up(spec.eyebrow)} size={15 * u} color={accent} delay={4} u={u} weight={600} />
        <div style={{ height: 16 * u }} />
        <CalmLine text={spec.headline} size={size} color={text} delay={8} u={u} maxWidth={portrait ? "16ch" : "15ch"} />
      </div>
    </AbsoluteFill>
  );
};

// C3 · Price — quiet value: a gentle serif lead and a soft serif figure that
// fades and settles. No rule, no slam.
const CalmPrice: React.FC<SceneProps> = ({ spec, scene, portrait }) => {
  const u = useUnit();
  const { panel, accent, text } = spec.palette;
  const by = useBreath(6 * u, 9);
  const num = useSlow(8, 34);
  const m = margin(u, portrait);
  return (
    <AbsoluteFill style={{ backgroundColor: panel, justifyContent: "center", alignItems: "flex-start", padding: `0 ${m}px`, overflow: "hidden" }}>
      <SoftBlob color={accent} u={u} delay={0} size="54%" />
      <CalmLine text={PRICE_LEAD[spec.tone]} size={(portrait ? 22 : 27) * u} color={accent} delay={2} u={u} weight={600} />
      <div style={{ height: 14 * u }} />
      <div
        style={{
          opacity: num,
          transform: `translateY(${by}px) scale(${interpolate(num, [0, 1], [0.97, 1])})`,
          transformOrigin: "left",
          color: text,
          fontWeight: 600,
          fontSize: (portrait ? 140 : 196) * u,
          lineHeight: 0.92,
          letterSpacing: -3 * u,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {scene.value}
      </div>
    </AbsoluteFill>
  );
};

// C4 · Outro — a calm sign-off: logo/serif name breathing in over a soft blob,
// then a gently rounded, muted CTA pill.
const CalmOutro: React.FC<SceneProps> = ({ spec, portrait, brandLogo, brandLogoKnockout }) => {
  const u = useUnit();
  const { width } = useVideoConfig();
  const { panel, accent, text } = spec.palette;
  const m = margin(u, portrait);
  const inn = useSlow(3, 34);
  const pill = useSlow(16, 30);
  const by = useBreath(6 * u, 9);
  const longest = spec.headline.split(" ").reduce((mx, w) => Math.max(mx, w.length), 1);
  const size = Math.min((portrait ? 58 : 80) * u, (width - 2 * m) / (longest * 0.5));
  const knockoutFilter = readableOn(panel) === "#ffffff" ? "brightness(0) invert(1)" : "brightness(0)";
  return (
    <AbsoluteFill style={{ backgroundColor: panel, justifyContent: "center", alignItems: "center", flexDirection: "column", padding: `0 ${m}px`, overflow: "hidden" }}>
      <SoftBlob color={accent} u={u} delay={0} size="60%" />
      {brandLogo ? (
        <Img src={brandLogo} crossOrigin="anonymous" style={{ height: (portrait ? 54 : 76) * u, width: "auto", maxWidth: "62%", objectFit: "contain", opacity: inn, transform: `translateY(${by}px)`, ...(brandLogoKnockout !== false ? { filter: knockoutFilter } : {}) }} />
      ) : (
        <div style={{ opacity: inn, transform: `translateY(${by}px)`, color: text, fontWeight: 600, fontSize: size, lineHeight: 1.1, letterSpacing: -0.5 * u, textAlign: "center", maxWidth: "16ch" }}>
          {spec.headline}
        </div>
      )}
      <div
        style={{
          marginTop: 40 * u,
          opacity: pill,
          transform: `translateY(${interpolate(pill, [0, 1], [12, 0])}px)`,
          padding: `${16 * u}px ${38 * u}px`,
          borderRadius: 999,
          backgroundColor: accent,
          color: readableOn(accent),
          fontSize: (portrait ? 22 : 26) * u,
          fontWeight: 600,
        }}
      >
        {spec.cta}
      </div>
    </AbsoluteFill>
  );
};

const CalmBeat: React.FC<SceneProps> = (props) => {
  switch (props.scene.type) {
    case "hook":
      return <CalmHook {...props} />;
    case "price":
      return <CalmPrice {...props} />;
    case "outro":
      return <CalmOutro {...props} />;
    case "benefit":
      return <CalmHook {...props} />;
    default:
      return <CalmHero {...props} />;
  }
};

// Moods with a bespoke kinetic treatment; the rest fall back to SceneView.
const KINETIC_BEATS: Partial<Record<Tone, React.FC<SceneProps>>> = {
  energetic: KineticBeat,
  luxe: LuxeBeat,
  techy: TechyBeat,
  calm: CalmBeat,
};

// Derive a clean banded spec when none is supplied (keeps old callers working).
function fallbackSpec(props: ProductAdProps): AdSpec {
  // Same NaN/short-duration guard buildAdSpec carries: NaN propagates through
  // Math.max/round into every scene's frames, and a sub-second duration
  // rounds a scene to 0 frames — <Sequence durationInFrames={0}> throws.
  const seconds =
    Number.isFinite(props.durationInSeconds) && props.durationInSeconds >= 3
      ? props.durationInSeconds
      : 10;
  const total = Math.max(1, Math.round(seconds * FPS_APP));
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
const SceneStage: React.FC<{
  index: number;
  frames: number;
  exit: boolean;
  children: React.ReactNode;
}> = ({ index, frames, exit, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = fps / 30;
  const e = spring({ frame, fps, durationInFrames: 14 * k, config: { damping: 200 } });
  const mode = index % 3;
  // Cut-with-motion: in its last frames each beat eases out along its entry axis,
  // accelerating away (transform only — no opacity dip), so a cut reads as a
  // deliberate transition. The final scene (`exit` false) holds its frame.
  const exitWindow = 7 * k;
  const er = exit && frames > exitWindow ? Math.max(0, (frame - (frames - exitWindow)) / exitWindow) : 0;
  const ex = er * er; // ease-in → accelerate out
  const tx = mode === 0 ? interpolate(e, [0, 1], [26, 0]) : 0;
  const ty = mode === 1 ? interpolate(e, [0, 1], [22, 0]) : 0;
  // Exit is a uniform, subtle push-out (scale) — not a translate, so a leaving
  // beat never reveals a sliver of the dark panel behind a light stage scene.
  const sc = (mode === 2 ? interpolate(e, [0, 1], [0.98, 1]) : 1) + ex * 0.02;
  const opacity = interpolate(e, [0, 0.45], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ transform: `translateX(${tx}px) translateY(${ty}px) scale(${sc})`, opacity }}>
      {children}
    </AbsoluteFill>
  );
};

// Reel-safe insets (fractions of the frame). Vertical formats get a bottom-
// weighted safe frame so legible copy never lands under a platform's UI (TikTok
// covers the bottom ~17% and Reels even more); the panel-coloured margin mats
// the rest, so the ad reads as a deliberately framed reel. Landscape and square
// bleed full-frame (no reel chrome to dodge). Derived from the actual dims, so
// it's right regardless of how the composition was sized.
function safeInsets(width: number, height: number) {
  const ratio = height / width;
  if (ratio >= 1.7) return { top: 0.05, bottom: 0.17, left: 0.045, right: 0.045 }; // 9:16
  if (ratio >= 1.2) return { top: 0.035, bottom: 0.09, left: 0.03, right: 0.03 }; // 4:5
  return { top: 0, bottom: 0, left: 0, right: 0 }; // 16:9, 1:1
}

export const ProductAd: React.FC<ProductAdProps> = (props) => {
  // `spec` is z.any() in the schema; treat it as the real type so this mirror
  // type-checks like the frontend source it mirrors.
  const spec: AdSpec = (props.spec as AdSpec | undefined) ?? fallbackSpec(props);
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  const wide = width > height * 1.2; // only 16:9 — square/vertical stack
  const ins = safeInsets(width, height);
  // Moods with a bespoke kinetic treatment render through their own beat set;
  // the rest keep the original SceneView + SceneStage entry.
  const Beat = KINETIC_BEATS[spec.tone];

  let offset = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: spec.palette.panel, fontFamily: FONT_FAMILY[spec.font] }}>
      {/* Reel-safe frame: on vertical formats every scene renders inside the safe
          rectangle and the panel-coloured margin mats the rest, so copy never
          lands under a platform's UI. Landscape/square get a zero inset (full
          bleed), so this is inert for 16:9 and 1:1. */}
      <div
        style={{
          position: "absolute",
          top: ins.top * height,
          bottom: ins.bottom * height,
          left: ins.left * width,
          right: ins.right * width,
          overflow: "hidden",
        }}
      >
        {spec.scenes.map((scene, i) => {
          const from = offset;
          offset += scene.frames;
          return (
            <Sequence key={i} from={from} durationInFrames={scene.frames} layout="none">
              {Beat ? (
                <Beat
                  spec={spec}
                  scene={scene}
                  productImage={props.productImage}
                  portrait={portrait}
                  wide={wide}
                  brandLogo={props.brandLogo}
                  brandLogoKnockout={props.brandLogoKnockout}
                />
              ) : (
                <SceneStage index={i} frames={scene.frames} exit={i < spec.scenes.length - 1}>
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
              )}
            </Sequence>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
