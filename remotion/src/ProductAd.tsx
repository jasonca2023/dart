import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";

export const productAdSchema = z.object({
  productTitle: z.string(),
  productImage: z.string(),
  price: z.string(),
  audience: z.string(),
  durationInSeconds: z.number(),
  aspectRatio: z.enum(["16:9", "9:16"]),
  accent: z.string(),
});

const FONT =
  'Bricolage Grotesque, "Hanken Grotesk", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const EMBER = "#ff4704";

const Wordmark: React.FC<{ accent: string; size: number }> = ({ accent, size }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: size * 0.35,
      fontSize: size,
      fontWeight: 700,
      color: "#000",
    }}
  >
    <span
      style={{
        width: size * 0.55,
        height: size * 0.55,
        borderRadius: size * 0.16,
        background: `linear-gradient(135deg, ${accent}, ${EMBER})`,
      }}
    />
    Dart
  </div>
);

export const ProductAd: React.FC<z.infer<typeof productAdSchema>> = ({
  productTitle,
  productImage,
  price,
  audience,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const portrait = height > width;
  const pad = portrait ? 80 : 110;

  // Ken Burns on the product photo + a soft entrance.
  const imgScale = interpolate(frame, [0, durationInFrames], [1.02, 1.14]);
  const imgIn = spring({ frame, fps, durationInFrames: 28, config: { damping: 200 } });

  // Glow drift across the brand spectrum.
  const g = interpolate(frame, [0, durationInFrames], [0, 1]);

  // Eyebrow + title reveal.
  const eyebrow = interpolate(frame, [4, 20], [0, 1], { extrapolateRight: "clamp" });
  const title = spring({ frame: frame - 12, fps, durationInFrames: 28, config: { damping: 200 } });

  // Price pop near the end.
  const priceStart = durationInFrames - fps * 3;
  const priceIn = spring({
    frame: frame - priceStart,
    fps,
    durationInFrames: 22,
    config: { damping: 14, mass: 0.6 },
  });
  const priceOpacity = interpolate(frame, [priceStart, priceStart + 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Outro brand card.
  const outro = interpolate(
    frame,
    [durationInFrames - 20, durationInFrames - 6],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#fdfcfc", fontFamily: FONT }}>
      {/* Ambient brand glow */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(55% 55% at ${28 + g * 18}% ${38 + g * 8}%, ${accent}26, transparent 62%), radial-gradient(48% 48% at ${74 - g * 14}% ${70 - g * 8}%, ${EMBER}1c, transparent 60%)`,
        }}
      />

      {/* Product photo, centered, Ken Burns */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width: portrait ? "78%" : "50%",
            height: portrait ? "50%" : "70%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: imgIn,
            transform: `scale(${imgScale})`,
          }}
        >
          <Img
            src={productImage}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              filter: "drop-shadow(0 42px 90px rgba(0,0,0,0.20))",
            }}
          />
        </div>
      </AbsoluteFill>

      {/* Copy */}
      <AbsoluteFill style={{ padding: pad, justifyContent: "flex-end" }}>
        <div
          style={{
            opacity: eyebrow,
            textTransform: "uppercase",
            letterSpacing: 4,
            fontSize: portrait ? 22 : 20,
            color: accent,
            fontWeight: 600,
          }}
        >
          For {audience}
        </div>
        <div
          style={{
            transform: `translateY(${interpolate(title, [0, 1], [44, 0])}px)`,
            opacity: title,
            marginTop: 14,
            fontSize: portrait ? 64 : 80,
            fontWeight: 700,
            lineHeight: 1.03,
            letterSpacing: -1.5,
            color: "#000",
            maxWidth: "15ch",
          }}
        >
          {productTitle}
        </div>
        <div
          style={{
            marginTop: 24,
            display: "flex",
            alignItems: "baseline",
            gap: 16,
            opacity: priceOpacity,
            transform: `scale(${interpolate(priceIn, [0, 1], [0.7, 1])})`,
            transformOrigin: "left center",
          }}
        >
          <span style={{ fontSize: portrait ? 46 : 52, fontWeight: 700, color: "#000" }}>
            {price}
          </span>
          <span style={{ fontSize: 20, color: "#777169" }}>Shop now</span>
        </div>
      </AbsoluteFill>

      {/* Brand mark + progress line */}
      <AbsoluteFill style={{ padding: pad }}>
        <Wordmark accent={accent} size={30} />
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "flex-end" }}>
        <div style={{ height: 6, background: "#e5e5e5" }}>
          <div
            style={{
              height: "100%",
              width: `${(frame / durationInFrames) * 100}%`,
              background: `linear-gradient(90deg, ${accent}, ${EMBER})`,
            }}
          />
        </div>
      </AbsoluteFill>

      {/* Outro card */}
      <AbsoluteFill
        style={{
          backgroundColor: "#fdfcfc",
          opacity: outro,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Wordmark accent={accent} size={84} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
