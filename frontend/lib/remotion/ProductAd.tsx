import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { AdSpec, FontKey, Scene, Tone } from "../adSpec";

export interface ProductAdProps {
  productTitle: string;
  productImage: string;
  price: string;
  audience: string;
  durationInSeconds: number;
  aspectRatio: "16:9" | "9:16";
  accent: string;
  /** Creative direction. When absent, a default banded spec is derived. */
  spec?: AdSpec;
}

const FONTS: Record<FontKey, string> = {
  grotesque:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif:
    '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", ui-serif, serif',
  mono: '"SF Mono", ui-monospace, "Cascadia Code", "Roboto Mono", Menlo, monospace',
};

const up = (s: string) => (s || "").toUpperCase();

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
  playful: { dur: 20, damping: 95, stagger: 5, prodTo: 1.07, drift: 9 }, // bouncy
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

// Product on a softly-lit studio stage: gradient floor, accent spotlight, a
// grounded contact shadow, and slow life-like motion that spans the whole scene.
const ProductStage: React.FC<{
  src: string;
  motion: Scene["motion"];
  t: Tempo;
  sceneFrames: number;
  stage: string;
  onStage: string;
  accent: string;
  widthPct: string;
}> = ({ src, motion, t, sceneFrames, stage, onStage, accent, widthPct }) => {
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
        backgroundImage: `linear-gradient(180deg, ${onStage}0a 0%, ${stage} 46%, ${onStage}12 100%)`,
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{ backgroundImage: `radial-gradient(44% 40% at 50% 40%, ${accent}22, transparent 70%)` }}
      />
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
            width: "62%",
            height: "8%",
            borderRadius: "50%",
            backgroundImage:
              "radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,0.34), transparent 72%)",
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
            filter: "drop-shadow(0 26px 48px rgba(0,0,0,0.18))",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

const Eyebrow: React.FC<{ text: string; accent: string; color: string; u: number; o: number }> = ({
  text,
  accent,
  color,
  u,
  o,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12 * u,
      opacity: o,
      transform: `translateY(${interpolate(o, [0, 1], [14, 0])}px)`,
      color,
      fontSize: 17 * u,
      fontWeight: 600,
      letterSpacing: 3 * u,
    }}
  >
    <span style={{ width: 26 * u, height: 3 * u, borderRadius: 99, backgroundColor: accent }} />
    {up(text)}
  </div>
);

const Pill: React.FC<{ text: string; accent: string; u: number; o: number }> = ({
  text,
  accent,
  u,
  o,
}) => (
  <div
    style={{
      opacity: o,
      transform: `translateY(${interpolate(o, [0, 1], [14, 0])}px) scale(${interpolate(o, [0, 1], [0.9, 1])})`,
      alignSelf: "flex-start",
      padding: `${13 * u}px ${28 * u}px`,
      borderRadius: 999,
      backgroundImage: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
      color: "#fff",
      fontWeight: 700,
      fontSize: 23 * u,
      letterSpacing: 0.4 * u,
      boxShadow: `0 ${16 * u}px ${36 * u}px ${accent}44`,
    }}
  >
    {text}
  </div>
);

// Eyebrow -> headline -> subhead, staggered at the tone's tempo, with a slow
// continuous drift so the frame keeps breathing.
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
  const { accent } = spec.palette;
  const driftY = interpolate(frame, [0, sceneFrames], [t.drift * 0.5, -t.drift * 0.5]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 * u, transform: `translateY(${driftY}px)` }}>
      <Eyebrow text={spec.eyebrow} accent={accent} color={color} u={u} o={eb} />
      <div
        style={{
          opacity: tt,
          transform: `translateY(${interpolate(tt, [0, 1], [30, 0])}px)`,
          color,
          fontWeight: 760,
          fontSize: (portrait ? 66 : 76) * u,
          lineHeight: 1.0,
          letterSpacing: -2 * u,
          maxWidth: portrait ? "15ch" : "16ch",
        }}
      >
        {spec.headline}
      </div>
      {spec.subhead ? (
        <div style={{ opacity: sb, color, fontSize: 25 * u, lineHeight: 1.32, maxWidth: "30ch" }}>
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
  return (
    <AbsoluteFill
      style={{
        backgroundColor: panel,
        backgroundImage: `radial-gradient(64% 60% at 50% 36%, ${accent}33, transparent 64%)`,
        alignItems: "center",
        justifyContent: "center",
        padding: (portrait ? 80 : 140) * u,
      }}
    >
      <KineticText
        text={scene.text || ""}
        start={2}
        t={hookT}
        fontSize={(portrait ? 76 : 96) * u}
        weight={770}
        color={text}
        letterSpacing={-2.4 * u}
        align="center"
        maxWidth={`${17}ch`}
      />
      <div
        style={{
          marginTop: 34 * u,
          width: interpolate(rule, [0, 1], [0, 132 * u]),
          height: 5 * u,
          borderRadius: 99,
          backgroundColor: accent,
        }}
      />
    </AbsoluteFill>
  );
};

// Editorial: type-dominant and asymmetric — an oversized headline owns the top,
// the product sits on a stage strip below. Inverts the banded layout for variety.
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
          backgroundImage: `radial-gradient(58% 120% at 6% 0%, ${accent}26, transparent 60%)`,
          padding: `${52 * u}px ${100 * u}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 22 * u, transform: `translateY(${driftY}px)` }}>
          <Eyebrow text={spec.eyebrow} accent={accent} color={text} u={u} o={eb} />
          <div
            style={{
              opacity: hl,
              transform: `translateY(${interpolate(hl, [0, 1], [36, 0])}px)`,
              color: text,
              fontWeight: 790,
              fontSize: 98 * u,
              lineHeight: 0.96,
              letterSpacing: -3.4 * u,
              maxWidth: "15ch",
            }}
          >
            {spec.headline}
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", top: "52%", left: 0, right: 0, bottom: 0 }}>
        <ProductStage src={productImage} motion={scene.motion} t={t} sceneFrames={scene.frames} stage={stage} onStage={onStage} accent={accent} widthPct="56%" />
      </div>
    </AbsoluteFill>
  );
};

const HeroScene: React.FC<SceneProps> = (props) => {
  const { spec, scene, productImage, portrait } = props;
  const u = useUnit();
  const t = TEMPO[spec.tone];
  const { stage, panel, accent, text, onStage } = spec.palette;
  const split = spec.layout === "split" && !portrait;
  const editorial = spec.layout === "editorial" && !portrait;

  if (editorial) return <EditorialHero {...props} />;
  if (split) {
    return (
      <AbsoluteFill style={{ flexDirection: "row", backgroundColor: panel }}>
        <div
          style={{
            width: "43%",
            height: "100%",
            backgroundColor: panel,
            backgroundImage: `radial-gradient(70% 60% at 8% 18%, ${accent}24, transparent 62%)`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: 92 * u,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{ position: "absolute", left: 0, top: "18%", width: 5 * u, height: "64%", backgroundColor: accent }}
          />
          <Copy spec={spec} color={text} u={u} portrait={false} sceneFrames={scene.frames} />
        </div>
        <div style={{ width: "57%", height: "100%", position: "relative", overflow: "hidden" }}>
          <ProductStage src={productImage} motion={scene.motion} t={t} sceneFrames={scene.frames} stage={stage} onStage={onStage} accent={accent} widthPct="78%" />
        </div>
      </AbsoluteFill>
    );
  }

  // Banded: product on a lit stage up top, copy on a panel below.
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
          backgroundImage: `radial-gradient(54% 130% at 96% 0%, ${accent}26, transparent 58%)`,
          padding: `0 ${(portrait ? 74 : 100) * u}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
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
          left: (portrait ? 60 : 96) * u,
          bottom: (portrait ? 110 : 104) * u,
          opacity: r,
          transform: `translateY(${interpolate(r, [0, 1], [24, 0])}px)`,
          backgroundColor: panel,
          color: text,
          padding: `${22 * u}px ${28 * u}px`,
          borderRadius: 18 * u,
          boxShadow: "0 26px 60px rgba(0,0,0,0.28)",
          maxWidth: "64%",
          display: "flex",
          flexDirection: "column",
          gap: 8 * u,
        }}
      >
        <div style={{ fontSize: 15 * u, letterSpacing: 2.4 * u, color: accent, fontWeight: 700 }}>
          {up(scene.label || "")}
        </div>
        <div style={{ fontSize: (portrait ? 34 : 38) * u, fontWeight: 740, lineHeight: 1.04, letterSpacing: -0.6 * u }}>
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
  const pop = spring({
    frame: useCurrentFrame() - (2 + t.stagger),
    fps: useVideoConfig().fps,
    durationInFrames: t.dur + 4,
    config: { damping: spec.tone === "playful" ? 9 : 13 },
  });
  // The price is the moment (the CTA lives in the outro). Frame it as value, not
  // a button: a tone-aware lead line over a big, confident number.
  return (
    <AbsoluteFill
      style={{
        backgroundColor: panel,
        backgroundImage: `radial-gradient(72% 70% at 50% 44%, ${accent}3a, transparent 60%)`,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 18 * u,
      }}
    >
      <div
        style={{
          opacity: lead,
          transform: `translateY(${interpolate(lead, [0, 1], [16, 0])}px)`,
          color: accent,
          fontWeight: 700,
          fontSize: (portrait ? 24 : 26) * u,
          letterSpacing: 3 * u,
        }}
      >
        {up(PRICE_LEAD[spec.tone])}
      </div>
      <div
        style={{
          transform: `scale(${interpolate(pop, [0, 1], [0.72, 1])})`,
          opacity: pop,
          color: text,
          fontWeight: 800,
          fontSize: (portrait ? 132 : 162) * u,
          letterSpacing: -3 * u,
          lineHeight: 1,
        }}
      >
        {scene.value}
      </div>
    </AbsoluteFill>
  );
};

const OutroScene: React.FC<SceneProps> = ({ spec, portrait }) => {
  const u = useUnit();
  const t = TEMPO[spec.tone];
  const { panel, accent, text } = spec.palette;
  const r = useReveal(2, t);
  const c = useReveal(14, t);
  return (
    <AbsoluteFill
      style={{
        backgroundColor: panel,
        backgroundImage: `radial-gradient(60% 60% at 50% 40%, ${accent}33, transparent 62%)`,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 28 * u,
        padding: 100 * u,
      }}
    >
      {/* Block reveal — the headline is the product title, which can be long. */}
      <div
        style={{
          opacity: r,
          transform: `translateY(${interpolate(r, [0, 1], [24, 0])}px)`,
          textAlign: "center",
          color: text,
          fontWeight: 770,
          fontSize: (portrait ? 60 : 72) * u,
          lineHeight: 1.04,
          letterSpacing: -1.8 * u,
          maxWidth: "18ch",
        }}
      >
        {spec.headline}
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Pill text={`${spec.cta} →`} accent={accent} u={u} o={c} />
      </div>
    </AbsoluteFill>
  );
};

interface SceneProps {
  spec: AdSpec;
  scene: Scene;
  productImage: string;
  portrait: boolean;
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
    eyebrow: `For ${props.audience || "everyone"}`,
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
  const spec = props.spec ?? fallbackSpec(props);
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const portrait = height > width;
  const u = Math.min(width, height) / 1080;

  let offset = 0;
  const total = spec.scenes.reduce((a, s) => a + s.frames, 0);

  return (
    <AbsoluteFill style={{ backgroundColor: spec.palette.panel, fontFamily: FONTS[spec.font] }}>
      {spec.scenes.map((scene, i) => {
        const from = offset;
        offset += scene.frames;
        return (
          <Sequence key={i} from={from} durationInFrames={scene.frames} layout="none">
            <SceneStage index={i}>
              <SceneView spec={spec} scene={scene} productImage={props.productImage} portrait={portrait} />
            </SceneStage>
          </Sequence>
        );
      })}

      {/* slim progress bar */}
      <AbsoluteFill style={{ justifyContent: "flex-end" }}>
        <div style={{ height: 4 * u, backgroundColor: "#ffffff1a" }}>
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
