import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { AdSpec, FontKey, Scene } from "../adSpec";

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
    '"Hanken Grotesk", "Bricolage Grotesque", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", ui-serif, "Iowan Old Style", serif',
  mono: '"SF Mono", ui-monospace, "Cascadia Code", "Roboto Mono", Menlo, monospace',
};
const EMBER = "#ff4704";

// Derive a simple banded spec when none is supplied (keeps old callers working).
function fallbackSpec(props: ProductAdProps): AdSpec {
  const total = Math.max(1, Math.round(props.durationInSeconds * 30));
  const hook = Math.round(total * 0.18);
  const outro = Math.round(total * 0.2);
  return {
    tone: "energetic",
    layout: "banded",
    palette: {
      stage: "#ffffff",
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

const Wordmark: React.FC<{ accent: string; size: number; color: string }> = ({
  accent,
  size,
  color,
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: size * 0.34,
      fontSize: size,
      fontWeight: 700,
      letterSpacing: -size * 0.02,
      color,
    }}
  >
    <span
      style={{
        width: size * 0.58,
        height: size * 0.58,
        borderRadius: size * 0.18,
        background: `linear-gradient(135deg, ${accent}, ${EMBER})`,
        boxShadow: `0 ${size * 0.12}px ${size * 0.3}px ${accent}55`,
      }}
    />
    Dart
  </div>
);

function useReveal(start: number, dur = 20, damping = 200) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - start, fps, durationInFrames: dur, config: { damping } });
}

// Product on a lit stage with a contact shadow + motion driven by the scene.
const ProductStage: React.FC<{
  src: string;
  motion: Scene["motion"];
  stage: string;
  accent: string;
  widthPct: string;
}> = ({ src, motion, stage, accent, widthPct }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: "clamp" });
  const enter = useReveal(0, 26);

  let scale = 1;
  let y = 0;
  if (motion === "kenburns-in") scale = interpolate(t, [0, 1], [1.0, 1.1]);
  else if (motion === "kenburns-out") scale = interpolate(t, [0, 1], [1.1, 1.0]);
  else if (motion === "drift") {
    scale = 1.05;
    y = interpolate(t, [0, 1], [10, -10]);
  } else if (motion === "pop") scale = interpolate(enter, [0, 1], [0.86, 1]);
  else scale = interpolate(t, [0, 1], [1.0, 1.06]); // rise

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: stage }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(50% 56% at 46% 42%, ${accent}1c, transparent 64%)`,
        }}
      />
      <div
        style={{
          position: "relative",
          width: widthPct,
          height: "76%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `translateY(${y}px) scale(${scale})`,
          opacity: enter,
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: "2%",
            width: "58%",
            height: "9%",
            borderRadius: "50%",
            background: "radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,0.3), transparent 72%)",
            filter: "blur(6px)",
          }}
        />
        <Img
          src={src}
          crossOrigin="anonymous"
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            filter: "drop-shadow(0 20px 42px rgba(0,0,0,0.13))",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

const Eyebrow: React.FC<{ text: string; accent: string; color: string; size: number; o: number }> = ({
  text,
  accent,
  color,
  size,
  o,
}) => (
  <div
    style={{
      alignSelf: "flex-start",
      opacity: o,
      transform: `translateY(${interpolate(o, [0, 1], [12, 0])}px)`,
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 16px",
      borderRadius: 999,
      border: `1px solid ${accent}59`,
      background: `${accent}1a`,
      color,
      fontSize: size,
      fontWeight: 600,
      letterSpacing: 2,
      textTransform: "uppercase",
    }}
  >
    <span style={{ width: 8, height: 8, borderRadius: 99, background: accent }} />
    {text}
  </div>
);

// --- Scenes ---------------------------------------------------------------

const HookScene: React.FC<SceneProps> = ({ spec, scene, portrait }) => {
  const r = useReveal(2, 24);
  const { panel, accent, text } = spec.palette;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(60% 60% at 50% 36%, ${accent}2e, transparent 62%), ${panel}`,
        alignItems: "center",
        justifyContent: "center",
        padding: portrait ? 80 : 120,
      }}
    >
      <div
        style={{
          opacity: r,
          transform: `translateY(${interpolate(r, [0, 1], [26, 0])}px)`,
          textAlign: "center",
          color: text,
          fontWeight: 700,
          fontSize: portrait ? 70 : 88,
          lineHeight: 1.04,
          letterSpacing: -2,
          maxWidth: "18ch",
        }}
      >
        {scene.text}
      </div>
      <div
        style={{
          marginTop: 28,
          width: interpolate(r, [0, 1], [0, 120]),
          height: 6,
          borderRadius: 99,
          background: `linear-gradient(90deg, ${accent}, ${EMBER})`,
        }}
      />
    </AbsoluteFill>
  );
};

const Copy: React.FC<{ spec: AdSpec; headline: string; portrait: boolean; onPanel: boolean }> = ({
  spec,
  headline,
  portrait,
  onPanel,
}) => {
  const eb = useReveal(8, 22);
  const tt = useReveal(16, 28);
  const sb = useReveal(26, 24);
  const { accent, text, onStage } = spec.palette;
  const color = onPanel ? text : onStage;
  return (
    <>
      <Eyebrow text={spec.eyebrow} accent={accent} color={color} size={portrait ? 18 : 17} o={eb} />
      <div
        style={{
          marginTop: 16,
          opacity: tt,
          transform: `translateY(${interpolate(tt, [0, 1], [28, 0])}px)`,
          color,
          fontWeight: 700,
          fontSize: portrait ? 60 : 64,
          lineHeight: 1.02,
          letterSpacing: -1.6,
          maxWidth: portrait ? "15ch" : "18ch",
        }}
      >
        {headline}
      </div>
      {spec.subhead ? (
        <div
          style={{
            marginTop: 16,
            opacity: sb,
            color,
            fontSize: portrait ? 24 : 24,
            lineHeight: 1.3,
            maxWidth: "26ch",
            filter: "opacity(0.85)",
          }}
        >
          {spec.subhead}
        </div>
      ) : null}
    </>
  );
};

const HeroScene: React.FC<SceneProps> = ({ spec, scene, productImage, portrait }) => {
  const { stage, panel, accent } = spec.palette;
  const split = spec.layout === "split" && !portrait;

  if (split) {
    return (
      <AbsoluteFill style={{ flexDirection: "row" }}>
        <div
          style={{
            width: "44%",
            height: "100%",
            background: `linear-gradient(180deg, ${panel}, ${panel})`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: 84,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <AbsoluteFill
            style={{ background: `radial-gradient(50% 80% at 0% 0%, ${accent}24, transparent 60%)` }}
          />
          <div style={{ position: "absolute", top: 56, left: 84 }}>
            <Wordmark accent={accent} size={30} color={spec.palette.text} />
          </div>
          <div style={{ position: "relative" }}>
            <Copy spec={spec} headline={spec.headline} portrait={false} onPanel />
          </div>
        </div>
        <div style={{ width: "56%", height: "100%" }}>
          <ProductStage src={productImage} motion={scene.motion} stage={stage} accent={accent} widthPct="74%" />
        </div>
      </AbsoluteFill>
    );
  }

  // Banded
  return (
    <AbsoluteFill style={{ background: panel }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "60%" }}>
        <ProductStage src={productImage} motion={scene.motion} stage={stage} accent={accent} widthPct={portrait ? "78%" : "60%"} />
      </div>
      <div style={{ position: "absolute", top: portrait ? 44 : 56, left: portrait ? 70 : 92 }}>
        <Wordmark accent={accent} size={portrait ? 30 : 32} color={spec.palette.onStage} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "40%",
          background: `linear-gradient(180deg, ${panel}, ${panel})`,
          padding: `0 ${portrait ? 70 : 92}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <AbsoluteFill
          style={{ background: `radial-gradient(46% 130% at 100% 0%, ${accent}24, transparent 60%)` }}
        />
        <div style={{ position: "relative" }}>
          <Copy spec={spec} headline={spec.headline} portrait={portrait} onPanel />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const FeatureScene: React.FC<SceneProps> = ({ spec, scene, productImage, portrait }) => {
  const { stage, accent, panel, text } = spec.palette;
  const r = useReveal(10, 24);
  return (
    <AbsoluteFill style={{ background: stage }}>
      <ProductStage src={productImage} motion="kenburns-in" stage={stage} accent={accent} widthPct={portrait ? "70%" : "52%"} />
      <div
        style={{
          position: "absolute",
          left: portrait ? 60 : 88,
          bottom: portrait ? 90 : 96,
          opacity: r,
          transform: `translateY(${interpolate(r, [0, 1], [20, 0])}px)`,
          background: panel,
          color: text,
          padding: "18px 24px",
          borderRadius: 16,
          borderLeft: `4px solid ${accent}`,
          boxShadow: "0 20px 50px rgba(0,0,0,0.22)",
          maxWidth: "62%",
        }}
      >
        <div style={{ fontSize: portrait ? 16 : 15, letterSpacing: 2, textTransform: "uppercase", color: accent, fontWeight: 700 }}>
          {scene.label}
        </div>
        <div style={{ marginTop: 6, fontSize: portrait ? 34 : 36, fontWeight: 700, lineHeight: 1.05 }}>
          {scene.value}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const PriceScene: React.FC<SceneProps> = ({ spec, scene, portrait }) => {
  const { panel, accent, text } = spec.palette;
  const pop = useReveal(2, 22, 14);
  const cta = useReveal(14, 22);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(70% 70% at 50% 40%, ${accent}33, transparent 60%), ${panel}`,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 28,
      }}
    >
      <div
        style={{
          transform: `scale(${interpolate(pop, [0, 1], [0.7, 1])})`,
          opacity: pop,
          padding: portrait ? "20px 40px" : "22px 48px",
          borderRadius: 22,
          background: `linear-gradient(135deg, ${accent}, ${EMBER})`,
          color: "#fff",
          fontWeight: 800,
          fontSize: portrait ? 88 : 108,
          letterSpacing: -2,
          boxShadow: `0 26px 60px ${accent}55`,
        }}
      >
        {scene.value}
      </div>
      <div
        style={{
          opacity: cta,
          color: text,
          fontSize: portrait ? 26 : 26,
          fontWeight: 600,
          letterSpacing: 1,
        }}
      >
        {spec.cta} →
      </div>
    </AbsoluteFill>
  );
};

const OutroScene: React.FC<SceneProps> = ({ spec, portrait }) => {
  const { panel, accent, text } = spec.palette;
  const r = useReveal(2, 24);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(60% 60% at 50% 38%, ${accent}33, transparent 62%), ${panel}`,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 22,
        opacity: r,
      }}
    >
      <Wordmark accent={accent} size={portrait ? 74 : 86} color={text} />
      <div style={{ color: text, opacity: 0.72, fontSize: portrait ? 23 : 22, maxWidth: "22ch", textAlign: "center" }}>
        {spec.headline}
      </div>
      <div
        style={{
          marginTop: 6,
          padding: "14px 30px",
          borderRadius: 999,
          background: `linear-gradient(135deg, ${accent}, ${EMBER})`,
          color: "#fff",
          fontWeight: 700,
          fontSize: 23,
          boxShadow: `0 18px 40px ${accent}4d`,
        }}
      >
        {spec.cta} →
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

export const ProductAd: React.FC<ProductAdProps> = (props) => {
  const spec = props.spec ?? fallbackSpec(props);
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const portrait = height > width;

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

      {/* Progress line across the whole ad */}
      <AbsoluteFill style={{ justifyContent: "flex-end" }}>
        <div style={{ height: 5, background: "#ffffff1f" }}>
          <div
            style={{
              height: "100%",
              width: `${Math.min(100, (frame / Math.max(1, total)) * 100)}%`,
              background: `linear-gradient(90deg, ${spec.palette.accent}, ${EMBER})`,
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
