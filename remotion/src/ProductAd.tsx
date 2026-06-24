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
import type { AdSpec, FontKey, Scene } from "./adSpec";

export const productAdSchema = z.object({
  productTitle: z.string(),
  productImage: z.string(),
  price: z.string(),
  audience: z.string(),
  durationInSeconds: z.number(),
  aspectRatio: z.enum(["16:9", "9:16"]),
  accent: z.string(),
  spec: z.any().optional(),
});

type ProductAdProps = z.infer<typeof productAdSchema>;

const FONTS: Record<FontKey, string> = {
  grotesque:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif:
    '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", ui-serif, serif',
  mono: '"SF Mono", ui-monospace, "Cascadia Code", "Roboto Mono", Menlo, monospace',
};

const up = (s: string) => (s || "").toUpperCase();

// Everything sizes off the short edge so 16:9 and 9:16 stay balanced.
function useUnit() {
  const { width, height } = useVideoConfig();
  return Math.min(width, height) / 1080;
}

function useReveal(start: number, dur = 22, damping = 200) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - start, fps, durationInFrames: dur, config: { damping } });
}

// --- Building blocks ------------------------------------------------------

// The product on a softly-lit studio stage: gentle gradient floor, accent
// spotlight, a grounded contact shadow, and slow life-like motion.
const ProductStage: React.FC<{
  src: string;
  motion: Scene["motion"];
  stage: string;
  onStage: string;
  accent: string;
  widthPct: string;
}> = ({ src, motion, stage, onStage, accent, widthPct }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: "clamp" });
  const enter = useReveal(0, 30, 180);

  let scale = 1;
  let y = 0;
  if (motion === "kenburns-in") scale = interpolate(t, [0, 1], [1.0, 1.09]);
  else if (motion === "kenburns-out") scale = interpolate(t, [0, 1], [1.09, 1.0]);
  else if (motion === "drift") {
    scale = 1.04;
    y = interpolate(t, [0, 1], [12, -12]);
  } else if (motion === "pop") scale = interpolate(enter, [0, 1], [0.84, 1]);
  else scale = interpolate(t, [0, 1], [1.0, 1.05]); // rise

  const entY = interpolate(enter, [0, 1], [26, 0]);

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: stage,
        backgroundImage: `linear-gradient(180deg, ${onStage}0a 0%, ${stage} 46%, ${onStage}10 100%)`,
        overflow: "hidden",
      }}
    >
      {/* accent spotlight */}
      <AbsoluteFill
        style={{ backgroundImage: `radial-gradient(46% 42% at 50% 40%, ${accent}22, transparent 70%)` }}
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
        {/* grounded contact shadow */}
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
      transform: `translateY(${interpolate(o, [0, 1], [14, 0])}px)`,
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

// Eyebrow -> headline -> subhead, staggered. Used on panels and split layouts.
const Copy: React.FC<{ spec: AdSpec; color: string; u: number; portrait: boolean }> = ({
  spec,
  color,
  u,
  portrait,
}) => {
  const eb = useReveal(6, 22);
  const tt = useReveal(13, 30, 170);
  const sb = useReveal(24, 24);
  const { accent } = spec.palette;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 * u }}>
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
        <div
          style={{
            opacity: sb,
            color,
            fontSize: 25 * u,
            lineHeight: 1.32,
            maxWidth: "30ch",
          }}
        >
          {spec.subhead}
        </div>
      ) : null}
    </div>
  );
};

// --- Scenes ---------------------------------------------------------------

const HookScene: React.FC<SceneProps> = ({ spec, scene, portrait }) => {
  const u = useUnit();
  const r = useReveal(2, 26, 170);
  const { panel, accent, text } = spec.palette;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: panel,
        backgroundImage: `radial-gradient(64% 60% at 50% 34%, ${accent}33, transparent 64%)`,
        alignItems: "center",
        justifyContent: "center",
        padding: (portrait ? 80 : 140) * u,
      }}
    >
      <div
        style={{
          opacity: r,
          transform: `translateY(${interpolate(r, [0, 1], [30, 0])}px)`,
          textAlign: "center",
          color: text,
          fontWeight: 760,
          fontSize: (portrait ? 76 : 96) * u,
          lineHeight: 1.02,
          letterSpacing: -2.4 * u,
          maxWidth: "17ch",
        }}
      >
        {scene.text}
      </div>
      <div
        style={{
          marginTop: 34 * u,
          width: interpolate(r, [0, 1], [0, 132 * u]),
          height: 5 * u,
          borderRadius: 99,
          backgroundColor: accent,
        }}
      />
    </AbsoluteFill>
  );
};

const HeroScene: React.FC<SceneProps> = ({ spec, scene, productImage, portrait }) => {
  const u = useUnit();
  const { stage, panel, accent, text, onStage } = spec.palette;
  const split = spec.layout === "split" && !portrait;

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
          {/* edge accent rule */}
          <div
            style={{ position: "absolute", left: 0, top: "18%", width: 5 * u, height: "64%", backgroundColor: accent }}
          />
          <Copy spec={spec} color={text} u={u} portrait={false} />
        </div>
        <div style={{ width: "57%", height: "100%", position: "relative", overflow: "hidden" }}>
          <ProductStage src={productImage} motion={scene.motion} stage={stage} onStage={onStage} accent={accent} widthPct="78%" />
        </div>
      </AbsoluteFill>
    );
  }

  // Banded: product on a lit stage up top, copy on a panel below.
  const stageH = portrait ? "56%" : "60%";
  return (
    <AbsoluteFill style={{ backgroundColor: panel }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: stageH }}>
        <ProductStage src={productImage} motion={scene.motion} stage={stage} onStage={onStage} accent={accent} widthPct={portrait ? "82%" : "62%"} />
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
        <Copy spec={spec} color={text} u={u} portrait={portrait} />
      </div>
    </AbsoluteFill>
  );
};

const FeatureScene: React.FC<SceneProps> = ({ spec, scene, productImage, portrait }) => {
  const u = useUnit();
  const { stage, accent, panel, text, onStage } = spec.palette;
  const r = useReveal(8, 26, 170);
  return (
    <AbsoluteFill style={{ backgroundColor: stage }}>
      <ProductStage src={productImage} motion="kenburns-in" stage={stage} onStage={onStage} accent={accent} widthPct={portrait ? "74%" : "56%"} />
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
  const { panel, accent, text } = spec.palette;
  const pop = useReveal(2, 24, 13);
  const cta = useReveal(16, 22);
  return (
    <AbsoluteFill
      style={{
        backgroundColor: panel,
        backgroundImage: `radial-gradient(72% 70% at 50% 42%, ${accent}3a, transparent 60%)`,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 30 * u,
      }}
    >
      <div
        style={{
          transform: `scale(${interpolate(pop, [0, 1], [0.72, 1])})`,
          opacity: pop,
          color: text,
          fontWeight: 800,
          fontSize: (portrait ? 116 : 140) * u,
          letterSpacing: -3 * u,
          lineHeight: 1,
        }}
      >
        {scene.value}
      </div>
      <Pill text={`${spec.cta} →`} accent={accent} u={u} o={cta} />
    </AbsoluteFill>
  );
};

const OutroScene: React.FC<SceneProps> = ({ spec, portrait }) => {
  const u = useUnit();
  const { panel, accent, text } = spec.palette;
  const r = useReveal(2, 26, 170);
  const c = useReveal(14, 22);
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
      <div
        style={{
          opacity: r,
          transform: `translateY(${interpolate(r, [0, 1], [24, 0])}px)`,
          textAlign: "center",
          color: text,
          fontWeight: 760,
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
      panel: "#0b0b12",
      accent: props.accent || "#0447ff",
      text: "#ffffff",
      onStage: "#070709",
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
            <SceneView spec={spec} scene={scene} productImage={props.productImage} portrait={portrait} />
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
