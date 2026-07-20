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
            ...(knockout ? { filter: "brightness(0) invert(1)" } : {}),
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
  // The energetic mood renders through the kinetic beat set (its own motion
  // vocabulary + a signature price slam); every other mood keeps SceneView.
  const kinetic = spec.tone === "energetic";

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
              {kinetic ? (
                <KineticBeat
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
